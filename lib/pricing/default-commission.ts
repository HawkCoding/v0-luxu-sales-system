import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { CommissionKind } from "@/lib/types"

export const DEFAULT_COMMISSION_TYPE_SETTING_KEY = "default_commission_type"
export const DEFAULT_COMMISSION_VALUE_SETTING_KEY = "default_commission_value"

/** The house commission every new job starts from. A salesperson can still override it per
 * booking in Build Booking -- this only decides what the field (and the auto-priced draft
 * quote) starts at, so no job stalls waiting for someone to remember the standard rate. */
export interface DefaultCommission {
  type: CommissionKind
  value: number
}

/** Zero means "no commission until an admin configures one": the auto-draft skips the
 * commission line entirely rather than writing a R0.00 line onto every quote. */
export const DEFAULT_COMMISSION: DefaultCommission = { type: "percent", value: 0 }

const MAX_PER_PERSON_COMMISSION = 1_000_000

export function normalizeCommissionValue(type: CommissionKind, value: number): number {
  if (!Number.isFinite(value)) return 0
  const max = type === "percent" ? 100 : MAX_PER_PERSON_COMMISSION
  return Math.min(max, Math.max(0, Math.round(value * 100) / 100))
}

function parseCommissionType(value: string | null | undefined): CommissionKind {
  return value === "per_person" ? "per_person" : "percent"
}

export function parseDefaultCommission(
  type: string | null | undefined,
  value: string | number | null | undefined,
): DefaultCommission {
  const resolvedType = parseCommissionType(type)
  if (value === null || value === undefined || value === "") {
    return { type: resolvedType, value: 0 }
  }
  const numericValue = typeof value === "number" ? value : Number(value)
  return { type: resolvedType, value: normalizeCommissionValue(resolvedType, numericValue) }
}

export async function getDefaultCommission(
  supabase: SupabaseClient<Database>,
): Promise<DefaultCommission> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", [DEFAULT_COMMISSION_TYPE_SETTING_KEY, DEFAULT_COMMISSION_VALUE_SETTING_KEY])

  if (error) return DEFAULT_COMMISSION

  const byKey = new Map((data ?? []).map((row) => [row.key, row.value]))
  return parseDefaultCommission(
    byKey.get(DEFAULT_COMMISSION_TYPE_SETTING_KEY),
    byKey.get(DEFAULT_COMMISSION_VALUE_SETTING_KEY),
  )
}
