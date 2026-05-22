import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { SupplierKind } from "@/lib/types"

export const TRAIN_CHILD_PRICE_RATIO_SETTING_KEY = "train_child_price_ratio"
export const DEFAULT_TRAIN_CHILD_PRICE_RATIO = 0.5

export function normalizeTrainChildPriceRatio(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TRAIN_CHILD_PRICE_RATIO
  return Math.min(1, Math.max(0, Math.round(value * 10000) / 10000))
}

export function parseTrainChildPriceRatio(
  value: string | number | null | undefined,
): number {
  if (value === null || value === undefined || value === "") {
    return DEFAULT_TRAIN_CHILD_PRICE_RATIO
  }
  const numeric = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_TRAIN_CHILD_PRICE_RATIO
  return normalizeTrainChildPriceRatio(numeric)
}

export function computeChildPrice(adult: number, ratio: number): number {
  if (!Number.isFinite(adult) || adult <= 0) return 0
  const safeRatio = normalizeTrainChildPriceRatio(ratio)
  return Math.round(adult * safeRatio * 100) / 100
}

export function shouldAutoFillChild(args: {
  kind: SupplierKind
  currentChild: number | null
  newAdult: number
}): boolean {
  return (
    args.kind === "train_operator" &&
    args.currentChild === null &&
    Number.isFinite(args.newAdult) &&
    args.newAdult > 0
  )
}

export function shouldPromptChildUpdate(args: {
  kind: SupplierKind
  currentChild: number | null
  newAdult: number
  ratio: number
}): boolean {
  if (args.kind !== "train_operator") return false
  if (args.currentChild === null) return false
  if (!Number.isFinite(args.newAdult) || args.newAdult <= 0) return false
  const proposed = computeChildPrice(args.newAdult, args.ratio)
  return Math.abs(proposed - args.currentChild) > 0.01
}

export async function getTrainChildPriceRatio(
  supabase: SupabaseClient<Database>,
): Promise<number> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", TRAIN_CHILD_PRICE_RATIO_SETTING_KEY)
    .maybeSingle()

  if (error) return DEFAULT_TRAIN_CHILD_PRICE_RATIO
  return parseTrainChildPriceRatio(data?.value)
}
