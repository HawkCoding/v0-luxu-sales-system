import { ImapFlow } from "imapflow"
import { simpleParser } from "mailparser"
import { createEmailBookingFromParsedDraft } from "@/lib/inbound-email/import-booking"
import { decryptCredential } from "@/lib/inbound-email/crypto"
import { htmlToPlainText } from "@/lib/inbound-email/html"
import { findMatchingInboundSubjectRule, type InboundSubjectRule } from "@/lib/inbound-email/rules"
import { getEmailImportReviewMetadata } from "@/lib/inbound-email/review"
import { parseEmailDraft } from "@/lib/import/parseEmailDraft"
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
// instead of risking a platform timeout mid-run.
const MAX_UIDS_PER_RUN = 100

// A claimed-but-never-finished message (process crashed between the claim insert and the booking
// being recorded) is left at status "processing" forever otherwise -- and, because the dedupe
// check only looks at row existence, it would silently block that UID from ever being retried.
const STALE_PROCESSING_MS = 60 * 60 * 1000

interface CollectedMessage {
  uid: number
  source: Buffer
}

interface CollectedBatch {
  uidvalidity: number
  highestSeenUid: number
  messages: CollectedMessage[]
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

export function getMessageBody(text: string | false | undefined, html: string | false | undefined): string {
  if (typeof text === "string" && text.trim()) return text
  if (typeof html === "string" && html.trim()) return htmlToPlainText(html)
  return ""
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

// Loaded once per sync run (not per message) and threaded into parseEmailDraft so a newly added
// train operator is recognised without a code change -- see ParseEmailDraftOptions.
async function loadActiveTrainOperatorNames(supabase: ServiceClient): Promise<string[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("name")
    .eq("kind", "train_operator")
    .eq("active", true)

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => row.name)
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
): Promise<CollectedBatch> {
  const client = createImapClient(account)

  try {
    await client.connect()
    await ensureMailbox(client, account.processed_folder)
    await ensureMailbox(client, account.needs_review_folder)
    const mailbox = await client.mailboxOpen(account.inbox_folder)
    const uidvalidity = Number(mailbox.uidValidity)

    await healStaleClaims(supabase, account)

    const rawCandidates = await getCandidateUids(client, account)
    const candidateUids = rawCandidates.slice().sort((a, b) => a - b).slice(0, MAX_UIDS_PER_RUN)
    const freshUids = await filterAlreadyProcessed(supabase, account, uidvalidity, candidateUids, summary)

    let highestSeenUid = account.last_seen_uid ?? 0
    const messages: CollectedMessage[] = []

    if (freshUids.length > 0) {
      for await (const message of client.fetch(freshUids, { uid: true, source: true }, { uid: true })) {
        if (!message.uid || !message.source) continue
        messages.push({ uid: message.uid, source: message.source })
      }
    }

    // Advance past the whole evaluated batch (not just the messages that fetched cleanly) so a
    // duplicate or a message dropped mid-fetch doesn't get re-scanned forever. Anything beyond
    // the MAX_UIDS_PER_RUN cap is left for the next run.
    if (candidateUids.length > 0) {
      highestSeenUid = Math.max(highestSeenUid, candidateUids[candidateUids.length - 1])
    }

    summary.scannedCount += candidateUids.length

    return { uidvalidity, highestSeenUid, messages }
  } finally {
    await closeImapClient(client)
  }
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
  trainOperatorNames: string[],
): Promise<void> {
  for (const { uid, source } of messages) {
    const parsedMail = await simpleParser(source)
    const subject = parsedMail.subject?.trim() || "(no subject)"
    const messageId = parsedMail.messageId ?? null
    const fromAddress = parsedMail.from?.text ?? null
    const receivedAt = parsedMail.date?.toISOString() ?? null
    const matchingRule = findMatchingInboundSubjectRule(subject, rules)

    if (!matchingRule) {
      // No active rule claimed this subject. Previously this just skipped the message with no
      // record at all -- and by the time anyone noticed, the sync cursor had already advanced
      // past its UID, making it permanently unrecoverable. Recording a row keeps it visible and
      // makes it count toward the dedupe check like every other message.
      const { error: skipError } = await supabase.from("inbound_email_messages").insert({
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
      }
      continue
    }

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
      })
      .select("id")
      .single()

    if (claimError || !claim) {
      // A unique violation means another (concurrent) run already claimed this UID -- leave it
      // for that run to finish. Anything else is a real failure worth surfacing.
      if (!isUniqueViolation(claimError)) {
        summary.errors.push(`Failed to claim UID ${uid}: ${claimError?.message ?? "unknown error"}`)
      }
      continue
    }

    const rawText = getMessageBody(parsedMail.text, parsedMail.html)
    const parsedDraft = parseEmailDraft(rawText, { trainOperatorNames })
    const review = getEmailImportReviewMetadata(parsedDraft)

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
      // Nothing was created -- safe to free the UID so the next sync retries this message.
      await supabase.from("inbound_email_messages").delete().eq("id", claim.id)
      summary.errors.push(error instanceof Error ? error.message : `Import failed for UID ${uid}`)
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
        })
        .eq("id", claim.id)

      if (updateError) throw new Error(updateError.message)

      await supabase.from("bookings").update({ email_import_source_message_id: claim.id }).eq("id", created.id)

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
  }
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

export async function syncInboundEmailAccount(account: AccountRow): Promise<EmailSyncSummary> {
  const supabase = createServiceClient()
  const rules = await loadActiveRules(supabase)
  const trainOperatorNames = await loadActiveTrainOperatorNames(supabase)
  const summary: EmailSyncSummary = {
    scannedCount: 0,
    importedCount: 0,
    needsReviewCount: 0,
    duplicateCount: 0,
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

  try {
    const collected = await collectCandidateMessages(account, supabase, summary)
    uidvalidity = collected.uidvalidity

    await importCollectedMessages(collected.messages, account, supabase, rules, run.id, uidvalidity, summary, trainOperatorNames)

    await supabase
      .from("inbound_email_accounts")
      .update({
        last_uidvalidity: uidvalidity,
        last_seen_uid: collected.highestSeenUid,
        first_sync_completed: true,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", account.id)

    await updateRun(supabase, run.id, summary.errors.length > 0 ? "partial" : "success", summary)

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
    errors: [],
  }

  for (const account of accounts ?? []) {
    try {
      const summary = await syncInboundEmailAccount(account)
      total.scannedCount += summary.scannedCount
      total.importedCount += summary.importedCount
      total.needsReviewCount += summary.needsReviewCount
      total.duplicateCount += summary.duplicateCount
      total.errors.push(...summary.errors)
    } catch (error) {
      total.errors.push(error instanceof Error ? error.message : `Sync failed for ${account.email}`)
    }
  }

  return total
}
