import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

export const DEFAULT_DEPOSIT_PERCENTAGE = 25
export const DEFAULT_DEPOSIT_PERCENT = DEFAULT_DEPOSIT_PERCENTAGE / 100
export const DEFAULT_DEPOSIT_PERCENTAGE_SETTING_KEY = "default_deposit_percentage"

export function normalizeDepositPercentage(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DEPOSIT_PERCENTAGE
  return Math.min(100, Math.max(0, Math.round(value * 100) / 100))
}

export function parseDepositPercentage(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return DEFAULT_DEPOSIT_PERCENTAGE

  const numericValue = typeof value === "number" ? value : Number(value)
  return normalizeDepositPercentage(numericValue)
}

export function depositPercentageToRate(percentage: number): number {
  return normalizeDepositPercentage(percentage) / 100
}

export function calculateDepositAmount(
  quoteTotal: number,
  depositPercentage = DEFAULT_DEPOSIT_PERCENTAGE,
): number {
  return Math.round(quoteTotal * depositPercentageToRate(depositPercentage) * 100) / 100
}

export async function getDefaultDepositPercentage(
  supabase: SupabaseClient<Database>,
): Promise<number> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", DEFAULT_DEPOSIT_PERCENTAGE_SETTING_KEY)
    .maybeSingle()

  if (error) return DEFAULT_DEPOSIT_PERCENTAGE
  return parseDepositPercentage(data?.value)
}
