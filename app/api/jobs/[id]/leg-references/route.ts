import { z } from "zod"
import { requireRole, requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import { resolveAcceptedQuoteScope, scopeLegIdsFilter } from "@/lib/quotes/accepted-quote-scope"
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
    // Only services on the accepted quote are listed, so a consultant is never asked for a
    // supplier reference for something the customer did not buy.
    const quoteScope = await resolveAcceptedQuoteScope(auth.value.supabase, id)
    const rows = await loadLegReferenceRows(auth.value.supabase, id, {
      legIds: scopeLegIdsFilter(quoteScope),
    })
    return Response.json({ rows })
  } catch (error) {
    return safeSupabaseError("leg-references:list", error)
  }
}

const updateSchema = z.object({
  updates: z
    .array(
      z.object({
        kind: z.enum(["selection", "service", "transport_request"]),
        id: z.string().uuid(),
        supplierReference: z.string().trim().max(200).nullable(),
        supplierContactName: z.string().trim().max(200).nullable().optional(),
        voucherFootnote: z.string().trim().max(500).nullable().optional(),
        excursions: z.array(z.string().trim().max(300)).max(20).optional(),
      }),
    )
    .min(1, "At least one update is required"),
})

const TABLE_BY_KIND = {
  selection: { table: "booking_package_selections", matchColumn: "package_leg_id" },
  service: { table: "booking_services", matchColumn: "id" },
  transport_request: { table: "booking_transport_requests", matchColumn: "id" },
} as const

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
    const { table, matchColumn } = TABLE_BY_KIND[update.kind]

    const payload: Record<string, unknown> = {
      supplier_reference: update.supplierReference?.trim() || null,
    }
    if (update.supplierContactName !== undefined) {
      payload.supplier_contact_name = update.supplierContactName?.trim() || null
    }
    if (update.voucherFootnote !== undefined) {
      payload.voucher_footnote = update.voucherFootnote?.trim() || null
    }
    // Excursions only exist on the leg tables -- a transport_request (transfer/rental/flight)
    // has no column for them.
    if (update.excursions !== undefined && update.kind !== "transport_request") {
      payload.excursions = update.excursions.map((value) => value.trim()).filter(Boolean)
    }

    const { error } = await supabase
      .from(table)
      .update(payload)
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
    const quoteScope = await resolveAcceptedQuoteScope(supabase, id)
    const rows = await loadLegReferenceRows(supabase, id, { legIds: scopeLegIdsFilter(quoteScope) })
    return Response.json({ rows })
  } catch (error) {
    return safeSupabaseError("leg-references:reload", error)
  }
}
