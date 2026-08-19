// Server-only: queries Supabase and lib/settings-access (next/headers via
// lib/supabase/server). Client components must import constants/types/schemas
// from lib/payment-methods-shared instead, or the build breaks — see there.

import type { SupabaseClient } from "@supabase/supabase-js"
import { getBankingSettings, type BankingSettings } from "@/lib/settings-access"
import { PAYMENT_METHOD_FIELD_KEYS, type PaymentMethod } from "@/lib/payment-methods-shared"
import { PAYMENT_METHOD_COLUMNS } from "@/lib/supabase/columns"
import type { Database } from "@/lib/supabase/types"

export { MAX_PAYMENT_METHODS, paymentMethodFieldsSchema, createPaymentMethodSchema } from "@/lib/payment-methods-shared"
export type { PaymentMethod } from "@/lib/payment-methods-shared"

export type PaymentMethodRow = Database["public"]["Tables"]["payment_methods"]["Row"]

/**
 * Merge a payment method row over the legacy app_settings banking fallback —
 * blank/null on the row means "inherit the fallback". Keeps `BankingSettings`
 * the shape every PDF/email consumer already expects, so no downstream
 * signature changes.
 */
export function toBankingSettings(row: PaymentMethodRow, fallback: BankingSettings): BankingSettings {
  return Object.fromEntries(
    PAYMENT_METHOD_FIELD_KEYS.map((key) => [key, row[key]?.trim() || fallback[key] || ""]),
  ) as BankingSettings
}

function toPaymentMethod(row: PaymentMethodRow, fallback: BankingSettings): PaymentMethod {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    isDefault: row.is_default,
    sortOrder: row.sort_order,
    banking: toBankingSettings(row, fallback),
  }
}

/**
 * Resolves the payment method to use for a PDF/email: the requested id when
 * it exists and is enabled, else the enabled default, else the
 * lowest-sort-order enabled row, else the pure app_settings fallback (an
 * install with no payment methods configured yet). An unknown or disabled id
 * falls back rather than throwing — a stale invoice referencing a since-
 * deleted method must still render.
 */
export async function getPaymentMethod(
  supabase: SupabaseClient<Database>,
  id?: string | null,
): Promise<PaymentMethod> {
  const fallback = await getBankingSettings(supabase)

  const { data: rows } = await supabase
    .from("payment_methods")
    .select(PAYMENT_METHOD_COLUMNS)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  const all = rows ?? []
  const requested = id ? all.find((row) => row.id === id && row.enabled) : undefined
  const chosen =
    requested ?? all.find((row) => row.enabled && row.is_default) ?? all.find((row) => row.enabled)

  if (!chosen) {
    return {
      id: "",
      name: "Primary",
      enabled: true,
      isDefault: true,
      sortOrder: 0,
      banking: fallback,
    }
  }

  return toPaymentMethod(chosen, fallback)
}
