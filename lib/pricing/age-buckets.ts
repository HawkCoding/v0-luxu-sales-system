import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

export interface AgeBuckets {
  infantMax: number
  childMax: number
}

export const DEFAULT_AGE_BUCKETS: AgeBuckets = {
  infantMax: 2,
  childMax: 12,
}

const INFANT_KEY = "default_infant_max_age"
const CHILD_KEY = "default_child_max_age"

export interface SupplierAgeOverride {
  infantMaxAge: number | null
  childMaxAge: number | null
}

function clampAge(value: unknown, fallback: number): number {
  const num = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(num) || num < 0 || num > 17) return fallback
  return Math.floor(num)
}

export function resolveAgeBuckets(
  defaults: AgeBuckets,
  supplier?: SupplierAgeOverride | null,
): AgeBuckets {
  const infantMax = supplier?.infantMaxAge ?? defaults.infantMax
  const childMax = supplier?.childMaxAge ?? defaults.childMax
  const safeInfant = clampAge(infantMax, DEFAULT_AGE_BUCKETS.infantMax)
  const safeChild = clampAge(childMax, DEFAULT_AGE_BUCKETS.childMax)
  // Enforce ordering: infant ≤ child
  return {
    infantMax: Math.min(safeInfant, safeChild),
    childMax: safeChild,
  }
}

export function classifyAge(
  age: number,
  buckets: AgeBuckets,
): "infant" | "child" | "adult" {
  if (age <= buckets.infantMax) return "infant"
  if (age <= buckets.childMax) return "child"
  return "adult"
}

export function formatBucketRange(buckets: AgeBuckets): {
  adult: string
  child: string
  infant: string
} {
  const adultMin = buckets.childMax + 1
  const infantMin = 0
  return {
    adult: `${adultMin}+`,
    child: `${buckets.infantMax + 1}–${buckets.childMax}`,
    infant: `${infantMin}–${buckets.infantMax}`,
  }
}

export async function fetchDefaultAgeBuckets(
  supabase: SupabaseClient<Database>,
): Promise<AgeBuckets> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", [INFANT_KEY, CHILD_KEY])
  if (error) return DEFAULT_AGE_BUCKETS
  const map = new Map<string, string>((data ?? []).map((row) => [row.key, row.value]))
  return {
    infantMax: clampAge(map.get(INFANT_KEY), DEFAULT_AGE_BUCKETS.infantMax),
    childMax: clampAge(map.get(CHILD_KEY), DEFAULT_AGE_BUCKETS.childMax),
  }
}

export const AGE_SETTINGS_KEYS = {
  INFANT: INFANT_KEY,
  CHILD: CHILD_KEY,
} as const
