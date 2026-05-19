import { beforeEach, describe, expect, it, vi } from "vitest"

const settingsMocks = vi.hoisted(() => ({
  getPaymentReminderSettings: vi.fn(),
}))

vi.mock("@/lib/settings-access", () => ({
  getPaymentReferenceRequired: vi.fn().mockResolvedValue(false),
  getPaymentReminderSettings: settingsMocks.getPaymentReminderSettings,
}))

import { runPaymentRemindersWorker } from "./payment-reminders-worker"

const INVOICE_ID = "00000000-0000-4000-8000-00000000aaaa"
const BOOKING_ID = "00000000-0000-4000-8000-00000000bbbb"
const REMINDER_ID = "00000000-0000-4000-8000-00000000cccc"

function makeSupabase({
  overdueInvoices = [] as unknown[],
  existingReminders = [] as unknown[],
  reminderInsertError = null as unknown,
  correspondenceInsertError = null as unknown,
} = {}) {
  const reminderUpdateFn = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))
  const reminderInsertSingle = vi.fn(async () =>
    reminderInsertError
      ? { data: null, error: reminderInsertError }
      : { data: { id: REMINDER_ID }, error: null },
  )
  const reminderInsertChain = { select: vi.fn(() => ({ single: reminderInsertSingle })) }
  const reminderInsert = vi.fn(() => reminderInsertChain)

  const correspondenceInsert = vi.fn(async () => ({ error: correspondenceInsertError }))

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "app_settings") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({ data: [], error: null })),
          })),
        }
      }
      if (table === "invoices") {
        return {
          select: vi.fn(() => ({
            not: vi.fn().mockReturnThis(),
            lt: vi.fn(async () => ({ data: overdueInvoices, error: null })),
          })),
        }
      }
      if (table === "payment_reminders") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: existingReminders, error: null })),
          })),
          insert: reminderInsert,
          update: reminderUpdateFn,
        }
      }
      if (table === "correspondences") {
        return { insert: correspondenceInsert }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }

  return { supabase, reminderUpdateFn, reminderInsert, correspondenceInsert }
}

describe("runPaymentRemindersWorker", () => {
  beforeEach(() => {
    settingsMocks.getPaymentReminderSettings.mockResolvedValue({ enabled: true, cadence: [3, 7, 14] })
  })

  it("returns zeros and skips all when reminders are disabled", async () => {
    settingsMocks.getPaymentReminderSettings.mockResolvedValue({ enabled: false, cadence: [3, 7, 14] })
    const { supabase } = makeSupabase()
    const result = await runPaymentRemindersWorker(supabase as never)
    expect(result).toEqual({ processed: 0, sent: 0, skipped: 0, failed: 0 })
  })

  it("returns zeros when there are no overdue invoices", async () => {
    const { supabase } = makeSupabase({ overdueInvoices: [] })
    const result = await runPaymentRemindersWorker(supabase as never)
    expect(result).toEqual({ processed: 0, sent: 0, skipped: 0, failed: 0 })
  })

  it("sends reminders for overdue cadence days not yet covered", async () => {
    // Invoice 10 days overdue → cadence [3,7,14] → days 3 and 7 are due, 14 is not
    const tenDaysAgo = new Date()
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)
    const dueDate = tenDaysAgo.toISOString().slice(0, 10)

    const { supabase, correspondenceInsert } = makeSupabase({
      overdueInvoices: [{ id: INVOICE_ID, booking_id: BOOKING_ID, due_date: dueDate, status: "sent" }],
      existingReminders: [],
    })

    const result = await runPaymentRemindersWorker(supabase as never)
    expect(result.sent).toBe(2)
    expect(correspondenceInsert).toHaveBeenCalledTimes(2)
  })

  it("skips already-sent cadence days", async () => {
    const tenDaysAgo = new Date()
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)
    const dueDate = tenDaysAgo.toISOString().slice(0, 10)

    // Day-3 reminder already sent
    const day3Date = new Date(tenDaysAgo)
    day3Date.setDate(day3Date.getDate() + 3)

    const { supabase, correspondenceInsert } = makeSupabase({
      overdueInvoices: [{ id: INVOICE_ID, booking_id: BOOKING_ID, due_date: dueDate, status: "sent" }],
      existingReminders: [{ scheduled_for: day3Date.toISOString().slice(0, 10), status: "sent" }],
    })

    const result = await runPaymentRemindersWorker(supabase as never)
    // Only day-7 should be sent (day-3 already sent, day-14 not yet due)
    expect(result.sent).toBe(1)
    expect(correspondenceInsert).toHaveBeenCalledTimes(1)
  })

  it("logs failed status to payment_reminders when correspondence insert fails", async () => {
    const tenDaysAgo = new Date()
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)
    const dueDate = tenDaysAgo.toISOString().slice(0, 10)

    const { supabase, reminderUpdateFn } = makeSupabase({
      overdueInvoices: [{ id: INVOICE_ID, booking_id: BOOKING_ID, due_date: dueDate, status: "sent" }],
      correspondenceInsertError: { message: "DB error" },
    })

    const result = await runPaymentRemindersWorker(supabase as never)
    expect(result.failed).toBeGreaterThan(0)
    expect(reminderUpdateFn).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    )
  })

  it("skips paid invoices (they are not returned by the overdue query)", async () => {
    // Paid invoices excluded from query — simulate by returning empty list
    const { supabase } = makeSupabase({ overdueInvoices: [] })
    const result = await runPaymentRemindersWorker(supabase as never)
    expect(result.sent).toBe(0)
  })
})
