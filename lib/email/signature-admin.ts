import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

/**
 * Per-person signature fields, edited by admin/manager alongside a
 * salesperson's mailbox credential in Settings. All optional — a blank field
 * is simply omitted from the rendered signature (lib/email/signature.ts).
 */
export const signatureFieldsSchema = z.object({
  full_name: z.string().trim().max(200).optional(),
  job_title: z.string().trim().max(200).optional(),
  tel: z.string().trim().max(60).optional(),
  cell: z.string().trim().max(60).optional(),
  fax: z.string().trim().max(60).optional(),
  email: z.string().trim().max(320).email().optional().or(z.literal("")),
  website: z.string().trim().max(200).optional(),
})

export type SignatureFields = z.infer<typeof signatureFieldsSchema>

export interface SignatureRow {
  full_name: string | null
  job_title: string | null
  tel: string | null
  cell: string | null
  fax: string | null
  email: string | null
  website: string | null
}

const SIGNATURE_FIELD_KEYS = ["full_name", "job_title", "tel", "cell", "fax", "email", "website"] as const

/**
 * Upsert the email_signatures row for a profile. Only the signature fields
 * present in `fields` are written — an absent key leaves the stored column
 * alone, a blank string clears it to null (readers treat null exactly like a
 * missing row, falling back to the profile name/email). No-op when no
 * signature field is present at all, so a mailbox-only PATCH never touches
 * the signature. `fields` may carry unrelated keys (the credential payload);
 * they are ignored.
 */
export async function upsertEmailSignature(
  supabase: SupabaseClient<Database>,
  profileId: string,
  fields: SignatureFields,
): Promise<{ error: string | null }> {
  const row: Database["public"]["Tables"]["email_signatures"]["Insert"] = { profile_id: profileId }
  let hasAnyField = false
  for (const key of SIGNATURE_FIELD_KEYS) {
    const value = fields[key]
    if (value === undefined) continue
    hasAnyField = true
    row[key] = value.trim() || null
  }
  if (!hasAnyField) return { error: null }

  row.updated_at = new Date().toISOString()
  const { error } = await supabase.from("email_signatures").upsert(row)

  return { error: error?.message ?? null }
}

export async function getEmailSignaturesByProfileIds(
  supabase: SupabaseClient<Database>,
  profileIds: string[],
): Promise<Map<string, SignatureRow>> {
  if (profileIds.length === 0) return new Map()

  const { data } = await supabase
    .from("email_signatures")
    .select("profile_id, full_name, job_title, tel, cell, fax, email, website")
    .in("profile_id", profileIds)

  return new Map((data ?? []).map((row) => [row.profile_id, row]))
}
