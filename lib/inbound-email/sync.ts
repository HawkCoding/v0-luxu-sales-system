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

async function ensureMailbox(client: ImapFlow, folder: string): Promise<void> {
  try {
    await client.mailboxCreate(folder)
  } catch {
    // Existing folders and servers without CREATE support are non-fatal here.
  }
}

function getMessageBody(text: string | false | undefined, html: string | false | undefined): string {
  if (typeof text === "string" && text.trim()) return text
  if (typeof html === "string" && html.trim()) return htmlToPlainText(html)
  return ""
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

async function hasProcessedIdentity(
  supabase: ServiceClient,
  accountId: string,
  uidvalidity: number,
  uid: number,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("inbound_email_messages")
    .select("id")
    .eq("email_account_id", accountId)
    .eq("uidvalidity", uidvalidity)
    .eq("uid", uid)
    .maybeSingle()

  if (error) throw new Error(`Duplicate-check query failed: ${error.message}`)
  return Boolean(data)
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
    if (client.usable) {
      await client.logout()
    } else {
      client.close()
    }
  }
}

export async function syncInboundEmailAccount(account: AccountRow): Promise<EmailSyncSummary> {
  const supabase = createServiceClient()
  const rules = await loadActiveRules(supabase)
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

  const client = createImapClient(account)
  let highestSeenUid = account.last_seen_uid ?? 0
  let uidvalidity = account.last_uidvalidity ?? 0

  try {
    await client.connect()
    await ensureMailbox(client, account.processed_folder)
    await ensureMailbox(client, account.needs_review_folder)
    const mailbox = await client.mailboxOpen(account.inbox_folder)
    uidvalidity = Number(mailbox.uidValidity)
    const candidateUids = await getCandidateUids(client, account)

    for await (const message of client.fetch(candidateUids, {
      uid: true,
      envelope: true,
      source: true,
    }, { uid: true })) {
      const uid = message.uid
      if (!uid) continue

      highestSeenUid = Math.max(highestSeenUid, uid)
      summary.scannedCount += 1

      if (await hasProcessedIdentity(supabase, account.id, uidvalidity, uid)) {
        summary.duplicateCount += 1
        void logError({ severity: "Info", source: "inbound-email-sync", message: "Duplicate email ignored", details: { accountId: account.id, uid } })
        continue
      }

      const source = message.source
      if (!source) continue

      const parsedMail = await simpleParser(source)
      const subject = parsedMail.subject?.trim() || "(no subject)"
      const matchingRule = findMatchingInboundSubjectRule(subject, rules)

      if (!matchingRule) {
        continue
      }

      const rawText = getMessageBody(parsedMail.text, parsedMail.html)
      const parsedDraft = parseEmailDraft(rawText)
      const review = getEmailImportReviewMetadata(parsedDraft)
      const receivedAt = parsedMail.date?.toISOString() ?? null

      try {
        const created = await createEmailBookingFromParsedDraft(parsedDraft, {
          emailAccountId: account.id,
          mailboxEmail: account.email,
          subject,
          receivedAt,
          rawText,
          missingFields: review.missingFields,
          warnings: review.warnings,
        })

        const { data: messageRow, error: messageError } = await supabase
          .from("inbound_email_messages")
          .insert({
            email_account_id: account.id,
            sync_run_id: run.id,
            booking_id: created.id,
            uidvalidity,
            uid,
            message_id: parsedMail.messageId ?? null,
            subject,
            from_address: parsedMail.from?.text ?? null,
            received_at: receivedAt,
            status: review.needsReview ? "imported_needs_review" : "imported_complete",
            filing_status: "filed",
            missing_fields: review.missingFields,
            warnings: review.warnings,
            raw_preview: created.rawPreview,
          })
          .select("id")
          .single()

        if (messageError || !messageRow) {
          throw new Error(messageError?.message || "Failed to record inbound message")
        }

        await supabase
          .from("bookings")
          .update({ email_import_source_message_id: messageRow.id })
          .eq("id", created.id)

        const targetFolder = review.needsReview
          ? account.needs_review_folder
          : account.processed_folder

        try {
          await client.messageFlagsAdd([uid], ["\\Seen"], { uid: true })
          await client.messageMove([uid], targetFolder, { uid: true })
        } catch (filingError) {
          await supabase
            .from("inbound_email_messages")
            .update({
              filing_status: "filing_failed",
              error: filingError instanceof Error ? filingError.message : "Failed to move message",
            })
            .eq("id", messageRow.id)

          summary.errors.push(`Filing failed for UID ${uid}`)
          void logError({ severity: "Warning", source: "inbound-email-sync", message: "Email moved to processed folder failed", details: { accountId: account.id, uid, error: filingError instanceof Error ? filingError.message : String(filingError) } })
        }

        summary.importedCount += 1
        if (review.needsReview) summary.needsReviewCount += 1
      } catch (error) {
        summary.errors.push(error instanceof Error ? error.message : `Import failed for UID ${uid}`)
      }
    }

    await supabase
      .from("inbound_email_accounts")
      .update({
        last_uidvalidity: uidvalidity,
        last_seen_uid: highestSeenUid,
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

    return summary
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mailbox sync failed"
    summary.errors.push(message)
    await updateRun(supabase, run.id, "failed", summary, message)
    void logError({ severity: "Critical", source: "inbound-email-sync", message: "Mailbox sync failed", details: { accountId: account.id, error: message } })
    throw error
  } finally {
    if (client.usable) {
      await client.logout()
    } else {
      client.close()
    }
  }
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
