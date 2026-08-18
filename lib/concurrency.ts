import { NextResponse } from "next/server"
import { z } from "zod"

export interface StaleVersionConflictPayload {
  error: string
  code: "STALE_VERSION"
  currentUpdatedAt: string
}

export function staleVersionResponse(
  entity: string,
  currentUpdatedAt: string,
): NextResponse<StaleVersionConflictPayload> {
  return NextResponse.json(
    {
      error: `This ${entity} was modified by another user since you started editing. Please refresh and try again.`,
      code: "STALE_VERSION",
      currentUpdatedAt,
    },
    { status: 409 },
  )
}

/**
 * Zod shape for a route that *requires* its caller to opt into optimistic locking. A save must
 * either carry the row version it was built from (`expectedUpdatedAt`) or say out loud that it is
 * a deliberate overwrite (`force: true`) — silence is no longer an accepted third option, because
 * a replace-the-set write built from stale data deletes whatever the other person added.
 *
 * Spread into the route's own object schema and pass the result through
 * `requireVersionTokenOrForce`.
 */
export const versionTokenShape = {
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
  /** Deliberate overwrite: skip the version check. Set by the "save anyway" path only. */
  force: z.boolean().optional(),
} as const

export interface VersionTokenInput {
  expectedUpdatedAt?: string
  force?: boolean
}

/**
 * 400 when a caller sent neither the row version nor an explicit `force`. Returns null when the
 * request is acceptable, so routes read `const bad = requireVersionTokenOrForce(parsed); if (bad) return bad`.
 */
export function requireVersionTokenOrForce(
  input: VersionTokenInput,
): NextResponse<{ error: string }> | null {
  if (input.expectedUpdatedAt || input.force) return null
  return NextResponse.json(
    {
      error:
        "expectedUpdatedAt is required — send the version you loaded, or force: true to overwrite deliberately.",
    },
    { status: 400 },
  )
}

export interface FieldConflict {
  field: string
  theirs: unknown
  yours: unknown
}

export interface FieldConflictPayload {
  error: string
  code: "FIELD_CONFLICT"
  currentUpdatedAt: string
  fields: string[]
}

export function fieldConflictResponse(
  entity: string,
  conflicts: FieldConflict[],
  currentUpdatedAt: string,
): NextResponse<FieldConflictPayload> {
  const fields = conflicts.map((c) => c.field)
  return NextResponse.json(
    {
      error: `Another user changed: ${fields.join(", ")} on this ${entity}. Refresh to see their version, or save anyway to keep yours.`,
      code: "FIELD_CONFLICT",
      currentUpdatedAt,
      fields,
    },
    { status: 409 },
  )
}

/** null/""/undefined are treated as equal for nullable text columns; numeric-vs-string compares by value. */
export function valuesEqual(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => (v === null || v === undefined || v === "" ? null : v)
  const na = norm(a)
  const nb = norm(b)
  if (na === nb) return true
  if (na === null || nb === null) return false
  if (typeof na === "number" || typeof nb === "number") {
    return Number(na) === Number(nb)
  }
  return false
}

/**
 * Fields the caller is actually changing (patch value differs from what they
 * loaded) where the current DB value has since diverged from that baseline.
 * Only columns present in `baseline` are considered, so sibling writes to
 * unrelated columns never trigger a conflict.
 */
export function detectFieldConflicts(
  patch: Record<string, unknown>,
  baseline: Record<string, unknown>,
  current: Record<string, unknown>,
): FieldConflict[] {
  const conflicts: FieldConflict[] = []

  for (const field of Object.keys(baseline)) {
    if (!(field in patch)) continue
    const isChanging = !valuesEqual(patch[field], baseline[field])
    if (!isChanging) continue

    const driftedFromBaseline = !valuesEqual(current[field], baseline[field])
    if (driftedFromBaseline) {
      conflicts.push({ field, theirs: current[field], yours: patch[field] })
    }
  }

  return conflicts
}
