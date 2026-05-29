import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { getPaymentReminderSettings } from "@/lib/settings-access"
import { logError } from "@/lib/error-log"

export interface ReminderWorkerResult {
  processed: number
  sent: number
  skipped: number
  failed: number
}

export async function runPaymentRemindersWorker(
  supabase: SupabaseClient<Database>,
): Promise<ReminderWorkerResult> {
  const { enabled, cadence } = await getPaymentReminderSettings(supabase)

  if (!enabled) {
    return { processed: 0, sent: 0, skipped: 0, failed: 0 }
  }

  const today = new Date()
  const todayIso = today.toISOString().slice(0, 10)

  // Find invoices that are overdue (not paid/void, past due date)
  const { data: overdueInvoices, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, booking_id, due_date, status")
    .not("status", "in", '("paid","void")')
    .not("due_date", "is", null)
    .lt("due_date", todayIso)

  if (invoiceError) {
    throw new Error(`Failed to fetch overdue invoices: ${invoiceError.message}`)
  }

  if (!overdueInvoices || overdueInvoices.length === 0) {
    return { processed: 0, sent: 0, skipped: 0, failed: 0 }
  }

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const invoice of overdueInvoices) {
    if (!invoice.due_date) continue

    const dueDate = new Date(invoice.due_date)
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))

    // Fetch already-sent reminders for this invoice
    const { data: existingReminders } = await supabase
      .from("payment_reminders")
      .select("scheduled_for, status")
      .eq("invoice_id", invoice.id)

    const sentDays = new Set(
      (existingReminders ?? [])
        .filter((r) => r.status === "sent")
        .map((r) => {
          const scheduledDate = new Date(r.scheduled_for)
          return Math.floor((scheduledDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
        }),
    )

    // Find cadence days that have passed but haven't been sent yet
    const dueDays = cadence.filter((day) => day <= daysOverdue && !sentDays.has(day))

    if (dueDays.length === 0) {
      skipped++
      continue
    }

    for (const day of dueDays) {
      const scheduledFor = new Date(dueDate)
      scheduledFor.setDate(scheduledFor.getDate() + day)
      const scheduledForIso = scheduledFor.toISOString().slice(0, 10)

      // Insert reminder tracking row
      const { data: reminder, error: reminderError } = await supabase
        .from("payment_reminders")
        .insert({
          invoice_id: invoice.id,
          scheduled_for: scheduledForIso,
          status: "pending",
        })
        .select("id")
        .single()

      if (reminderError || !reminder) {
        failed++
        continue
      }

      // Create correspondence row for the email
      const { error: corrError } = await supabase.from("correspondences").insert({
        booking_id: invoice.booking_id,
        channel: "email",
        kind: "payment_reminder",
        status: "scheduled",
        scheduled_at: new Date().toISOString(),
        subject: `Payment reminder — invoice overdue by ${day} days`,
        body_html: `<p>This is a reminder that your invoice is overdue. Please arrange payment at your earliest convenience.</p>`,
      })

      if (corrError) {
        await supabase
          .from("payment_reminders")
          .update({ status: "failed", error: corrError.message })
          .eq("id", reminder.id)
        failed++
        continue
      }

      await supabase
        .from("payment_reminders")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", reminder.id)

      sent++
    }
  }

  if (skipped > 0) {
    void logError({ severity: "Info", source: "payment-reminders", message: `${skipped} invoice(s) skipped — all cadence points already sent`, details: { skipped } })
  }

  return { processed: overdueInvoices.length, sent, skipped, failed }
}
