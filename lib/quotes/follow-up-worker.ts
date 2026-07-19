import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { getQuoteFollowUpSettings } from "@/lib/settings-access"
import { formatDisplayDate } from "@/lib/date-format"
import { logError } from "@/lib/error-log"
import { formatCustomerSalutation } from "@/lib/person-name-format"
import { sendEmail } from "@/lib/email/transport"
import { composeFromTemplate } from "@/lib/templates/compose-email"
import { getTemplate } from "@/lib/templates/get-template"

export interface FollowUpWorkerResult {
  processed: number
  sent: number
  skipped: number
  failed: number
}

export async function runQuoteFollowUpWorker(
  supabase: SupabaseClient<Database>,
): Promise<FollowUpWorkerResult> {
  const { enabled, cadence } = await getQuoteFollowUpSettings(supabase)

  if (!enabled) {
    return { processed: 0, sent: 0, skipped: 0, failed: 0 }
  }

  // Single fetch per run — every follow-up in this run uses the same template.
  const template = await getTemplate(supabase, "follow_up")
  if (!template) {
    throw new Error("Follow-up template could not be resolved")
  }

  const today = new Date()

  // Find quotes in 'sent' status with follow-ups not disabled and a known sent date
  const { data: sentQuotes, error: quotesError } = await supabase
    .from("quotes")
    .select("id, booking_id, last_sent_at, follow_ups_disabled")
    .eq("status", "sent")
    .eq("follow_ups_disabled", false)
    .not("last_sent_at", "is", null)

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

    // Fetch booking + customer + salesperson details (once per quote)
    const { data: booking } = await supabase
      .from("bookings")
      .select(
        "id, booking_number, stage, outcome, assigned_salesperson_id, customers!inner(title, first_name, last_name, email)",
      )
      .eq("id", quote.booking_id)
      .single()

    if (!booking) {
      skipped++
      continue
    }

    // Skip if booking has progressed past quote_sent stage.
    // Canonical stages plus their legacy aliases (payment_schedule → deposit_requested,
    // trip_active → voucher_sent) since older bookings may still carry legacy values.
    const terminalStages = new Set([
      "deposit_requested",
      "payment_schedule",
      "deposit_paid",
      "final_paid",
      "voucher_sent",
      "trip_active",
      "closed",
    ])
    const terminalOutcomes = new Set(["lost", "cancelled"])
    if (
      terminalStages.has(booking.stage ?? "") ||
      terminalOutcomes.has(booking.outcome ?? "")
    ) {
      void logError({
        severity: "Info",
        source: "quote-follow-up",
        message: `Follow-up skipped — booking ${booking.booking_number} has progressed`,
        details: { quoteId: quote.id, stage: booking.stage, outcome: booking.outcome },
      })
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
          lastSentDate: formatDisplayDate(lastSentDateStr),
        },
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

  if (skipped > 0) {
    void logError({
      severity: "Info",
      source: "quote-follow-up",
      message: `${skipped} quote(s) skipped — all cadence points already sent or booking progressed`,
      details: { skipped },
    })
  }

  return { processed: sentQuotes.length, sent, skipped, failed }
}
