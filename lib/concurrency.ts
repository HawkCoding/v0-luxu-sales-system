import { NextResponse } from "next/server"

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
