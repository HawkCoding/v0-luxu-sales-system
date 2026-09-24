import { describe, expect, it, vi } from "vitest"
import { upsertGeneratedDocument } from "@/lib/documents/upsert-generated-document"

interface ExistingRow {
  id: string
  storage_path: string
  status?: string
}

type WriteOp = "insert" | "update" | "upsert"

interface RecordedWrite {
  op: WriteOp
  payload: Record<string, unknown>
  id?: string
  onConflict?: string
}

function createSupabase(existingRows: ExistingRow[], lookupError: { message: string } | null = null) {
  const writes: RecordedWrite[] = []
  const lookups: { column: string; values: string[] }[] = []

  const from = vi.fn(() => {
    let pending: RecordedWrite | null = null
    let pathFilter: string[] | null = null
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((column: string, value: string) => {
        if (pending && column === "id") pending.id = value
        return chain
      }),
      in: vi.fn((column: string, values: string[]) => {
        lookups.push({ column, values })
        pathFilter = values
        return chain
      }),
      order: vi.fn(async () =>
        lookupError
          ? { data: null, error: lookupError }
          : {
              data: existingRows
                .filter((row) => pathFilter === null || pathFilter.includes(row.storage_path))
                .map((row) => ({ status: "generated", ...row })),
              error: null,
            },
      ),
      insert: vi.fn((payload: Record<string, unknown>) => {
        pending = { op: "insert", payload }
        return chain
      }),
      upsert: vi.fn((payload: Record<string, unknown>, options?: { onConflict?: string }) => {
        pending = { op: "upsert", payload, onConflict: options?.onConflict }
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
        op: "upsert",
        onConflict: "booking_id,kind,storage_path",
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

  it("keeps a sent status through a regeneration when the caller lists it in keepStatuses", async () => {
    const { supabase, writes } = createSupabase([
      { id: "voucher-doc", storage_path: "vouchers/LTT-26-0039/Voucher-26-0039.pdf", status: "sent" },
    ])

    const row = await upsertGeneratedDocument(supabase, {
      bookingId: "booking-1",
      kind: "voucher_pdf",
      storagePath: "vouchers/LTT-26-0039/Voucher-26-0039.pdf",
      fileName: "Voucher-26-0039.pdf",
      keepStatuses: ["sent"],
    })

    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ op: "update", id: "voucher-doc", payload: { status: "sent" } })
    expect(row?.status).toBe("sent")
  })

  it("resets a status not listed in keepStatuses to the requested one", async () => {
    const { supabase, writes } = createSupabase([
      { id: "voucher-doc", storage_path: "vouchers/LTT-26-0039/Voucher-26-0039.pdf", status: "required" },
    ])

    await upsertGeneratedDocument(supabase, {
      bookingId: "booking-1",
      kind: "voucher_pdf",
      storagePath: "vouchers/LTT-26-0039/Voucher-26-0039.pdf",
      fileName: "Voucher-26-0039.pdf",
      keepStatuses: ["sent"],
    })

    expect(writes[0]).toMatchObject({ op: "update", payload: { status: "generated" } })
  })

  it("with matchAnyPath, re-points the booking's row of that kind whatever path it is on", async () => {
    const { supabase, writes, lookups } = createSupabase([
      { id: "old-voucher", storage_path: "vouchers/LTT-2026-0038/voucher-ltt-2026-0038.pdf", status: "sent" },
    ])

    await upsertGeneratedDocument(supabase, {
      bookingId: "booking-1",
      kind: "voucher_pdf",
      storagePath: "vouchers/LTT-2026-0038/Voucher-2026-0038.pdf",
      fileName: "Voucher-2026-0038.pdf",
      matchAnyPath: true,
      keepStatuses: ["sent"],
    })

    expect(lookups).toEqual([])
    expect(writes).toEqual([
      {
        op: "update",
        id: "old-voucher",
        payload: {
          booking_id: "booking-1",
          kind: "voucher_pdf",
          status: "sent",
          storage_path: "vouchers/LTT-2026-0038/Voucher-2026-0038.pdf",
          file_name: "Voucher-2026-0038.pdf",
        },
      },
    ])
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
