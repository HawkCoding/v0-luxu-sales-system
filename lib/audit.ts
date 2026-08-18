import { NextResponse } from "next/server"
import { z } from "zod"
import { formatDisplayDateTime } from "@/lib/date-format"
import { createSessionClient } from "@/lib/supabase/server"
import { CONSULTANTS, type AuditLog } from "@/lib/types"

export const AUDIT_ACTIVE_RETENTION_MONTHS = 24

export const auditListQuerySchema = z.object({
  scope: z.enum(["active", "archive"]).default("active"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(250).default(50),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  entityType: z.string().trim().max(120).optional(),
  entityId: z.string().trim().max(160).optional(),
  search: z.string().trim().max(160).optional(),
})

export type AuditListQuery = z.infer<typeof auditListQuerySchema>

export interface AuditAccessContext {
  supabase: Awaited<ReturnType<typeof createSessionClient>>
  userId: string
  role: "admin" | "manager"
}

export interface AuditListResult {
  logs: AuditLog[]
  total: number
  page: number
  pageSize: number
  retentionMonths: number
  cutoffDate: string
  scope: "active" | "archive"
}

const AUDIT_COLUMNS = [
  "id",
  "actor",
  "actor_user_id",
  "entity_type",
  "entity_id",
  "action",
  "before_json",
  "after_json",
  "meta_json",
  // A manager's override reason was written to audit_logs but never read back:
  // the stage_change_override event was discoverable, the reason behind it was
  // not, which is the half that makes an override reviewable.
  "override_reason",
  "overridden_by",
  "created_at",
].join(", ")

interface AuditRow {
  id: string
  actor: string
  actor_user_id: string | null
  entity_type: string
  entity_id: string
  action: string
  before_json: unknown
  after_json: unknown
  meta_json: unknown
  override_reason: string | null
  overridden_by: string | null
  created_at: string
}

interface BookingAuditContextRow {
  id: string
  booking_number: string
  consultant: string | null
  customer:
    | {
        first_name: string | null
        last_name: string | null
      }
    | Array<{
        first_name: string | null
        last_name: string | null
      }>
    | null
}

export function getAuditCutoffDate(now = new Date()): Date {
  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - AUDIT_ACTIVE_RETENTION_MONTHS)
  return cutoff
}

export async function requireAuditAccess(): Promise<
  | { ok: true; value: AuditAccessContext }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clearance_level")
    .eq("user_id", user.id)
    .single()

  if (
    profileError ||
    !profile ||
    (profile.clearance_level !== "admin" && profile.clearance_level !== "manager")
  ) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    }
  }

  return {
    ok: true,
    value: {
      supabase,
      userId: user.id,
      role: profile.clearance_level,
    },
  }
}

function endOfDayIso(date: string): string {
  return `${date}T23:59:59.999Z`
}

function mapAuditRow(row: AuditRow): AuditLog {
  return {
    id: row.id,
    actor: row.actor,
    actorUserId: row.actor_user_id ?? undefined,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    beforeJson: row.before_json ? JSON.stringify(row.before_json) : undefined,
    afterJson: row.after_json ? JSON.stringify(row.after_json) : undefined,
    metaJson: row.meta_json ? JSON.stringify(row.meta_json) : undefined,
    overrideReason: row.override_reason ?? undefined,
    overriddenBy: row.overridden_by ?? undefined,
    createdAt: row.created_at,
    createdAtDisplay: formatDisplayDateTime(row.created_at),
  }
}

function consultantDisplayName(consultant: string | null): string | undefined {
  if (!consultant) return undefined

  return CONSULTANTS.find((option) => option.key === consultant)?.name ?? consultant
}

function customerName(
  customer: BookingAuditContextRow["customer"],
): string | undefined {
  const customerRecord = Array.isArray(customer) ? customer[0] : customer
  const name = [customerRecord?.first_name, customerRecord?.last_name].filter(Boolean).join(" ").trim()

  return name || undefined
}

async function enrichAuditLogsWithBookingContext(
  context: AuditAccessContext,
  logs: AuditLog[],
): Promise<AuditLog[]> {
  const bookingIds = [
    ...new Set(
      logs
        .filter((log) => log.entityType.toLowerCase() === "booking")
        .map((log) => log.entityId),
    ),
  ]

  if (bookingIds.length === 0) return logs

  const { data } = await context.supabase
    .from("bookings")
    .select("id, booking_number, consultant, customer:customers(first_name, last_name)")
    .in("id", bookingIds)

  const bookingContext = new Map(
    ((data ?? []) as unknown as BookingAuditContextRow[]).map((booking) => {
      const name = customerName(booking.customer)
      const label = [booking.booking_number, name].filter(Boolean).join(" - ")

      return [
        booking.id,
        {
          label,
          actor: consultantDisplayName(booking.consultant),
        },
      ]
    }),
  )

  return logs.map((log) => {
    const booking = bookingContext.get(log.entityId)
    if (!booking) return log

    const genericActor = ["consultant", "system", "unknown"].includes(log.actor.toLowerCase())

    return {
      ...log,
      entityDisplayLabel: booking.label || log.entityDisplayLabel,
      actorDisplayName: genericActor ? booking.actor : log.actorDisplayName,
    }
  })
}

export async function listAuditLogs(
  context: AuditAccessContext,
  params: AuditListQuery,
): Promise<AuditListResult> {
  const cutoffDate = getAuditCutoffDate()
  const cutoffIso = cutoffDate.toISOString()
  const table = params.scope === "archive" ? "audit_log_archives" : "audit_logs"
  const startIndex = (params.page - 1) * params.pageSize
  const endIndex = startIndex + params.pageSize - 1

  let query = context.supabase
    .from(table)
    .select(AUDIT_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(startIndex, endIndex)

  if (params.scope === "active") {
    query = query.gte("created_at", cutoffIso)
  } else {
    query = query.lt("created_at", cutoffIso)
  }

  if (params.from) {
    query = query.gte("created_at", `${params.from}T00:00:00.000Z`)
  }

  if (params.to) {
    query = query.lte("created_at", endOfDayIso(params.to))
  }

  if (params.entityType && params.entityType !== "all") {
    query = query.eq("entity_type", params.entityType)
  }

  if (params.entityId) {
    query = query.eq("entity_id", params.entityId)
  }

  if (params.search) {
    const escaped = params.search.replaceAll(",", " ").replaceAll("%", "\\%").replaceAll("_", "\\_")
    query = query.or(
      `action.ilike.%${escaped}%,entity_type.ilike.%${escaped}%,entity_id.ilike.%${escaped}%,actor.ilike.%${escaped}%`,
    )
  }

  const { data, error, count } = await query

  if (error) {
    throw new Error(error.message)
  }

  const logs = ((data ?? []) as unknown as AuditRow[]).map(mapAuditRow)

  return {
    logs: await enrichAuditLogsWithBookingContext(context, logs),
    total: count ?? 0,
    page: params.page,
    pageSize: params.pageSize,
    retentionMonths: AUDIT_ACTIVE_RETENTION_MONTHS,
    cutoffDate: cutoffIso,
    scope: params.scope,
  }
}
