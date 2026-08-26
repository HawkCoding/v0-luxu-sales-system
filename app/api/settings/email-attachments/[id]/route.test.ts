// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const settingsMocks = vi.hoisted(() => ({
  requireSettingsWrite: vi.fn(),
}))
const auditMocks = vi.hoisted(() => ({
  writeAuditLog: vi.fn(),
}))

vi.mock("@/lib/settings-access", () => ({
  requireSettingsWrite: settingsMocks.requireSettingsWrite,
}))

vi.mock("@/lib/audit-write", () => ({
  writeAuditLog: auditMocks.writeAuditLog,
}))

import { PATCH } from "./route"

const ID = "00000000-0000-4000-8000-00000000ccc2"
const SUPPLIER_A = "00000000-0000-4000-8000-00000000bbb1"
const SUPPLIER_B = "00000000-0000-4000-8000-00000000bbb2"
const ROUTE_A1 = "00000000-0000-4000-8000-00000000eee1"

function buildSupabase({
  currentSupplierId = SUPPLIER_A as string | null,
  currentRouteId = null as string | null,
  routeOwnerSupplierId = SUPPLIER_A as string | null,
  updateData = {
    id: ID,
    name: "Blue Train fact sheet",
    file_name: "blue-train-fact-sheet.pdf",
    supplier_id: SUPPLIER_A,
    supplier_kind: null,
    route_id: null,
    email_kinds: ["voucher"],
  } as Record<string, unknown>,
} = {}) {
  const updateEq = vi.fn(() => ({
    select: vi.fn(() => ({
      maybeSingle: vi.fn(async () => ({ data: updateData, error: null })),
    })),
  }))
  const update = vi.fn(() => ({ eq: updateEq }))

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "routes") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: routeOwnerSupplierId ? { supplier_id: routeOwnerSupplierId } : null,
                error: null,
              })),
            })),
          })),
        }
      }
      // email_attachment_library: first call reads current row, second call updates.
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { supplier_id: currentSupplierId, route_id: currentRouteId },
              error: null,
            })),
          })),
        })),
        update,
      }
    }),
  }

  settingsMocks.requireSettingsWrite.mockResolvedValue({
    ok: true,
    value: { supabase, actorName: "Jane", userId: "u1" },
  })
  auditMocks.writeAuditLog.mockResolvedValue({ error: null })

  return { supabase, update, updateEq }
}

function patchRequest(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/settings/email-attachments/${ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("PATCH /api/settings/email-attachments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 403 for non-manager users", async () => {
    settingsMocks.requireSettingsWrite.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })
    const res = await PATCH(patchRequest({ routeId: ROUTE_A1 }), { params: Promise.resolve({ id: ID }) })
    expect(res.status).toBe(403)
  })

  it("sets routeId when the route belongs to the current supplier", async () => {
    const { update } = buildSupabase({ currentSupplierId: SUPPLIER_A, routeOwnerSupplierId: SUPPLIER_A })
    const res = await PATCH(patchRequest({ routeId: ROUTE_A1 }), { params: Promise.resolve({ id: ID }) })
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ route_id: ROUTE_A1 }))
  })

  it("rejects a route that does not belong to the current supplier", async () => {
    buildSupabase({ currentSupplierId: SUPPLIER_A, routeOwnerSupplierId: SUPPLIER_B })
    const res = await PATCH(patchRequest({ routeId: ROUTE_A1 }), { params: Promise.resolve({ id: ID }) })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error?: string }
    expect(body.error).toContain("does not belong")
  })

  it("clears route_id when the supplier changes without an explicit routeId", async () => {
    const { update } = buildSupabase({ currentSupplierId: SUPPLIER_A, currentRouteId: ROUTE_A1 })
    const res = await PATCH(
      patchRequest({ supplierId: SUPPLIER_B }),
      { params: Promise.resolve({ id: ID }) },
    )
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ route_id: null }))
  })

  it("rejects routeId set alongside supplierKind", async () => {
    buildSupabase()
    const res = await PATCH(
      patchRequest({ supplierKind: "train_operator", routeId: ROUTE_A1 }),
      { params: Promise.resolve({ id: ID }) },
    )
    expect(res.status).toBe(400)
  })
})
