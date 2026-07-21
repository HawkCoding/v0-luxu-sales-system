import { NextResponse } from "next/server"
import { z } from "zod"
import { jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { encryptCredential } from "@/lib/inbound-email/crypto"
import {
  getEmailSignaturesByProfileIds,
  signatureFieldsSchema,
  upsertEmailSignature,
} from "@/lib/email/signature-admin"
import { requireManagerSettingsAccess } from "@/lib/settings-access"
import { createSessionClient } from "@/lib/supabase/server"
import { extractRoleFromJwt } from "@/lib/role-utils"
import type { Database } from "@/lib/supabase/types"

type SalespersonCredentialUpdate = Database["public"]["Tables"]["salesperson_credentials"]["Update"]

const updateSchema = z
  .object({
    email_address: z.string().trim().email().optional(),
    smtp_host: z.string().trim().min(1).optional(),
    smtp_port: z.coerce.number().int().min(1).max(65535).optional(),
    smtp_encryption: z.enum(["ssl", "starttls", "none"]).optional(),
    imap_host: z.string().trim().min(1).optional(),
    imap_port: z.coerce.number().int().min(1).max(65535).optional(),
    imap_encryption: z.enum(["ssl", "starttls", "none"]).optional(),
    imap_sent_folder: z.string().trim().min(1).optional(),
    password: z.string().min(1).optional(),
  })
  .merge(signatureFieldsSchema)

const SAFE_COLUMNS =
  "id, profile_id, email_address, smtp_host, smtp_port, smtp_encryption, imap_host, imap_port, imap_encryption, imap_sent_folder, created_at, updated_at"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createSessionClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = extractRoleFromJwt(user)
  if (!role || !["admin", "manager", "consultant"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const isManagerOrAbove = ["admin", "manager"].includes(role)

  const query = supabase
    .from("salesperson_credentials")
    .select(SAFE_COLUMNS)
    .eq("id", id)

  if (!isManagerOrAbove) {
    query.eq("profile_id", user.id)
  }

  const { data, error } = await query.single()
  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const signatures = await getEmailSignaturesByProfileIds(supabase, [data.profile_id])

  return NextResponse.json({ credential: { ...data, signature: signatures.get(data.profile_id) ?? null } })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requireManagerSettingsAccess()
  if (!auth.ok) return auth.response

  const result = updateSchema.safeParse(await request.json())
  if (!result.success) return jsonZodError(result.error, "Invalid request payload")
  const parsed = result.data

  const updates: SalespersonCredentialUpdate = { updated_at: new Date().toISOString() }
  if (parsed.email_address !== undefined) updates.email_address = parsed.email_address.toLowerCase()
  if (parsed.smtp_host !== undefined) updates.smtp_host = parsed.smtp_host
  if (parsed.smtp_port !== undefined) updates.smtp_port = parsed.smtp_port
  if (parsed.smtp_encryption !== undefined) updates.smtp_encryption = parsed.smtp_encryption
  if (parsed.imap_host !== undefined) updates.imap_host = parsed.imap_host
  if (parsed.imap_port !== undefined) updates.imap_port = parsed.imap_port
  if (parsed.imap_encryption !== undefined) updates.imap_encryption = parsed.imap_encryption
  if (parsed.imap_sent_folder !== undefined) updates.imap_sent_folder = parsed.imap_sent_folder
  if (parsed.password) updates.encrypted_password = encryptCredential(parsed.password)

  const { data, error } = await auth.value.supabase
    .from("salesperson_credentials")
    .update(updates)
    .eq("id", id)
    .select(SAFE_COLUMNS)
    .single()

  if (error || !data) return safeSupabaseError("salesperson-credentials:update", error, "Failed to update credential")

  const { error: signatureError } = await upsertEmailSignature(auth.value.supabase, data.profile_id, parsed)
  if (signatureError) return safeSupabaseError("salesperson-credentials:signature", signatureError)

  const signatures = await getEmailSignaturesByProfileIds(auth.value.supabase, [data.profile_id])

  return NextResponse.json({ credential: { ...data, signature: signatures.get(data.profile_id) ?? null } })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requireManagerSettingsAccess()
  if (!auth.ok) return auth.response

  const { error } = await auth.value.supabase
    .from("salesperson_credentials")
    .delete()
    .eq("id", id)

  if (error) return safeSupabaseError("salesperson-credentials:delete", error, "Failed to delete credential")

  return NextResponse.json({ success: true })
}
