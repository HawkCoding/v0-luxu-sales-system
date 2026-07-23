import { z } from "zod"
import { requireRole, requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import { loadLegReferenceRows } from "@/lib/voucher/leg-references"

export const runtime = "nodejs"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, { params }: RouteParams) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { id } = await params

  try {
    const rows = await loadLegReferenceRows(auth.value.supabase, id)
    return Response.json({ rows })
  } catch (error) {
    return safeSupabaseError("leg-references:list", error)
  }
}

const updateSchema = z.object({
  updates: z
    .array(
      z.object({
        kind: z.enum(["selection", "transport_request"]),
        id: z.string().uuid(),
        supplierReference: z.string().trim().max(200).nullable(),
      }),
    )
    .min(1, "At least one update is required"),
})

export async function PATCH(req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { id } = await params

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = updateSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { supabase, user, profile } = auth.value

  for (const update of parsed.data.updates) {
    const table = update.kind === "selection" ? "booking_package_selections" : "booking_transport_requests"
    const matchColumn = update.kind === "selection" ? "package_leg_id" : "id"
    const supplierReference = update.supplierReference?.trim() || null

    const { error } = await supabase
      .from(table)
      .update({ supplier_reference: supplierReference })
      .eq("booking_id", id)
      .eq(matchColumn, update.id)

    if (error) return safeSupabaseError("leg-references:update", error)
  }

  await writeAuditLog(supabase, {
    actor: profile.actorName,
    actorUserId: user.id,
    entityType: "Booking",
    entityId: id,
    action: "leg_supplier_reference_updated",
    meta: { updates: parsed.data.updates },
  })

  try {
    const rows = await loadLegReferenceRows(supabase, id)
    return Response.json({ rows })
  } catch (error) {
    return safeSupabaseError("leg-references:reload", error)
  }
}
