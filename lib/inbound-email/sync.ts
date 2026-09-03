import { ImapFlow } from "imapflow"
import { simpleParser } from "mailparser"
import { createEmailBookingFromParsedDraft } from "@/lib/inbound-email/import-booking"
import { decryptCredential } from "@/lib/inbound-email/crypto"
import { createRawEmailPreview, htmlToPlainText } from "@/lib/inbound-email/html"
import { findMatchingInboundSubjectRule, type InboundSubjectRule } from "@/lib/inbound-email/rules"
import { assessEnquiryPlausibility, getEmailImportReviewMetadata } from "@/lib/inbound-email/review"
import { countRequiredComplete, parseEmailDraft, type ParseEmailDraftOptions } from "@/lib/import/parseEmailDraft"
import type { SupplierMatcher } from "@/lib/suppliers/match-phrases"
import { createServiceClient } from "@/lib/supabase/server"
import { logError } from "@/lib/error-log"
import type { Database } from "@/lib/supabase/types"

type ServiceClient = ReturnType<typeof createServiceClient>
type AccountRow = Database["public"]["Tables"]["inbound_email_accounts"]["Row"]
type RuleRow = Pick<
  Database["public"]["Tables"]["inbound_email_rules"]["Row"],
  "id" | "name" | "subject_pattern" | "match_type" | "active"
>

export interface EmailSyncSummary {
  scannedCount: number
  importedCount: number
  needsReviewCount: number
  duplicateCount: number
  /** Claimed by a subject rule but too empty to be an enquiry -- see assessEnquiryPlausibility. */
  skippedNotEnquiryCount: number
  errors: string[]
}

export interface TestConnectionResult {
  ok: boolean
  mailboxCount?: number
  error?: string
}

// Bounds how many candidate UIDs a single sync invocation will fetch and import. Keeps the run
// short (the IMAP connection for the collect phase is only open for the search+fetch below, not
// for the whole import), and lets a large backlog drain safely across successive cron runs
// instead of risking a platform timeout mid-run. The wall-clock budget below is the real guard --
// this only bounds how much the collect phase downloads before the import phase gets a look in.
const MAX_UIDS_PER_RUN = 25

// Import measures at roughly 8s/message in production (parse, booking creation, several DB round
// trips), against the 60s ceiling declared by the cron route. A run that overruns is killed by the
// platform mid-message, which is exactly the case that used to lose an enquiry -- so stop
// voluntarily with time to spare, and never start a message we cannot expect to finish.
const RUN_BUDGET_MS = 45_000
const PER_MESSAGE_HEADROOM_MS = 12_000

// How many times a UID is re-imported before it is left for a human. Bounded so a message that
// fails for a reason no retry can fix (an unparseable body, a reference that will never resolve)
// cannot consume the whole budget on every run forever.
const MAX_IMPORT_ATTEMPTS = 3

export interface SyncDeadline {
  /** Epoch milliseconds after which no further message should be started. */
  readonly endsAt: number
}

export function createSyncDeadline(budgetMs: number = RUN_BUDGET_MS): SyncDeadline {
  return { endsAt: Date.now() + budgetMs }
}

function budgetExhausted(deadline: SyncDeadline): boolean {
  return Date.now() >= deadline.endsAt
}

function hasHeadroomForMessage(deadline: SyncDeadline): boolean {
  return deadline.endsAt - Date.now() >= PER_MESSAGE_HEADROOM_MS
}

// A claimed-but-never-finished message (process crashed between the claim insert and the booking
// being recorded) is left at status "processing" forever otherwise -- and, because the dedupe
// check only looks at row existence, it would silently block that UID from ever being retried.
const STALE_PROCESSING_MS = 60 * 60 * 1000

interface CollectedMessage {
  uid: number
  source: Buffer
  /** IMAP INTERNALDATE -- when the message landed in the mailbox. Only used when the message
   * carries no usable `Date:` header of its own. */
  internalDate?: Date
  /** Present when this message is a retry of a row that already exists, rather than a first
   * sighting. The import phase updates that row instead of claiming a new one. */
  existingRow?: ExistingMessageRow
}

interface ExistingMessageRow {
  id: string
  attempts: number
}

interface CollectedBatch {
  uidvalidity: number
  /**
   * Every UID this run took responsibility for, ascending -- both the ones fetched and the ones
   * already recorded by an earlier run. The cursor may only advance over the leading run of these
   * that ended with a row (see highestSettledUid), so a UID can never drop below the cursor
   * unaccounted for.
   */
  candidateUids: number[]
  messages: CollectedMessage[]
  /** The budget cut the fetch short, so there is known work left in the mailbox. */
  truncated: boolean
}

function mapRule(row: RuleRow): InboundSubjectRule {
  return {
    id: row.id,
    name: row.name,
    subjectPattern: row.subject_pattern,
    matchType: row.match_type === "exact" || row.match_type === "regex" ? row.match_type : "contains",
    active: row.active,
  }
}

function createImapClient(account: AccountRow): ImapFlow {
  // The seeded demo mailbox carries a placeholder ('demo-no-real-credentials'), not a v1 envelope,
  // and it ships disabled -- but enabling it used to surface as a bare "Unsupported encrypted
  // credential format" with nothing pointing at the cause. Say what to do about it instead.
  if (!account.password_encrypted?.startsWith("v1:")) {
    throw new Error(
      `Mailbox ${account.email} has no stored credential (or one saved before encryption) -- re-enter its password in Settings before enabling sync.`,
    )
  }

  return new ImapFlow({
    host: account.host,
    port: account.port,
    secure: account.tls_mode === "ssl_tls",
    doSTARTTLS: account.tls_mode === "starttls",
    auth: {
      user: account.username,
      pass: decryptCredential(account.password_encrypted),
    },
    logger: false,
  })
}

async function closeImapClient(client: ImapFlow): Promise<void> {
  if (client.usable) {
    await client.logout()
  } else {
    client.close()
  }
}

async function ensureMailbox(client: ImapFlow, folder: string): Promise<void> {
  try {
    await client.mailboxCreate(folder)
  } catch {
    // Existing folders and servers without CREATE support are non-fatal here.
  }
}

export interface MessageBodySelection {
  body: string
  /** Which candidate was parsed. "none" when the message carried neither part. */
  part: "text" | "html" | "none"
  /**
   * The candidate that was NOT chosen (flattened, same as `body` would have been), or "" when
   * there was only one candidate (or none) to choose from. Kept only so the rejected side of a
   * close call can be recorded for diagnosis -- see inbound_email_messages.alt_body_preview.
   */
  altBody: string
}

/**
 * Picks whichever body candidate the parser can actually read, instead of trusting `text/plain`
 * unconditionally. That used to be safe because the only mailbox this ran against (a personal
 * Gmail test account) always delivered a clean, line-broken text part. Production's mailbox
 * (info@sarail.co.za) delivers a `text/plain` alternative that some upstream converter has
 * flowed into hard-wrapped paragraphs -- no label ever owns its own line, so the label-driven
 * extractors in parseEmailDraft come back empty (name, country, adults, suite type all missed;
 * see the production incident this fixed: job LTT-2026-0034). The `text/html` alternative in the
 * SAME message is still the intact Gravity Forms table, and htmlToPlainText already flattens it
 * into the one-cell-per-line shape the parser wants -- it was just never being tried.
 *
 * Both candidates are parsed and scored with the same countRequiredComplete() the import gate
 * uses, and the higher-scoring one wins. A tie keeps `text`, so a message with a good text part
 * behaves exactly as before.
 */
export function getMessageBody(
  text: string | false | undefined,
  html: string | false | undefined,
  options?: ParseEmailDraftOptions,
): MessageBodySelection {
  const textBody = typeof text === "string" && text.trim() ? text : ""
  const htmlBody = typeof html === "string" && html.trim() ? htmlToPlainText(html) : ""

  if (!textBody && !htmlBody) return { body: "", part: "none", altBody: "" }
  if (!textBody) return { body: htmlBody, part: "html", altBody: "" }
  if (!htmlBody) return { body: textBody, part: "text", altBody: "" }

  const textScore = countRequiredComplete(parseEmailDraft(textBody, options)).completed
  const htmlScore = countRequiredComplete(parseEmailDraft(htmlBody, options)).completed

  return htmlScore > textScore
    ? { body: htmlBody, part: "html", altBody: textBody }
    : { body: textBody, part: "text", altBody: htmlBody }
}

function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505"
}

async function loadActiveRules(supabase: ServiceClient): Promise<InboundSubjectRule[]> {
  const { data, error } = await supabase
    .from("inbound_email_rules")
    .select("id, name, subject_pattern, match_type, active")
    .eq("active", true)
    .order("created_at", { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []).map(mapRule)
}

// Loaded once per sync run (not per message) and threaded into parseEmailDraft so a newly ticked
// supplier is recognised without a code change -- see ParseEmailDraftOptions. Covers every
// supplier that may head a booking of its own: train operators, and hotels sold standalone such as
// Kruger Shalati, whose enquiries are stays rather than journeys.
async function loadStandaloneSupplierMatchers(supabase: ServiceClient): Promise<SupplierMatcher[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("name, kind, email_match_phrases")
    .eq("sells_standalone", true)
    .eq("active", true)

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    name: row.name,
    kind: row.kind,
    emailMatchPhrases: row.email_match_phrases,
  }))
}

function firstSyncSinceDate(): Date {
  const since = new Date()
  since.setDate(since.getDate() - 30)
  return since
}

async function getCandidateUids(client: ImapFlow, account: AccountRow): Promise<number[]> {
  if (!account.first_sync_completed) {
    const result = await client.search({ since: firstSyncSinceDate() }, { uid: true })
    return result === false ? [] : result
  }

  const startUid = Math.max((account.last_seen_uid ?? 0) + 1, 1)
  const result = await client.search({ uid: `${startUid}:*` }, { uid: true })
  return result === false ? [] : result
}

// A message that got stuck at status "processing" was claimed (a row exists, so the dedupe check
// treats the UID as spoken for) but the process died before the booking result was recorded --
// crash, deploy, function kill. There's no way to safely resume it: the booking may or may not
// have been created. Mark it failed so it stops silently blocking the UID and shows up for a
// human to check, rather than leaving it in limbo forever.
async function healStaleClaims(supabase: ServiceClient, account: AccountRow): Promise<void> {
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS).toISOString()
  const { data: stale, error } = await supabase
    .from("inbound_email_messages")
    .select("id, uid")
    .eq("email_account_id", account.id)
    .eq("status", "processing")
    .lt("created_at", staleBefore)

  if (error) throw new Error(`Stale-claim lookup failed: ${error.message}`)
  if (!stale || stale.length === 0) return

  const { error: updateError } = await supabase
    .from("inbound_email_messages")
    .update({
      status: "failed",
      // Also take it out of the filing pass -- we don't know whether a booking was actually
      // created for it, so there's nothing safe to file, and leaving filing_status untouched
      // would let fileOutstandingMessages pick it up and overwrite this diagnostic error.
      filing_status: "not_applicable",
      // Deliberately exhausted: a stuck claim can sit on either side of booking creation (one
      // observed in production had a real booking, another had none), so auto-retrying it risks a
      // duplicate booking. Park it at the retry ceiling instead -- it stays visible as failed and
      // a human decides.
      attempts: MAX_IMPORT_ATTEMPTS,
      error: "Stuck in processing for over an hour -- sync likely crashed mid-import. Verify whether a booking was created before retrying.",
    })
    .in("id", stale.map((row) => row.id))

  if (updateError) throw new Error(`Stale-claim update failed: ${updateError.message}`)

  void logError({
    severity: "Warning",
    source: "inbound-email-sync",
    message: "Recovered stale processing claim(s)",
    details: { accountId: account.id, uids: stale.map((row) => row.uid) },
  })
}

// Batched replacement for a per-UID existence check: one query for the whole candidate batch
// instead of one round trip per message.
async function filterAlreadyProcessed(
  supabase: ServiceClient,
  account: AccountRow,
  uidvalidity: number,
  candidateUids: number[],
  summary: EmailSyncSummary,
): Promise<number[]> {
  if (candidateUids.length === 0) return []

  const { data: existing, error } = await supabase
    .from("inbound_email_messages")
    .select("uid")
    .eq("email_account_id", account.id)
    .eq("uidvalidity", uidvalidity)
    .in("uid", candidateUids)

  if (error) throw new Error(`Duplicate-check query failed: ${error.message}`)

  const existingUids = new Set((existing ?? []).map((row) => row.uid))
  if (existingUids.size === 0) return candidateUids

  summary.duplicateCount += existingUids.size
  void logError({
    severity: "Info",
    source: "inbound-email-sync",
    message: "Duplicate emails ignored",
    details: { accountId: account.id, uids: Array.from(existingUids) },
  })
  return candidateUids.filter((uid) => !existingUids.has(uid))
}

async function updateRun(
  supabase: ServiceClient,
  runId: string,
  status: "success" | "partial" | "failed",
  summary: EmailSyncSummary,
  error?: string,
): Promise<void> {
  await supabase
    .from("inbound_email_sync_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      scanned_count: summary.scannedCount,
      imported_count: summary.importedCount,
      needs_review_count: summary.needsReviewCount,
      duplicate_count: summary.duplicateCount,
      error: error ?? (summary.errors.length > 0 ? summary.errors.join("\n") : null),
    })
    .eq("id", runId)
}

/**
 * The cursor may only move over the leading run of candidate UIDs that ended this run with a row.
 * Stopping at the first unaccounted UID is what makes truncation safe: whatever the budget cut
 * short stays above the cursor and is picked up by the next run, instead of being skipped past.
 * Failed and dropped messages do have rows, so they do not stall the cursor -- the retry pass owns
 * them from that point on.
 */
function highestSettledUid(candidateUids: number[], settledUids: Set<number>, previous: number): number {
  let cursor = previous
  for (const uid of candidateUids) {
    if (!settledUids.has(uid)) break
    if (uid > cursor) cursor = uid
  }
  return cursor
}

export async function testInboundEmailConnection(account: AccountRow): Promise<TestConnectionResult> {
  const client = createImapClient(account)

  try {
    await client.connect()
    const mailboxes = await client.list()
    return { ok: true, mailboxCount: mailboxes.length }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Connection failed",
    }
  } finally {
    await closeImapClient(client)
  }
}

// Phase A -- collect. Opens a connection just long enough to search and download the raw source
// of each candidate message, then closes it. Deliberately does NOT parse, write to the database,
// or do anything else IMAP-unrelated while the fetch generator is open: imapflow's own docs warn
// that running other commands inside a `client.fetch()` loop can deadlock the connection, and the
// slow work (parsing, booking creation, several DB round trips) that used to happen inside that
// loop is exactly what left the socket sitting open long enough to be dropped mid-run in production.
async function collectCandidateMessages(
  account: AccountRow,
  supabase: ServiceClient,
  summary: EmailSyncSummary,
  runId: string,
  deadline: SyncDeadline,
  settledUids: Set<number>,
): Promise<CollectedBatch> {
  const client = createImapClient(account)

  try {
    await client.connect()
    await ensureMailbox(client, account.processed_folder)
    await ensureMailbox(client, account.needs_review_folder)
    const mailbox = await client.mailboxOpen(account.inbox_folder)
    const uidvalidity = Number(mailbox.uidValidity)

    await healStaleClaims(supabase, account)

    // Retries come first. They are the only work that can sit below the cursor, and a steady
    // trickle of new mail must never starve a message that has already failed once.
    const retries = await collectRetryCandidates(client, supabase, account, uidvalidity, deadline)

    const rawCandidates = await getCandidateUids(client, account)
    const candidateUids = rawCandidates.slice().sort((a, b) => a - b).slice(0, MAX_UIDS_PER_RUN)
    const freshUids = await filterAlreadyProcessed(supabase, account, uidvalidity, candidateUids, summary)

    // Whatever the duplicate check filtered out already has a row, so it is accounted for and the
    // cursor is free to move over it.
    const freshUidSet = new Set(freshUids)
    for (const uid of candidateUids) {
      if (!freshUidSet.has(uid)) settledUids.add(uid)
    }

    const messages: CollectedMessage[] = [...retries]
    const collected = new Set<number>()
    let truncated = false

    if (freshUids.length > 0 && !budgetExhausted(deadline)) {
      for await (const message of client.fetch(freshUids, { uid: true, source: true, internalDate: true }, { uid: true })) {
        if (message.uid && message.source) {
          // imapflow types internalDate as `string | Date` -- normalise to a Date, dropping anything
          // unparseable so a bad value can never reach `.toISOString()`.
          const internalDate = message.internalDate ? new Date(message.internalDate) : undefined
          collected.add(message.uid)
          messages.push({
            uid: message.uid,
            source: message.source,
            internalDate: internalDate && !Number.isNaN(internalDate.getTime()) ? internalDate : undefined,
          })
        }
        if (budgetExhausted(deadline)) {
          truncated = true
          break
        }
      }
    } else if (freshUids.length > 0) {
      truncated = true
    }

    // A UID the server did not hand back a usable body for is recorded rather than skipped. The
    // cursor advances over recorded UIDs, so without a row this message would be gone with no
    // trace anywhere -- which is precisely how enquiries used to disappear. Only do this for a
    // complete pass: when the budget cut the fetch short the remaining UIDs were never attempted,
    // and leaving them unsettled is what holds the cursor back for the next run.
    if (!truncated) {
      const dropped = freshUids.filter((uid) => !collected.has(uid))
      for (const uid of dropped) {
        const { error: dropError } = await supabase.from("inbound_email_messages").insert({
          email_account_id: account.id,
          sync_run_id: runId,
          booking_id: null,
          uidvalidity,
          uid,
          message_id: null,
          subject: "(message source not returned by server)",
          from_address: null,
          received_at: null,
          status: "fetch_failed",
          filing_status: "not_applicable",
          missing_fields: [],
          warnings: [],
          raw_preview: null,
          attempts: 0,
          error: "IMAP fetch returned no usable source for this UID; queued for retry.",
        })

        if (dropError && !isUniqueViolation(dropError)) {
          summary.errors.push(`Failed to record dropped fetch for UID ${uid}: ${dropError.message}`)
          continue
        }
        settledUids.add(uid)
      }
    }

    return { uidvalidity, candidateUids, messages, truncated }
  } finally {
    await closeImapClient(client)
  }
}

// Re-fetches UIDs that a previous run recorded but could not import. Deliberately keyed off the
// message rows rather than the account cursor: a failed UID is usually already below it, so the
// normal `uid > last_seen_uid` search would never look at it again.
async function collectRetryCandidates(
  client: ImapFlow,
  supabase: ServiceClient,
  account: AccountRow,
  uidvalidity: number,
  deadline: SyncDeadline,
): Promise<CollectedMessage[]> {
  if (!hasHeadroomForMessage(deadline)) return []

  const { data: rows, error } = await supabase
    .from("inbound_email_messages")
    .select("id, uid, attempts")
    // A row that already points at a booking is never retried -- that would duplicate the booking.
    .is("booking_id", null)
    .eq("email_account_id", account.id)
    .eq("uidvalidity", uidvalidity)
    .in("status", ["failed", "fetch_failed"])
    .lt("attempts", MAX_IMPORT_ATTEMPTS)
    .order("uid", { ascending: true })
    .limit(MAX_UIDS_PER_RUN)

  if (error) throw new Error(`Retry lookup failed: ${error.message}`)
  if (!rows || rows.length === 0) return []

  const byUid = new Map(rows.map((row) => [row.uid, { id: row.id, attempts: row.attempts ?? 0 }]))
  const uids = Array.from(byUid.keys())
  const messages: CollectedMessage[] = []
  const seen = new Set<number>()
  let truncated = false

  for await (const message of client.fetch(uids, { uid: true, source: true, internalDate: true }, { uid: true })) {
    if (message.uid) {
      seen.add(message.uid)
      const existingRow = byUid.get(message.uid)
      if (message.source && existingRow) {
        const internalDate = message.internalDate ? new Date(message.internalDate) : undefined
        messages.push({
          uid: message.uid,
          source: message.source,
          internalDate: internalDate && !Number.isNaN(internalDate.getTime()) ? internalDate : undefined,
          existingRow,
        })
      }
    }
    if (budgetExhausted(deadline)) {
      truncated = true
      break
    }
  }

  // A UID the inbox no longer holds cannot be retried by this pass -- it was filed, moved or
  // deleted outside of sync. Park it at the retry ceiling with a reason instead of looking it up
  // on every future run.
  if (!truncated) {
    const goneIds = uids.filter((uid) => !seen.has(uid)).map((uid) => byUid.get(uid)?.id).filter((id): id is string => Boolean(id))
    if (goneIds.length > 0) {
      await supabase
        .from("inbound_email_messages")
        .update({
          attempts: MAX_IMPORT_ATTEMPTS,
          error: "Queued for retry but no longer present in the inbox (moved, filed or deleted outside of sync).",
        })
        .in("id", goneIds)
    }
  }

  return messages
}

// Phase B -- import. Runs with no IMAP connection open at all. For each message: claim the UID
// (insert a row) before creating a booking, so a crash after the claim can never race a retry
// into creating a second booking for the same email -- the unique key on
// (email_account_id, uidvalidity, uid) makes the claim atomic. If booking creation itself fails,
// the claim is safe to delete (nothing was created) so the next run retries it, matching how this
// always behaved before claiming existed.
async function importCollectedMessages(
  messages: CollectedMessage[],
  account: AccountRow,
  supabase: ServiceClient,
  rules: InboundSubjectRule[],
  runId: string,
  uidvalidity: number,
  summary: EmailSyncSummary,
  standaloneSuppliers: SupplierMatcher[],
  deadline: SyncDeadline,
  settledUids: Set<number>,
): Promise<boolean> {
  for (const { uid, source, internalDate, existingRow } of messages) {
    // Stop before starting work there is no time to finish. A message abandoned part-way is the
    // one failure this whole design exists to prevent: the platform kills the function, the row is
    // left mid-flight and the enquiry has no booking.
    if (!hasHeadroomForMessage(deadline)) return true

    summary.scannedCount += 1
    const parsedMail = await simpleParser(source)
    const subject = parsedMail.subject?.trim() || "(no subject)"
    const messageId = parsedMail.messageId ?? null
    const fromAddress = parsedMail.from?.text ?? null
    // The message's own `Date:` header is the email's time and always wins. INTERNALDATE (when the
    // message landed in the mailbox) only rescues mail that arrived without a readable header --
    // without it those imports showed no received time at all.
    const receivedAt = parsedMail.date?.toISOString() ?? internalDate?.toISOString() ?? null

    // A UID is not a stable identity. A message that leaves the INBOX and comes back returns with a
    // new one, and UID-only dedupe reads that as new mail -- which is how fourteen enquiries were
    // imported a second time in one morning (LTT-2026-0032..0045). The RFC Message-ID survives a
    // move, a re-delivery and a UIDVALIDITY reset, so it is checked before anything is claimed.
    // Only terminal imported rows count as "already handled": a previous failure must stay retryable.
    if (messageId) {
      const { data: priorImport, error: priorError } = await supabase
        .from("inbound_email_messages")
        .select("id, uid, booking_id")
        .eq("email_account_id", account.id)
        .eq("message_id", messageId)
        .in("status", ["imported_complete", "imported_needs_review"])
        .neq("uid", uid)
        .limit(1)
        .maybeSingle()

      if (priorError) {
        summary.errors.push(`Duplicate Message-ID check failed for UID ${uid}: ${priorError.message}`)
        continue
      }

      if (priorImport) {
        const note = priorImport.booking_id
          ? `Same Message-ID as UID ${priorImport.uid} (booking ${priorImport.booking_id}) -- already imported, so no second booking was created.`
          : `Same Message-ID as UID ${priorImport.uid} -- already imported, so no second booking was created.`

        // Left where it is rather than filed: the cursor advances over it either way, so it is not
        // re-examined unless the same mail turns up yet again under a third UID.
        const { error: duplicateError } = existingRow
          ? await supabase
              .from("inbound_email_messages")
              .update({
                sync_run_id: runId,
                status: "skipped_duplicate_message",
                filing_status: "not_applicable",
                subject,
                error: note,
              })
              .eq("id", existingRow.id)
          : await supabase.from("inbound_email_messages").insert({
              email_account_id: account.id,
              sync_run_id: runId,
              booking_id: null,
              uidvalidity,
              uid,
              message_id: messageId,
              subject,
              from_address: fromAddress,
              received_at: receivedAt,
              status: "skipped_duplicate_message",
              filing_status: "not_applicable",
              missing_fields: [],
              warnings: [],
              raw_preview: null,
              error: note,
            })

        if (duplicateError && !isUniqueViolation(duplicateError)) {
          summary.errors.push(`Failed to record duplicate Message-ID for UID ${uid}: ${duplicateError.message}`)
          continue
        }

        summary.duplicateCount += 1
        settledUids.add(uid)
        continue
      }
    }

    const matchingRule = findMatchingInboundSubjectRule(subject, rules)

    if (!matchingRule) {
      // No active rule claimed this subject. Previously this just skipped the message with no
      // record at all -- and by the time anyone noticed, the sync cursor had already advanced
      // past its UID, making it permanently unrecoverable. Recording a row keeps it visible and
      // makes it count toward the dedupe check like every other message.
      const { error: skipError } = existingRow
        ? await supabase
            .from("inbound_email_messages")
            .update({
              sync_run_id: runId,
              status: "skipped_no_rule",
              filing_status: "not_applicable",
              subject,
              error: null,
            })
            .eq("id", existingRow.id)
        : await supabase.from("inbound_email_messages").insert({
            email_account_id: account.id,
            sync_run_id: runId,
            booking_id: null,
            uidvalidity,
            uid,
            message_id: messageId,
            subject,
            from_address: fromAddress,
            received_at: receivedAt,
            status: "skipped_no_rule",
            filing_status: "not_applicable",
            missing_fields: [],
            warnings: [],
            raw_preview: null,
          })
      if (skipError && !isUniqueViolation(skipError)) {
        summary.errors.push(`Failed to record skipped message for UID ${uid}: ${skipError.message}`)
        continue
      }
      settledUids.add(uid)
      continue
    }

    // Attempts are counted at claim time, not on failure: a run killed by the platform between
    // here and the result would otherwise leave the counter untouched and retry forever.
    const attempts = (existingRow?.attempts ?? 0) + 1
    let claimId: string

    if (existingRow) {
      // Retry of a row an earlier run recorded. Re-claiming it (rather than inserting) keeps the
      // unique key intact, so the retry still cannot race a concurrent run into a second booking.
      const { error: reclaimError } = await supabase
        .from("inbound_email_messages")
        .update({
          sync_run_id: runId,
          status: "processing",
          filing_status: "filing_failed",
          attempts,
          message_id: messageId,
          subject,
          from_address: fromAddress,
          received_at: receivedAt,
          error: null,
        })
        .eq("id", existingRow.id)

      if (reclaimError) {
        summary.errors.push(`Failed to re-claim UID ${uid}: ${reclaimError.message}`)
        continue
      }
      claimId = existingRow.id
    } else {
      const { data: claim, error: claimError } = await supabase
        .from("inbound_email_messages")
        .insert({
          email_account_id: account.id,
          sync_run_id: runId,
          booking_id: null,
          uidvalidity,
          uid,
          message_id: messageId,
          subject,
          from_address: fromAddress,
          received_at: receivedAt,
          status: "processing",
          filing_status: "filing_failed",
          missing_fields: [],
          warnings: [],
          raw_preview: null,
          attempts,
        })
        .select("id")
        .single()

      if (claimError || !claim) {
        // A unique violation means another (concurrent) run already claimed this UID -- leave it
        // for that run to finish. A row exists either way, so it stays accounted for. Anything
        // else is a real failure worth surfacing, and leaves the UID unsettled on purpose.
        if (!isUniqueViolation(claimError)) {
          summary.errors.push(`Failed to claim UID ${uid}: ${claimError?.message ?? "unknown error"}`)
          continue
        }
        settledUids.add(uid)
        continue
      }
      claimId = claim.id
    }

    // The subject travels with the body: a Gravity Forms notification names the form -- and so the
    // supplier -- only in its subject line, and a Kruger Shalati body never states the property.
    const parseOptions = { standaloneSuppliers, subject }
    const bodySelection = getMessageBody(parsedMail.text, parsedMail.html, parseOptions)
    const rawText = bodySelection.body
    const parsedDraft = parseEmailDraft(rawText, parseOptions)
    const review = getEmailImportReviewMetadata(parsedDraft)
    const altBodyPreview = bodySelection.altBody ? createRawEmailPreview(bodySelection.altBody) : null

    // Content gate. The subject rule got this far; the body decides whether anything is created.
    // A message that fails here is left claimed and recorded with its preview, so it is visible,
    // counted for dedupe, and never re-imported -- but no customer, booking or quote exists for it.
    const plausibility = assessEnquiryPlausibility(parsedDraft)
    if (!plausibility.importable) {
      const { error: skipError } = await supabase
        .from("inbound_email_messages")
        .update({
          status: "skipped_not_an_enquiry",
          filing_status: "not_applicable",
          missing_fields: review.missingFields,
          warnings: review.warnings,
          raw_preview: createRawEmailPreview(rawText),
          body_part: bodySelection.part,
          alt_body_preview: altBodyPreview,
          error: plausibility.reason,
        })
        .eq("id", claimId)

      if (skipError) {
        summary.errors.push(`Failed to record non-enquiry for UID ${uid}: ${skipError.message}`)
      }
      summary.skippedNotEnquiryCount += 1
      settledUids.add(uid)
      continue
    }

    let created: Awaited<ReturnType<typeof createEmailBookingFromParsedDraft>>
    try {
      created = await createEmailBookingFromParsedDraft(parsedDraft, {
        emailAccountId: account.id,
        mailboxEmail: account.email,
        subject,
        receivedAt,
        rawText,
        missingFields: review.missingFields,
        warnings: review.warnings,
      })
    } catch (error) {
      // Nothing was created. The row is kept (not deleted) and marked failed: deleting it used to
      // "free the UID for retry", but the cursor advances past recorded UIDs, so the next run's
      // `uid > last_seen_uid` search never looked at it again and the enquiry was lost outright.
      // As a failed row it stays visible and the retry pass owns it.
      const message = error instanceof Error ? error.message : `Import failed for UID ${uid}`
      const { error: recordError } = await supabase
        .from("inbound_email_messages")
        .update({
          status: "failed",
          filing_status: "not_applicable",
          missing_fields: review.missingFields,
          warnings: review.warnings,
          raw_preview: createRawEmailPreview(rawText),
          body_part: bodySelection.part,
          alt_body_preview: altBodyPreview,
          error: message,
        })
        .eq("id", claimId)

      if (recordError) {
        summary.errors.push(`Failed to record import failure for UID ${uid}: ${recordError.message}`)
        continue
      }

      summary.errors.push(message)
      settledUids.add(uid)
      continue
    }

    // A booking now exists. From this point the claim row must NOT be deleted on failure --
    // doing so would free the UID and risk a duplicate booking on the next run.
    try {
      // created.needsReview is the final, post-resolution decision (also covers an unresolved
      // supplier/route and a possible duplicate) -- using the pre-resolution `review` here would
      // let a booking that the enquiry tab flags as Needs Review get filed into the processed
      // folder and logged as imported_complete.
      const { error: updateError } = await supabase
        .from("inbound_email_messages")
        .update({
          booking_id: created.id,
          status: created.needsReview ? "imported_needs_review" : "imported_complete",
          missing_fields: created.missingFields,
          warnings: created.warnings,
          raw_preview: created.rawPreview,
          body_part: bodySelection.part,
          alt_body_preview: altBodyPreview,
        })
        .eq("id", claimId)

      if (updateError) throw new Error(updateError.message)

      await supabase.from("bookings").update({ email_import_source_message_id: claimId }).eq("id", created.id)

      summary.importedCount += 1
      if (created.needsReview) summary.needsReviewCount += 1
    } catch (error) {
      // Booking was created but recording it failed. Leave the row at "processing" (already
      // claimed, so it can't be duplicated) -- healStaleClaims surfaces it for manual review
      // after an hour if nothing resolves it sooner.
      summary.errors.push(
        `Booking ${created.id} created but failed to record for UID ${uid}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    settledUids.add(uid)
  }

  return false
}

// Phase C -- file. Runs on its own connection, separately from collect/import, and covers both
// this run's freshly-imported messages and anything left `filing_failed` by a previous run (which
// the old per-message-inline filing had no way to ever revisit, since the dedupe check only looks
// at row existence). Self-healing by construction: any row still `filing_failed` next run is
// picked up again here.
async function fileOutstandingMessages(
  account: AccountRow,
  supabase: ServiceClient,
  uidvalidity: number,
): Promise<void> {
  const { data: pending, error } = await supabase
    .from("inbound_email_messages")
    .select("id, uid, status")
    .eq("email_account_id", account.id)
    .eq("uidvalidity", uidvalidity)
    .eq("filing_status", "filing_failed")

  if (error) throw new Error(`Stuck-filing lookup failed: ${error.message}`)
  if (!pending || pending.length === 0) return

  const client = createImapClient(account)
  try {
    await client.connect()
    const mailbox = await client.mailboxOpen(account.inbox_folder)

    // UIDs are only meaningful within the uidvalidity epoch they were recorded under. If the
    // mailbox was recreated since, moving by these UIDs could file the wrong messages entirely --
    // defer instead, next run will re-check.
    if (Number(mailbox.uidValidity) !== uidvalidity) {
      void logError({
        severity: "Warning",
        source: "inbound-email-sync",
        message: "Mailbox UIDVALIDITY changed; deferring stuck filings",
        details: { accountId: account.id, expected: uidvalidity, actual: Number(mailbox.uidValidity) },
      })
      return
    }

    const pendingUids = pending.map((row) => row.uid)
    const presentResult = await client.search({ uid: pendingUids.join(",") }, { uid: true })
    const present = new Set(presentResult === false ? [] : presentResult)

    const missing = pending.filter((row) => !present.has(row.uid))
    for (const row of missing) {
      await supabase
        .from("inbound_email_messages")
        .update({
          filing_status: "not_applicable",
          error: "UID no longer present in inbox at filing retry time (likely moved or deleted outside of sync)",
        })
        .eq("id", row.id)
    }

    const toFile = pending.filter((row) => present.has(row.uid))
    const byFolder = new Map<string, typeof toFile>()
    for (const row of toFile) {
      const folder = row.status === "imported_needs_review" ? account.needs_review_folder : account.processed_folder
      const bucket = byFolder.get(folder)
      if (bucket) {
        bucket.push(row)
      } else {
        byFolder.set(folder, [row])
      }
    }

    for (const [folder, rows] of byFolder) {
      const uids = rows.map((row) => row.uid)
      const rowIds = rows.map((row) => row.id)
      try {
        await client.messageFlagsAdd(uids, ["\\Seen"], { uid: true })
        await client.messageMove(uids, folder, { uid: true })
        await supabase.from("inbound_email_messages").update({ filing_status: "filed", error: null }).in("id", rowIds)
      } catch (moveError) {
        const message = moveError instanceof Error ? moveError.message : "Failed to move message(s)"
        await supabase.from("inbound_email_messages").update({ error: message }).in("id", rowIds)
        void logError({
          severity: "Warning",
          source: "inbound-email-sync",
          message: "Email moved to processed folder failed",
          details: { accountId: account.id, uids, error: message },
        })
      }
    }
  } finally {
    await closeImapClient(client)
  }
}

export async function syncInboundEmailAccount(
  account: AccountRow,
  deadline: SyncDeadline = createSyncDeadline(),
): Promise<EmailSyncSummary> {
  const supabase = createServiceClient()
  const rules = await loadActiveRules(supabase)
  const standaloneSuppliers = await loadStandaloneSupplierMatchers(supabase)
  const summary: EmailSyncSummary = {
    scannedCount: 0,
    importedCount: 0,
    needsReviewCount: 0,
    duplicateCount: 0,
    skippedNotEnquiryCount: 0,
    errors: [],
  }

  const { data: run, error: runError } = await supabase
    .from("inbound_email_sync_runs")
    .insert({ email_account_id: account.id, status: "running" })
    .select("id")
    .single()

  if (runError || !run) {
    throw new Error(runError?.message || "Failed to create sync run")
  }

  let uidvalidity = account.last_uidvalidity ?? 0
  // Every UID that ended the run with a row of its own. Anything missing from this set is left
  // above the cursor for the next run rather than being skipped past.
  const settledUids = new Set<number>()

  try {
    const collected = await collectCandidateMessages(account, supabase, summary, run.id, deadline, settledUids)
    uidvalidity = collected.uidvalidity

    const stoppedImporting = await importCollectedMessages(
      collected.messages,
      account,
      supabase,
      rules,
      run.id,
      uidvalidity,
      summary,
      standaloneSuppliers,
      deadline,
      settledUids,
    )
    const stoppedForBudget = stoppedImporting || collected.truncated

    await supabase
      .from("inbound_email_accounts")
      .update({
        last_uidvalidity: uidvalidity,
        last_seen_uid: highestSettledUid(collected.candidateUids, settledUids, account.last_seen_uid ?? 0),
        first_sync_completed: true,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", account.id)

    // A run that ran out of budget is honestly a partial one, even with no errors -- there is
    // known work left behind. Recording that (rather than leaving the row at "running", which is
    // what a platform kill used to do) is what makes the backlog legible afterwards.
    const notes = [...summary.errors]
    if (stoppedForBudget) {
      notes.push(`Stopped early: run budget of ${RUN_BUDGET_MS}ms reached with messages still to import.`)
    }
    const status = summary.errors.length > 0 || stoppedForBudget ? "partial" : "success"
    await updateRun(supabase, run.id, status, summary, notes.length > 0 ? notes.join("\n") : undefined)

    if (summary.errors.length > 0) {
      void logError({ severity: "Critical", source: "inbound-email-sync", message: `Mailbox sync completed with ${summary.errors.length} error(s)`, details: { accountId: account.id, errors: summary.errors } })
    }

    await supabase.from("audit_logs").insert({
      actor: "system",
      entity_type: "InboundEmailAccount",
      entity_id: account.id,
      action: "mailbox_sync_completed",
      meta_json: {
        scanned_count: summary.scannedCount,
        imported_count: summary.importedCount,
        needs_review_count: summary.needsReviewCount,
        duplicate_count: summary.duplicateCount,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mailbox sync failed"
    summary.errors.push(message)
    await updateRun(supabase, run.id, "failed", summary, message)
    void logError({ severity: "Critical", source: "inbound-email-sync", message: "Mailbox sync failed", details: { accountId: account.id, error: message } })
    throw error
  }

  // Filing runs on its own connection and its own failure domain: collect+import above already
  // succeeded (bookings exist), so a filing failure here should not mark the whole run failed --
  // it just leaves rows `filing_failed` for the next run's fileOutstandingMessages to retry.
  try {
    await fileOutstandingMessages(account, supabase, uidvalidity)
  } catch (error) {
    void logError({
      severity: "Warning",
      source: "inbound-email-sync",
      message: "Filing pass failed; will retry next sync",
      details: { accountId: account.id, error: error instanceof Error ? error.message : String(error) },
    })
  }

  return summary
}

export async function syncAllEnabledInboundEmailAccounts(): Promise<EmailSyncSummary> {
  const supabase = createServiceClient()
  const { data: accounts, error } = await supabase
    .from("inbound_email_accounts")
    .select("*")
    .eq("enabled", true)
    .order("created_at", { ascending: true })

  if (error) throw new Error(error.message)

  const total: EmailSyncSummary = {
    scannedCount: 0,
    importedCount: 0,
    needsReviewCount: 0,
    duplicateCount: 0,
    skippedNotEnquiryCount: 0,
    errors: [],
  }

  // One budget for the whole invocation, not one per account: the platform ceiling applies to the
  // request, so a second mailbox must not start a message with the clock already spent.
  const deadline = createSyncDeadline()

  for (const account of accounts ?? []) {
    try {
      const summary = await syncInboundEmailAccount(account, deadline)
      total.scannedCount += summary.scannedCount
      total.importedCount += summary.importedCount
      total.needsReviewCount += summary.needsReviewCount
      total.duplicateCount += summary.duplicateCount
      total.skippedNotEnquiryCount += summary.skippedNotEnquiryCount
      total.errors.push(...summary.errors)
    } catch (error) {
      total.errors.push(error instanceof Error ? error.message : `Sync failed for ${account.email}`)
    }
  }

  return total
}
