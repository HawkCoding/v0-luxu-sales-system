// @vitest-environment node
// jsdom replaces the global File class, which breaks undici's multipart
// parser (req.formData() brand-checks its own File). These are pure API
// tests, so they run in the node environment.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))
const settingsMocks = vi.hoisted(() => ({
  requireSettingsWrite: vi.fn(),
  getAttachmentMaxSizeMb: vi.fn(),
  getAttachmentAllowedMimeTypes: vi.fn(),
}))
const auditMocks = vi.hoisted(() => ({
  writeAuditLog: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
}))

vi.mock("@/lib/settings-access", () => ({
  requireSettingsWrite: settingsMocks.requireSettingsWrite,
  getAttachmentMaxSizeMb: settingsMocks.getAttachmentMaxSizeMb,
  getAttachmentAllowedMimeTypes: settingsMocks.getAttachmentAllowedMimeTypes,
}))

vi.mock("@/lib/audit-write", () => ({
  writeAuditLog: auditMocks.writeAuditLog,
}))

import { GET, POST } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"
const SUPPLIER_A = "00000000-0000-4000-8000-00000000bbb1"
const SUPPLIER_B = "00000000-0000-4000-8000-00000000bbb2"

const LIBRARY_ROWS = [
  {
    id: "00000000-0000-4000-8000-00000000ccc1",
    name: "Reservation form",
    file_name: "reservation-form.pdf",
    supplier_id: null,
    supplier_kind: null,
    email_kinds: ["quote"],
    supplier: null,
  },
  {
    id: "00000000-0000-4000-8000-00000000ccc2",
    name: "Blue Train fact sheet",
    file_name: "blue-train-fact-sheet.pdf",
    supplier_id: SUPPLIER_A,
    supplier_kind: null,
    email_kinds: ["voucher"],
    supplier: { name: "The Blue Train" },
  },
  {
    id: "00000000-0000-4000-8000-00000000ccc3",
    name: "Rovos fact sheet",
    file_name: "rovos-fact-sheet.pdf",
    supplier_id: SUPPLIER_B,
    supplier_kind: null,
    email_kinds: ["voucher"],
    supplier: { name: "Rovos Rail" },
  },
  {
    id: "00000000-0000-4000-8000-00000000ccc4",
    name: "Trains category sheet",
    file_name: "trains-category.pdf",
    supplier_id: null,
    supplier_kind: "train_operator",
    email_kinds: ["voucher"],
    supplier: null,
  },
  {
    id: "00000000-0000-4000-8000-00000000ccc5",
    name: "Tours category sheet",
    file_name: "tours-category.pdf",
    supplier_id: null,
    supplier_kind: "tour_operator",
    email_kinds: ["voucher"],
    supplier: null,
  },
]

function buildListSupabase({
  bookingSupplierId = SUPPLIER_A,
  bookingSupplierKind = "train_operator",
}: { bookingSupplierId?: string | null; bookingSupplierKind?: string | null } = {}) {
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: BOOKING_ID,
                  route: { supplier: { id: bookingSupplierId, kind: bookingSupplierKind } },
                },
                error: null,
              })),
            })),
          })),
        }
      }
      if (table === "email_attachment_library") {
        return {
          select: vi.fn(() => ({
            order: vi.fn(async () => ({ data: LIBRARY_ROWS, error: null })),
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  }

  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      user: { id: "u1" },
      profile: { clearanceLevel: "consultant", actorName: "Jane" },
    },
  })

  return supabase
}

describe("GET /api/settings/email-attachments", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await GET(new Request("http://localhost/api/settings/email-attachments"))
    expect(res.status).toBe(401)
  })

  it("lists every file when no booking is given", async () => {
    buildListSupabase()
    const res = await GET(new Request("http://localhost/api/settings/email-attachments"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { attachments: Array<{ id: string }> }
    expect(body.attachments).toHaveLength(5)
  })

  it("filters supplier and category files to the booking's train and marks kind defaults", async () => {
    buildListSupabase({ bookingSupplierId: SUPPLIER_A, bookingSupplierKind: "train_operator" })
    const res = await GET(
      new Request(
        `http://localhost/api/settings/email-attachments?bookingId=${BOOKING_ID}&kind=quote`,
      ),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      attachments: Array<{ name: string; defaultSelected: boolean }>
    }
    // Rovos (other supplier) and the Tours category are excluded — booking is
    // on a Blue Train (train_operator) route.
    expect(body.attachments.map((a) => a.name)).toEqual([
      "Reservation form",
      "Blue Train fact sheet",
      "Trains category sheet",
    ])
    expect(body.attachments.find((a) => a.name === "Reservation form")?.defaultSelected).toBe(true)
    expect(
      body.attachments.find((a) => a.name === "Blue Train fact sheet")?.defaultSelected,
    ).toBe(false)
  })
})

function buildUploadSupabase({ insertError = null as unknown } = {}) {
  const storageUpload = vi.fn(async () => ({ error: null }))
  const storageRemove = vi.fn(async () => ({ error: null }))
  const insertSingle = vi.fn(async () =>
    insertError
      ? { data: null, error: insertError }
      : {
          data: {
            id: "00000000-0000-4000-8000-00000000ddd1",
            name: "form.pdf",
            file_name: "form.pdf",
            supplier_id: null,
            supplier_kind: null,
            email_kinds: [],
          },
          error: null,
        },
  )

  const supabase = {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({ single: insertSingle })),
      })),
    })),
    storage: {
      from: vi.fn(() => ({
        upload: storageUpload,
        remove: storageRemove,
      })),
    },
  }

  settingsMocks.requireSettingsWrite.mockResolvedValue({
    ok: true,
    value: { supabase, actorName: "Jane", userId: "u1" },
  })
  settingsMocks.getAttachmentMaxSizeMb.mockResolvedValue(10)
  settingsMocks.getAttachmentAllowedMimeTypes.mockResolvedValue(["application/pdf"])
  auditMocks.writeAuditLog.mockResolvedValue({ error: null })

  return { storageUpload, storageRemove }
}

// jsdom's FormData/File don't survive undici's Request body handling, so the
// multipart payload is built by hand.
function uploadRequest(
  file: { name: string; type: string; content: string },
  fields: Record<string, string> = {},
) {
  const boundary = "----vitest-boundary"
  let body = ""
  body += `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n${file.content}\r\n`
  for (const [key, value] of Object.entries(fields)) {
    body += `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
  }
  body += `--${boundary}--\r\n`
  return new Request("http://localhost/api/settings/email-attachments", {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body,
  })
}

describe("POST /api/settings/email-attachments", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 403 for non-manager users", async () => {
    settingsMocks.requireSettingsWrite.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })
    const res = await POST(
      uploadRequest({ name: "form.pdf", type: "application/pdf", content: "data" }),
    )
    expect(res.status).toBe(403)
  })

  it("rejects disallowed mime types", async () => {
    buildUploadSupabase()
    const res = await POST(
      uploadRequest({ name: "virus.exe", type: "application/x-msdownload", content: "data" }),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error?: string }
    expect(body.error).toContain("Unsupported file type")
  })

  it("uploads the file and stores the library row", async () => {
    const { storageUpload } = buildUploadSupabase()
    const res = await POST(
      uploadRequest(
        { name: "form.pdf", type: "application/pdf", content: "data" },
        { emailKinds: JSON.stringify(["quote"]) },
      ),
    )
    expect(res.status).toBe(200)
    expect(storageUpload).toHaveBeenCalledTimes(1)
    const body = (await res.json()) as { id: string; fileName: string }
    expect(body.fileName).toBe("form.pdf")
  })

  it("rejects unknown email kinds", async () => {
    buildUploadSupabase()
    const res = await POST(
      uploadRequest(
        { name: "form.pdf", type: "application/pdf", content: "data" },
        { emailKinds: JSON.stringify(["not_a_kind"]) },
      ),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error?: string; details?: unknown }
    expect(body.error).not.toContain("Unsupported file type")
  })

  it("rejects an unknown supplierKind", async () => {
    buildUploadSupabase()
    const res = await POST(
      uploadRequest(
        { name: "form.pdf", type: "application/pdf", content: "data" },
        { supplierKind: "not_a_kind" },
      ),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error?: string }
    expect(body.error).toContain("supplier category")
  })

  it("rejects a file scoped to both a supplier and a category", async () => {
    buildUploadSupabase()
    const res = await POST(
      uploadRequest(
        { name: "form.pdf", type: "application/pdf", content: "data" },
        { supplierId: SUPPLIER_A, supplierKind: "train_operator" },
      ),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error?: string }
    expect(body.error).toContain("not both")
  })
})
