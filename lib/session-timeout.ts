import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

export const SESSION_TIMEOUT_SETTING_KEY = "session_timeout_minutes"
export const DEFAULT_SESSION_TIMEOUT_MINUTES = 30
export const MIN_SESSION_TIMEOUT_MINUTES = 5
export const MAX_SESSION_TIMEOUT_MINUTES = 480

export function normalizeSessionTimeoutMinutes(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SESSION_TIMEOUT_MINUTES
  return Math.min(
    MAX_SESSION_TIMEOUT_MINUTES,
    Math.max(MIN_SESSION_TIMEOUT_MINUTES, Math.round(value)),
  )
}

export function parseSessionTimeoutMinutes(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return DEFAULT_SESSION_TIMEOUT_MINUTES

  const numericValue = typeof value === "number" ? value : Number(value)
  return normalizeSessionTimeoutMinutes(numericValue)
}

export function getSessionTimeoutWarningMinutes(sessionTimeoutMinutes: number): number {
  const normalizedTimeout = normalizeSessionTimeoutMinutes(sessionTimeoutMinutes)
  return Math.max(1, Math.min(5, Math.floor(normalizedTimeout / 5)))
}

export async function getSessionTimeoutMinutes(
  supabase: SupabaseClient<Database>,
): Promise<number> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SESSION_TIMEOUT_SETTING_KEY)
    .maybeSingle()

  if (error) return DEFAULT_SESSION_TIMEOUT_MINUTES
  return parseSessionTimeoutMinutes(data?.value)
}
