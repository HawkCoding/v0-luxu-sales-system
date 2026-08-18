import { getPipelineStageLabel, type AuditLog } from "./types"

interface AuditEntityContext {
  label?: string
  actorLabel?: string
}

export interface AuditDisplayContext {
  entities?: Record<string, AuditEntityContext | undefined>
}

export interface AuditDisplay {
  title: string
  description: string
  entityLabel: string
  actorLabel: string
}

const IGNORED_UPDATE_FIELDS = new Set([
  "id",
  "created_at",
  "updated_at",
  "createdAt",
  "updatedAt",
])

const FIELD_LABELS: Record<string, string> = {
  booking_number: "booking number",
  customer_id: "customer",
  departure_date: "departure date",
  duration_nights: "duration",
  no_of_adults: "adults",
  no_of_children: "children",
  no_of_suites: "suites",
  route_id: "route",
  stage: "stage",
  terms_accepted: "terms accepted",
  additional_services: "additional services",
  promotion_code: "promotion code",
  first_name: "first name",
  last_name: "last name",
  phone: "phone",
  email: "email",
  amount: "amount",
  method: "payment method",
  reference: "payment reference",
  status: "status",
  subject: "subject",
}

const ACTION_TITLES: Record<string, string> = {
  record_created: "Record created",
  record_updated: "Record updated",
  record_deleted: "Record deleted",
  stage_change: "Booking stage changed",
}

const GENERIC_ACTORS = new Set(["consultant", "system", "unknown"])

function parseJsonObject(value?: string): Record<string, unknown> | null {
  if (!value) return null

  try {
    const parsed: unknown = JSON.parse(value)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return null
  }

  return null
}

function humanizeToken(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase())
}

function actionTitle(action: string): string {
  return ACTION_TITLES[action] ?? humanizeToken(action)
}

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? humanizeToken(field).toLowerCase()
}

function stageLabel(value: unknown): string {
  if (typeof value !== "string") return formatValue(value)

  return getPipelineStageLabel(value)
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "blank"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "number") return String(value)
  if (typeof value === "string") return value

  return "changed"
}

function valuesDiffer(before: unknown, after: unknown): boolean {
  return JSON.stringify(before) !== JSON.stringify(after)
}

function changedFields(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string[] {
  if (!before || !after) return []

  const fields = new Set([...Object.keys(before), ...Object.keys(after)])

  return [...fields].filter((field) => {
    if (IGNORED_UPDATE_FIELDS.has(field)) return false
    return valuesDiffer(before[field], after[field])
  })
}

function formatFieldChange(field: string, before: unknown, after: unknown): string {
  const beforeValue = field === "stage" ? stageLabel(before) : formatValue(before)
  const afterValue = field === "stage" ? stageLabel(after) : formatValue(after)

  return `${fieldLabel(field)} changed from ${beforeValue} to ${afterValue}`
}

function isStageChange(log: AuditLog, before: Record<string, unknown> | null, after: Record<string, unknown> | null): boolean {
  if (log.action === "stage_change") return true

  return Boolean(before && after && before.stage !== undefined && after.stage !== undefined && before.stage !== after.stage)
}

function entityLabel(log: AuditLog, context?: AuditDisplayContext): string {
  if (log.entityDisplayLabel) return log.entityDisplayLabel

  const contextualLabel = context?.entities?.[log.entityId]?.label
  if (contextualLabel) return contextualLabel

  return log.entityType
}

function actorLabel(log: AuditLog, context?: AuditDisplayContext): string {
  if (log.actorDisplayName) return log.actorDisplayName

  const contextualActor = context?.entities?.[log.entityId]?.actorLabel
  if (contextualActor && GENERIC_ACTORS.has(log.actor.toLowerCase())) return contextualActor

  return log.actor || "System"
}

function entityNoun(log: AuditLog): string {
  return log.entityType.toLowerCase() === "booking" ? "booking" : log.entityType.toLowerCase()
}

export function getAuditDisplay(log: AuditLog, context?: AuditDisplayContext): AuditDisplay {
  const before = parseJsonObject(log.beforeJson)
  const after = parseJsonObject(log.afterJson)
  const label = entityLabel(log, context)
  const actor = actorLabel(log, context)

  if (isStageChange(log, before, after)) {
    const fromStage = stageLabel(before?.stage)
    const toStage = stageLabel(after?.stage)
    const sentence = `${actor} changed ${entityNoun(log)} ${label} from ${fromStage} to ${toStage}`

    return {
      title: sentence,
      // An override moved the booking past gates that were failing, so the
      // reason for it is the whole point of the entry — show it here rather
      // than leaving it buried in a column nobody reads back.
      description:
        log.action === "stage_change_override"
          ? `Manager override${log.overrideReason ? ` — ${log.overrideReason}` : ""}`
          : "Stage change",
      entityLabel: label,
      actorLabel: actor,
    }
  }

  const fields = changedFields(before, after)
  if (log.action === "record_updated" && fields.length > 0) {
    const displayedFields = fields.slice(0, 3)
    const fieldText = displayedFields
      .map((field) => formatFieldChange(field, before?.[field], after?.[field]))
      .join("; ")
    const remainingCount = fields.length - displayedFields.length
    const suffix = remainingCount > 0 ? `; ${remainingCount} more field${remainingCount === 1 ? "" : "s"} changed` : ""

    const sentence = `${actor} updated ${entityNoun(log)} ${label}`

    return {
      title: sentence,
      description: `${fieldText}${suffix}`,
      entityLabel: label,
      actorLabel: actor,
    }
  }

  return {
    title: `${actor} recorded ${actionTitle(log.action).toLowerCase()} on ${label}`,
    description: actionTitle(log.action),
    entityLabel: label,
    actorLabel: actor,
  }
}

export function isDuplicateStageUpdate(log: AuditLog, logs: AuditLog[]): boolean {
  if (log.action !== "record_updated") return false

  const before = parseJsonObject(log.beforeJson)
  const after = parseJsonObject(log.afterJson)
  const fields = changedFields(before, after)
  if (!before || !after || !fields.includes("stage")) return false

  const nonTechnicalFields = fields.filter((field) => field !== "stage")
  if (nonTechnicalFields.length > 0) return false

  const createdAt = new Date(log.createdAt).getTime()

  return logs.some((other) => {
    if (other.id === log.id || other.action !== "stage_change" || other.entityId !== log.entityId) return false

    const otherBefore = parseJsonObject(other.beforeJson)
    const otherAfter = parseJsonObject(other.afterJson)
    if (otherBefore?.stage !== before.stage || otherAfter?.stage !== after.stage) return false

    const otherCreatedAt = new Date(other.createdAt).getTime()
    return Math.abs(otherCreatedAt - createdAt) <= 10_000
  })
}
