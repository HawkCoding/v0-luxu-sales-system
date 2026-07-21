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

/** Upsert the email_signatures row for a profile. No-op when every field is blank/absent. */
export async function upsertEmailSignature(
  supabase: SupabaseClient<Database>,
  profileId: string,
  fields: SignatureFields,
): Promise<{ error: string | null }> {
  const hasAnyField = Object.values(fields).some((value) => value !== undefined && value !== "")
  if (!hasAnyField) return { error: null }

  const { error } = await supabase.from("email_signatures").upsert({
    profile_id: profileId,
    full_name: fields.full_name || null,
    job_title: fields.job_title || null,
    tel: fields.tel || null,
    cell: fields.cell || null,
    fax: fields.fax || null,
    email: fields.email || null,
    website: fields.website || null,
    updated_at: new Date().toISOString(),
  })

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
