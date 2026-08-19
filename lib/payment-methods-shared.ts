// Client-safe payment-method constants/types/schemas — zero runtime imports
// from lib/settings-access (which pulls lib/supabase/server -> next/headers
// and would break any client component that imported it transitively).
// lib/payment-methods.ts (server-only) re-exports these for existing callers
// and adds the Supabase-querying functions.

import { z } from "zod"
import type { BankingSettings } from "@/lib/settings-access"

export const MAX_PAYMENT_METHODS = 10

// Mirrors BANKING_SETTING_KEYS (lib/settings-access.ts) — duplicated here
// (rather than imported) so this file stays free of runtime settings-access
// imports and safe for client components.
export const PAYMENT_METHOD_FIELD_KEYS = [
  "bank_name",
  "bank_account_name",
  "bank_account_number",
  "bank_branch_code",
  "bank_swift_code",
  "company_address",
  "company_reg_number",
  "company_vat_number",
  "company_tel",
  "company_cell",
  "company_fax",
  "company_email",
  "company_website",
] as const satisfies readonly (keyof BankingSettings)[]

export interface PaymentMethod {
  id: string
  name: string
  enabled: boolean
  isDefault: boolean
  sortOrder: number
  banking: BankingSettings
}

// Empty strings are allowed so a value can be cleared back to blank.
const fieldSchema = z.string().trim().max(300).nullable().optional()

export const paymentMethodFieldsSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  ...Object.fromEntries(PAYMENT_METHOD_FIELD_KEYS.map((key) => [key, fieldSchema])),
})

export const createPaymentMethodSchema = z.object({
  name: z.string().trim().min(1).max(120),
})
