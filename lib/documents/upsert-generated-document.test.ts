import { describe, expect, it, vi } from "vitest"
import { upsertGeneratedDocument } from "@/lib/documents/upsert-generated-document"

interface ExistingRow {
  id: string
  storage_path: string
}

function createSupabase(existingRows: ExistingRow[], lookupError: { message: string } | null = null) {
  const writes: { op: "insert" | "update"; payload: Record<string, unknown>; id?: string }[] = []
  const lookups: { column: string; values: string[] }[] = []

  const from = vi.fn(() => {
    let pending: { op: "insert" | "update"; payload: Record<string, unknown>; id?: string } | null = null
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((column: string, value: string) => {
        if (pending && column === "id") pending.id = value
        return chain
      }),
      in: vi.fn((column: string, values: string[]) => {
        lookups.push({ column, values })
        return chain
      }),
      order: vi.fn(async () =>
        lookupError
          ? { data: null, error: lookupError }
          : {
              data: existingRows.filter((row) => lookups.at(-1)?.values.includes(row.storage_path)),
              error: null,
            },
      ),
      insert: vi.fn((payload: Record<string, unknown>) => {
        pending = { op: "insert", payload }
        return chain
      }),
      update: vi.fn((payload: Record<string, unknown>) => {
        pending = { op: "update", payload }
        return chain
      }),
      single: vi.fn(async () => {
        if (!pending) return { data: null, error: { message: "no write" } }
        writes.push(pending)
        return {
          data: {
            id: pending.id ?? "new-doc",
            booking_id: pending.payload.booking_id,
            kind: pending.payload.kind,
            status: pending.payload.status,
            storage_path: pending.payload.storage_path,
            created_at: "2026-09-23T00:00:00Z",
          },
          error: null,
        }
      }),
    }
    return chain
  })

  return { supabase: { from } as never, writes, lookups }
}

const NEW_PATH = "invoices/244453/Invoice-244453.pdf"
const LEGACY_PATH = "invoices/244453/invoice-244453.pdf"

describe("upsertGeneratedDocument", () => {
  it("re-points a row still on the legacy lowercase path instead of inserting a duplicate", async () => {
    const { supabase, writes, lookups } = createSupabase([{ id: "legacy-doc", storage_path: LEGACY_PATH }])

    const row = await upsertGeneratedDocument(supabase, {
      bookingId: "booking-1",
      kind: "invoice_pdf",
      storagePath: NEW_PATH,
      legacyStoragePaths: [LEGACY_PATH],
      fileName: "Invoice-244453.pdf",
    })

    expect(lookups[0]).toEqual({ column: "storage_path", values: [NEW_PATH, LEGACY_PATH] })
    expect(writes).toEqual([
      {
        op: "update",
        id: "legacy-doc",
        payload: {
          booking_id: "booking-1",
          kind: "invoice_pdf",
          status: "generated",
          storage_path: NEW_PATH,
          file_name: "Invoice-244453.pdf",
        },
      },
    ])
    expect(row).toMatchObject({ id: "legacy-doc", storage_path: NEW_PATH })
  })

  it("prefers the row already on the current path when both exist", async () => {
    const { supabase, writes } = createSupabase([
      { id: "legacy-doc", storage_path: LEGACY_PATH },
      { id: "current-doc", storage_path: NEW_PATH },
    ])

    await upsertGeneratedDocument(supabase, {
      bookingId: "booking-1",
      kind: "invoice_pdf",
      storagePath: NEW_PATH,
      legacyStoragePaths: [LEGACY_PATH],
      fileName: "Invoice-244453.pdf",
    })

    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ op: "update", id: "current-doc" })
  })

  it("inserts a new row with the capitalised display name when none exists", async () => {
    const { supabase, writes } = createSupabase([])

    const row = await upsertGeneratedDocument(supabase, {
      bookingId: "booking-1",
      kind: "summary_pdf",
      storagePath: "vouchers/244453/Worksheet-244453.pdf",
      fileName: "Worksheet-244453.pdf",
    })

    expect(writes).toEqual([
      {
        op: "insert",
        payload: {
          booking_id: "booking-1",
          kind: "summary_pdf",
          status: "generated",
          storage_path: "vouchers/244453/Worksheet-244453.pdf",
          file_name: "Worksheet-244453.pdf",
        },
      },
    ])
    expect(row?.id).toBe("new-doc")
  })

  it("writes nothing when the lookup fails, rather than inserting a duplicate row", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const { supabase, writes } = createSupabase([{ id: "legacy-doc", storage_path: LEGACY_PATH }], {
      message: "connection reset",
    })

    const row = await upsertGeneratedDocument(supabase, {
      bookingId: "booking-1",
      kind: "invoice_pdf",
      storagePath: NEW_PATH,
      legacyStoragePaths: [LEGACY_PATH],
      fileName: "Invoice-244453.pdf",
    })

    expect(row).toBeNull()
    expect(writes).toEqual([])
    consoleError.mockRestore()
  })
})
