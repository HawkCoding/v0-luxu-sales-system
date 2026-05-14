import { randomUUID } from "node:crypto"
import { z } from "zod"
import { writeAuditLog } from "@/lib/audit-write"
import { requireRole, requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { BOOKING_SUPPLIER_SCHEDULE_COLUMNS } from "@/lib/supabase/columns"
import { mapBookingSupplierSchedule } from "@/lib/suppliers"

const supportedScheduleKinds = ["hotel_property", "train_operator", "vehicle_rental"] as const
const nullableUuid = z.union([z.string().uuid(), z.literal(""), z.null()]).optional()
const nullableTime = z.union([z.string().regex(/^\d{2}:\d{2}$/), z.literal(""), z.null()]).optional()
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const supplierScheduleSchema = z.object({
  id: z.string().uuid().optional(),
  supplierId: nullableUuid,
  supplierKind: z.enum(supportedScheduleKinds),
  label: z.string().trim().max(200).nullable().optional(),
  dateFrom: dateString,
  dateTo: dateString,
  timeStart: nullableTime,
  timeEnd: nullableTime,
  notes: z.string().trim().max(2000).nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
}).superRefine((schedule, context) => {
  if (schedule.supplierKind === "hotel_property" && schedule.dateTo <= schedule.dateFrom) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["dateTo"],
      message: "Check-out date must be after check-in date",
    })
  }

  if (schedule.supplierKind === "train_operator" && schedule.dateTo < schedule.dateFrom) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["dateTo"],
      message: "Arrival date cannot be before departure date",
    })
  }

  if (schedule.supplierKind === "vehicle_rental" && schedule.dateTo < schedule.dateFrom) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["dateTo"],
      message: "Return date cannot be before pickup date",
    })
  }

  if (
    schedule.dateTo === schedule.dateFrom &&
    schedule.timeStart &&
    schedule.timeEnd &&
    schedule.timeEnd < schedule.timeStart
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["timeEnd"],
      message: "End time cannot be before start time on the same date",
    })
  }
})

const saveSupplierSchedulesSchema = z.object({
  schedules: z.array(supplierScheduleSchema).default([]),
})

function normalizeNullableUuid(value: string | null | undefined): string | null {
  return value && value.length > 0 ? value : null
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function normalizeNullableTime(value: string | null | undefined): string | null {
  return value && value.length > 0 ? value : null
}

function hasSupplierReferenceChange(
  beforeRows: Array<{ id: string; supplier_id: string | null }>,
  afterRows: Array<{ id: string; supplier_id: string | null }>,
): boolean {
  const beforeById = new Map(beforeRows.map((row) => [row.id, row.supplier_id]))
  return afterRows.some((row) => {
    if (!row.supplier_id) return false
    const beforeSupplierId = beforeById.get(row.id)
    return beforeSupplierId !== row.supplier_id
  })
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.value.supabase
    .from("booking_supplier_schedules")
    .select(BOOKING_SUPPLIER_SCHEDULE_COLUMNS)
    .eq("booking_id", id)
    .in("supplier_kind", supportedScheduleKinds)
    .order("sort_order", { ascending: true })

  if (error) return safeSupabaseError("supplier-schedules:list", error, "Failed to load supplier schedules")

  return Response.json((data ?? []).map(mapBookingSupplierSchedule))
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsedResult = saveSupplierSchedulesSchema.safeParse(raw)
  if (!parsedResult.success) return jsonZodError(parsedResult.error, "Invalid supplier schedule payload")
  const parsed = parsedResult.data
  const { supabase } = auth.value

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("supplier-schedules:load-booking", bookingError, "Failed to validate booking")
  if (!booking) return jsonError("Booking not found", 404)

  const supplierIds = [
    ...new Set(
      parsed.schedules
        .map((schedule) => normalizeNullableUuid(schedule.supplierId))
        .filter((supplierId): supplierId is string => Boolean(supplierId)),
    ),
  ]

  if (supplierIds.length > 0) {
    const { data: suppliers, error: suppliersError } = await supabase
      .from("suppliers")
      .select("id, kind")
      .in("id", supplierIds)

    if (suppliersError) {
      return safeSupabaseError("supplier-schedules:load-suppliers", suppliersError, "Failed to validate suppliers")
    }

    const kindBySupplierId = new Map((suppliers ?? []).map((supplier) => [supplier.id, supplier.kind]))
    const mismatchedSchedule = parsed.schedules.find((schedule) => {
      const supplierId = normalizeNullableUuid(schedule.supplierId)
      if (!supplierId) return false
      return kindBySupplierId.get(supplierId) !== schedule.supplierKind
    })

    if (mismatchedSchedule) {
      return jsonError("Supplier does not match the selected schedule type", 400)
    }
  }

  const rows = parsed.schedules.map((schedule, index) => ({
    id: schedule.id ?? randomUUID(),
    booking_id: id,
    supplier_id: normalizeNullableUuid(schedule.supplierId),
    supplier_kind: schedule.supplierKind,
    label: normalizeNullableText(schedule.label),
    date_from: schedule.dateFrom,
    date_to: schedule.dateTo,
    time_start: normalizeNullableTime(schedule.timeStart),
    time_end: normalizeNullableTime(schedule.timeEnd),
    notes: normalizeNullableText(schedule.notes),
    sort_order: schedule.sortOrder ?? index,
  }))

  const { data: existingRows, error: existingRowsError } = await supabase
    .from("booking_supplier_schedules")
    .select("id, supplier_id")
    .eq("booking_id", id)
    .in("supplier_kind", supportedScheduleKinds)

  if (existingRowsError) return safeSupabaseError("supplier-schedules:load-existing", existingRowsError, "Failed to load existing supplier schedules")

  const { error: deleteError } = await supabase
    .from("booking_supplier_schedules")
    .delete()
    .eq("booking_id", id)
    .in("supplier_kind", supportedScheduleKinds)

  if (deleteError) return safeSupabaseError("supplier-schedules:replace", deleteError, "Failed to replace supplier schedules")

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from("booking_supplier_schedules")
      .insert(rows)

    if (insertError) return safeSupabaseError("supplier-schedules:save", insertError, "Failed to save supplier schedules")
  }

  const { data: savedRows, error: loadError } = await supabase
    .from("booking_supplier_schedules")
    .select(BOOKING_SUPPLIER_SCHEDULE_COLUMNS)
    .eq("booking_id", id)
    .in("supplier_kind", supportedScheduleKinds)
    .order("sort_order", { ascending: true })

  if (loadError) return safeSupabaseError("supplier-schedules:reload", loadError, "Failed to load saved supplier schedules")

  if (hasSupplierReferenceChange(existingRows ?? [], rows)) {
    const auditResult = await writeAuditLog(supabase, {
      actor: auth.value.profile.actorName,
      actorUserId: auth.value.user.id,
      entityType: "Booking",
      entityId: id,
      action: "supplier_reference_captured",
      meta: {
        source: "supplier_schedules",
        supplier_ids: rows.map((row) => row.supplier_id).filter(Boolean),
      },
    })
    if (auditResult.error) return safeSupabaseError("supplier-schedules:audit-reference", auditResult.error)
  }

  return Response.json((savedRows ?? []).map(mapBookingSupplierSchedule))
}
