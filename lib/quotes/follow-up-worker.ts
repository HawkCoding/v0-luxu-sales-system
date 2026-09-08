import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { getQuoteFollowUpSettings } from "@/lib/settings-access"
import { formatDisplayDateLong } from "@/lib/date-format"
import { logError } from "@/lib/error-log"
import { formatCustomerSalutation } from "@/lib/person-name-format"
import { sendEmail } from "@/lib/email/transport"
import { composeFromTemplate } from "@/lib/templates/compose-email"
import { getTemplate, type EmailTemplate } from "@/lib/templates/get-template"
import { loadQuoteConfig } from "@/lib/quotes/load-quote-config"
import { loadSupplierKind } from "@/lib/suppliers/load-supplier-kind"
import type { PricingSnapshot } from "@/lib/types"

export interface FollowUpWorkerResult {
  processed: number
  sent: number
  skipped: number
  failed: number
}

const NO_OVERRIDES = { journeyClass: null, rateAudience: null, showTrainOnlyNote: null }

/**
 * Stages past the point where chasing a quote decision makes sense. Canonical stages plus their
 * legacy aliases (payment_schedule → deposit_requested, trip_active → voucher_sent) since older
 * bookings may still carry legacy values, and `lost` — a cancelled booking's quotes are never
 * cancelled with it, so without this a customer who already said no keeps getting nudged.
 * Shared by the DB query (which filters these out up front) and the in-loop guard.
 */
const TERMINAL_STAGES = [
  "deposit_requested",
  "payment_schedule",
  "deposit_paid",
  "final_paid",
  "voucher_sent",
  "trip_active",
  "closed",
  "lost",
] as const

/**
 * Compared against a lower-cased `bookings.outcome`. The column is free text whose written values
 * are capitalised ("Won", "Lost", "Cancelled"), so a case-sensitive match here silently never
 * fired. `won` is included because a won booking at a non-terminal stage is just as dead.
 */
const TERMINAL_OUTCOMES = new Set(["won", "lost", "cancelled"])

const TERMINAL_STAGE_SET = new Set<string>(TERMINAL_STAGES)

export async function runQuoteFollowUpWorker(
  supabase: SupabaseClient<Database>,
): Promise<FollowUpWorkerResult> {
  const { enabled, cadence } = await getQuoteFollowUpSettings(supabase)

  if (!enabled) {
    return { processed: 0, sent: 0, skipped: 0, failed: 0 }
  }

  // Default (shared) template — the fallback every quote without a variant of its own uses.
  const defaultTemplateRow = await getTemplate(supabase, "follow_up")
  if (!defaultTemplateRow) {
    throw new Error("Follow-up template could not be resolved")
  }
  const defaultTemplate: EmailTemplate = defaultTemplateRow
  // A supplier- or kind-tagged variant is fetched at most once per distinct primary supplier in
  // this run, not once per quote -- most runs only ever see one or two trains.
  const templateBySupplierId = new Map<string, EmailTemplate>([["", defaultTemplate]])
  async function templateFor(primarySupplierId: string | null): Promise<EmailTemplate> {
    const key = primarySupplierId ?? ""
    const cached = templateBySupplierId.get(key)
    if (cached) return cached
    const supplierKind = await loadSupplierKind(supabase, primarySupplierId)
    const resolved =
      (await getTemplate(supabase, "follow_up", primarySupplierId, supplierKind)) ?? defaultTemplate
    templateBySupplierId.set(key, resolved)
    return resolved
  }

  const today = new Date()

  // Find quotes in 'sent' status with follow-ups not disabled and a known sent date, whose booking
  // has not already moved past the point of chasing. The booking (and its customer) is embedded
  // rather than read per quote: the old shape re-read one booking row per quote on every run, and
  // a quote left at 'sent' under a finished booking was re-read forever, once a day, for nothing.
  const { data: sentQuotes, error: quotesError } = await supabase
    .from("quotes")
    // Kept on one line: PostgREST's type parser only understands a single string literal, and a
    // concatenated one widens to `string`, which loses the row types entirely.
    .select(
      "id, booking_id, last_sent_at, follow_ups_disabled, bookings!inner(id, booking_number, stage, outcome, assigned_salesperson_id, primary_supplier_id, customers!inner(title, first_name, last_name, email))",
    )
    .eq("status", "sent")
    .eq("follow_ups_disabled", false)
    .not("last_sent_at", "is", null)
    .not("bookings.stage", "in", `(${TERMINAL_STAGES.join(",")})`)

  if (quotesError) {
    throw new Error(`Failed to fetch sent quotes: ${quotesError.message}`)
  }

  if (!sentQuotes || sentQuotes.length === 0) {
    return { processed: 0, sent: 0, skipped: 0, failed: 0 }
  }

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const quote of sentQuotes) {
    if (!quote.last_sent_at) continue

    // Embedded by the query above. A many-to-one embed comes back as a single row, but the
    // generated types allow the array shape, so both are handled -- same as `customers` below.
    const booking = Array.isArray(quote.bookings) ? quote.bookings[0] : quote.bookings

    if (!booking) {
      skipped++
      continue
    }

    // Belt-and-braces: the query already excludes terminal stages, but a booking can move between
    // that read and this send. `outcome` is only checked here -- PostgREST cannot match it
    // case-insensitively, and the column's written values are capitalised.
    if (
      TERMINAL_STAGE_SET.has(booking.stage ?? "") ||
      TERMINAL_OUTCOMES.has((booking.outcome ?? "").toLowerCase())
    ) {
      skipped++
      continue
    }

    // Normalize to UTC midnight so time-of-day doesn't skew day diffs
    const sentDateStr = new Date(quote.last_sent_at).toISOString().slice(0, 10)
    const sentDate = new Date(sentDateStr)
    const todayStr = today.toISOString().slice(0, 10)
    const todayNorm = new Date(todayStr)
    const daysSinceSent = Math.floor(
      (todayNorm.getTime() - sentDate.getTime()) / (1000 * 60 * 60 * 24),
    )

    // Fetch already-sent follow-ups for this quote
    const { data: existingFollowUps } = await supabase
      .from("quote_follow_ups")
      .select("scheduled_for, status")
      .eq("quote_id", quote.id)

    const sentDays = new Set(
      (existingFollowUps ?? [])
        .filter((f) => f.status === "sent")
        .map((f) => {
          const scheduledDate = new Date(f.scheduled_for)
          return Math.round(
            (scheduledDate.getTime() - sentDate.getTime()) / (1000 * 60 * 60 * 24),
          )
        }),
    )

    // Cadence days that have elapsed but haven't been sent yet
    const dueDays = cadence.filter((day) => day <= daysSinceSent && !sentDays.has(day))

    if (dueDays.length === 0) {
      skipped++
      continue
    }

    const customer = Array.isArray(booking.customers)
      ? booking.customers[0]
      : booking.customers
    const customerEmail = customer?.email
    const customerName = formatCustomerSalutation(customer) || "Valued Guest"

    if (!customerEmail) {
      skipped++
      continue
    }

    // Resolve salesperson sender (email address + credential id for SMTP routing)
    let fromAddress = "reservations@luxustravel.co.za"
    let salespersonCredentialId: string | null = null

    if (booking.assigned_salesperson_id) {
      const { data: credential } = await supabase
        .from("salesperson_credentials")
        .select("id, email_address")
        .eq("profile_id", booking.assigned_salesperson_id)
        .maybeSingle()

      if (credential) {
        fromAddress = credential.email_address
        salespersonCredentialId = credential.id
      } else {
        // Fall back to profile email
        const { data: profile } = await supabase
          .from("profiles")
          .select("email")
          .eq("user_id", booking.assigned_salesperson_id)
          .maybeSingle()
        if (profile?.email) fromAddress = profile.email
      }
    }

    // Resolved once per quote (not per due-day) -- the primary supplier, and the template
    // variant that follows it, cannot change between a quote's own catch-up sends.
    const { data: lineItemRows } = await supabase
      .from("quote_line_items")
      .select("pricing_snapshot")
      .eq("quote_id", quote.id)
      // Ordered because the primary-supplier fallbacks are "first leg in array order".
      .order("sort_order", { ascending: true })
    const quoteConfig = await loadQuoteConfig(supabase, {
      lineItems: (lineItemRows ?? []).map((li) => ({
        pricingSnapshot: li.pricing_snapshot as PricingSnapshot | null,
      })),
      overrides: NO_OVERRIDES,
      bookingPrimarySupplierId: booking.primary_supplier_id ?? null,
    })
    const template = await templateFor(quoteConfig.primarySupplierId)

    for (const day of dueDays) {
      const scheduledFor = new Date(sentDate)
      scheduledFor.setDate(scheduledFor.getDate() + day)
      const scheduledForIso = scheduledFor.toISOString().slice(0, 10)
      const lastSentDateStr = sentDate.toISOString().slice(0, 10)

      // Insert follow-up tracking row
      const { data: followUp, error: followUpError } = await supabase
        .from("quote_follow_ups")
        .insert({
          quote_id: quote.id,
          scheduled_for: scheduledForIso,
          status: "pending",
        })
        .select("id")
        .single()

      if (followUpError || !followUp) {
        failed++
        continue
      }

      const { subject, bodyHtml } = await composeFromTemplate(template, {
        tokens: {
          customerName,
          jobNumber: booking.booking_number,
          lastSentDate: formatDisplayDateLong(lastSentDateStr),
        },
        senderProfileId: booking.assigned_salesperson_id,
      })

      // Send the email
      const result = await sendEmail({
        from: fromAddress,
        to: customerEmail,
        subject,
        html: bodyHtml,
        salespersonCredentialId,
      })

      if (!result.success) {
        await supabase
          .from("quote_follow_ups")
          .update({ status: "failed", error: result.error ?? "Send failed" })
          .eq("id", followUp.id)

        void logError({
          severity: "Warning",
          source: "quote-follow-up",
          message: `Follow-up email failed for booking ${booking.booking_number}`,
          details: { quoteId: quote.id, day, error: result.error },
        })
        failed++
        continue
      }

      // Mark sent + insert correspondence
      await supabase
        .from("quote_follow_ups")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", followUp.id)

      await supabase.from("correspondences").insert({
        booking_id: quote.booking_id,
        channel: "email",
        kind: "quote_follow_up",
        status: "sent",
        subject,
        body_html: bodyHtml,
        recipients: [customerEmail],
        provider_message_id: result.providerMessageId,
      })

      sent++
    }
  }

  // Only a run that actually did something is worth a log row. A skip is the expected outcome for
  // every quote inside its cadence window, and `error_logs` has no retention -- logging it daily
  // buried real failures under rows staff had to resolve by hand.
  if (sent > 0 || failed > 0) {
    void logError({
      severity: "Info",
      source: "quote-follow-up",
      message: `${sent} follow-up(s) sent, ${failed} failed, ${skipped} quote(s) skipped`,
      details: { sent, failed, skipped },
    })
  }

  return { processed: sentQuotes.length, sent, skipped, failed }
}
