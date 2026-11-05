import { afterEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { loadEmailedDocuments } from "./emailed-documents"

interface Options {
  /** Sent emails on the booking (id, kind, subject, sent_at, recipients), newest first. */
  emailRows?: unknown[] | null
  emailError?: { message: string } | null
  /** Invoices with status sent or paid, newest first (sent_at). */
  invoiceRows?: unknown[] | null
  invoiceError?: { message: string } | null
}

function mockSupabase(options: Options = {}) {
  const emailFilters: Array<[string, unknown]> = []
  const invoiceFilters: Array<[string, unknown]> = []

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "correspondences") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((column: string, value: unknown) => {
              emailFilters.push([column, value])
              return {
                eq: vi.fn((column2: string, value2: unknown) => {
                  emailFilters.push([column2, value2])
                  return {
                    order: vi.fn(async () => ({ data: options.emailRows ?? [], error: options.emailError ?? null })),
                  }
                }),
              }
            }),
          })),
        }
      }
      if (table === "invoices") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((column: string, value: unknown) => {
              invoiceFilters.push([column, value])
              return {
                in: vi.fn((column2: string, values: unknown) => {
                  invoiceFilters.push([column2, values])
                  return {
                    order: vi.fn(async () => ({
                      data: options.invoiceRows ?? [],
                      error: options.invoiceError ?? null,
                    })),
                  }
                }),
              }
            }),
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return { client: supabase as unknown as SupabaseClient<Database>, emailFilters, invoiceFilters }
}

function email(overrides: Record<string, unknown>) {
  return {
    id: "cor-1",
    kind: "quote",
    subject: "Your quote",
    sent_at: "2026-09-01T08:00:00.000Z",
    recipients: ["ada@example.test"],
    ...overrides,
  }
}

describe("loadEmailedDocuments", () => {
  afterEach(() => vi.restoreAllMocks())

  it("returns nothing when no email or invoice is on record", async () => {
    const { client } = mockSupabase()
    const emailed = await loadEmailedDocuments(client, "booking-1")
    expect(emailed.size).toBe(0)
  })

  it("looks only at sent emails and live invoices on this booking", async () => {
    const { client, emailFilters, invoiceFilters } = mockSupabase()
    await loadEmailedDocuments(client, "booking-1")

    expect(emailFilters).toEqual([
      ["booking_id", "booking-1"],
      ["status", "sent"],
    ])
    expect(invoiceFilters).toEqual([
      ["booking_id", "booking-1"],
      ["status", ["sent", "paid"]],
    ])
  })

  it("maps each sent email to the document it carried, in the log's newest-first order, with its recipients", async () => {
    const { client } = mockSupabase({
      emailRows: [
        email({ id: "cor-q2", kind: "quote", sent_at: "2026-09-03T08:00:00.000Z" }),
        email({ id: "cor-i1", kind: "invoice", subject: "Your invoice", recipients: null }),
        email({ id: "cor-p1", kind: "payment_received", subject: "Payment received" }),
        email({ id: "cor-r1", kind: "payment_reminder", subject: "Reminder" }),
        email({ id: "cor-v1", kind: "voucher", subject: "Your voucher" }),
        email({ id: "cor-q1", kind: "quote" }),
      ],
    })

    const emailed = await loadEmailedDocuments(client, "booking-1")

    expect([...emailed.keys()].sort()).toEqual(["invoice", "quote", "voucher"])
    expect(emailed.get("quote")?.sends.map((send) => send.correspondenceId)).toEqual(["cor-q2", "cor-q1"])
    expect(emailed.get("quote")?.sends[0]).toEqual({
      correspondenceId: "cor-q2",
      subject: "Your quote",
      sentAt: "2026-09-03T08:00:00.000Z",
      recipients: ["ada@example.test"],
    })
    // Invoice, payment confirmation and reminder emails all carry the invoice; no recipients reads as [].
    expect(emailed.get("invoice")?.sends.map((send) => send.correspondenceId)).toEqual(["cor-i1", "cor-p1", "cor-r1"])
    expect(emailed.get("invoice")?.sends[0].recipients).toEqual([])
    expect(emailed.get("voucher")?.sends.map((send) => send.correspondenceId)).toEqual(["cor-v1"])
    expect(emailed.get("quote")?.fallbackSentAt).toBeNull()
  })

  it("ignores emails that carry no quote, invoice or voucher", async () => {
    const { client } = mockSupabase({
      emailRows: [email({ kind: "reservation_received" }), email({ id: "cor-2", kind: "follow_up" }), email({ id: "cor-3", kind: null })],
    })

    expect((await loadEmailedDocuments(client, "booking-1")).size).toBe(0)
  })

  describe("an invoice with no email on record", () => {
    it("counts when it has a sent date, taking that date as when it went out", async () => {
      const { client } = mockSupabase({ invoiceRows: [{ sent_at: "2026-09-02T08:00:00.000Z" }] })

      const invoice = (await loadEmailedDocuments(client, "booking-1")).get("invoice")
      expect(invoice).toEqual({ sends: [], fallbackSentAt: "2026-09-02T08:00:00.000Z" })
    })

    it("does not count when it has no sent date, e.g. a draft a payment turned to paid", async () => {
      const { client } = mockSupabase({ invoiceRows: [{ sent_at: null }] })

      expect((await loadEmailedDocuments(client, "booking-1")).has("invoice")).toBe(false)
    })

    it("uses the newest invoice that has a sent date, skipping a newer one that has none", async () => {
      const { client } = mockSupabase({
        invoiceRows: [{ sent_at: null }, { sent_at: "2026-09-02T08:00:00.000Z" }, { sent_at: "2026-08-01T08:00:00.000Z" }],
      })

      const invoice = (await loadEmailedDocuments(client, "booking-1")).get("invoice")
      expect(invoice?.fallbackSentAt).toBe("2026-09-02T08:00:00.000Z")
    })

    it("leaves the email log alone when the invoice was emailed", async () => {
      const { client } = mockSupabase({
        emailRows: [email({ id: "cor-i1", kind: "invoice", subject: "Your invoice" })],
        invoiceRows: [{ sent_at: "2026-09-02T08:00:00.000Z" }],
      })

      const invoice = (await loadEmailedDocuments(client, "booking-1")).get("invoice")
      expect(invoice?.sends.map((send) => send.correspondenceId)).toEqual(["cor-i1"])
      expect(invoice?.fallbackSentAt).toBeNull()
    })
  })

  it("never throws: a failed lookup is logged and reads as nothing emailed", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const { client } = mockSupabase({
      emailError: { message: "boom" },
      invoiceError: { message: "boom" },
    })

    const emailed = await loadEmailedDocuments(client, "booking-1")

    expect(emailed.size).toBe(0)
    expect(consoleError).toHaveBeenCalledTimes(2)
  })

  it("keeps what the other lookup found when one of them fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { client } = mockSupabase({
      emailError: { message: "boom" },
      invoiceRows: [{ sent_at: "2026-09-02T08:00:00.000Z" }],
    })

    expect([...(await loadEmailedDocuments(client, "booking-1")).keys()]).toEqual(["invoice"])
  })
})
