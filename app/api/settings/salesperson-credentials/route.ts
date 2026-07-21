import { NextResponse } from "next/server"
import { z } from "zod"
import { jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { encryptCredential } from "@/lib/inbound-email/crypto"
import {
  getEmailSignaturesByProfileIds,
  signatureFieldsSchema,
  upsertEmailSignature,
  type SignatureRow,
} from "@/lib/email/signature-admin"
import { requireManagerSettingsAccess } from "@/lib/settings-access"
import type { Database } from "@/lib/supabase/types"

type SalespersonCredentialInsert = Database["public"]["Tables"]["salesperson_credentials"]["Insert"]

const createSchema = z
  .object({
    profile_id: z.string().uuid(),
    email_address: z.string().trim().email(),
    smtp_host: z.string().trim().min(1).default("mail.sa-rail.co.za"),
    smtp_port: z.coerce.number().int().min(1).max(65535).default(465),
    smtp_encryption: z.enum(["ssl", "starttls", "none"]).default("ssl"),
    imap_host: z.string().trim().min(1).default("mail.sa-rail.co.za"),
    imap_port: z.coerce.number().int().min(1).max(65535).default(993),
    imap_encryption: z.enum(["ssl", "starttls", "none"]).default("ssl"),
    imap_sent_folder: z.string().trim().min(1).default("Sent"),
    password: z.string().min(1).optional(),
  })
  .merge(signatureFieldsSchema)

function mapRow(
  row: {
    id: string
    profile_id: string
    email_address: string
    smtp_host: string
    smtp_port: number
    smtp_encryption: string
    imap_host: string
    imap_port: number
    imap_encryption: string
    imap_sent_folder: string
    created_at: string
    updated_at: string
  },
  signature: SignatureRow | null,
) {
  return {
    id: row.id,
    profile_id: row.profile_id,
    email_address: row.email_address,
    smtp_host: row.smtp_host,
    smtp_port: row.smtp_port,
    smtp_encryption: row.smtp_encryption,
    imap_host: row.imap_host,
    imap_port: row.imap_port,
    imap_encryption: row.imap_encryption,
    imap_sent_folder: row.imap_sent_folder,
    created_at: row.created_at,
    updated_at: row.updated_at,
    signature,
  }
}

const SAFE_COLUMNS =
  "id, profile_id, email_address, smtp_host, smtp_port, smtp_encryption, imap_host, imap_port, imap_encryption, imap_sent_folder, created_at, updated_at"

export async function GET() {
  const auth = await requireManagerSettingsAccess()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.value.supabase
    .from("salesperson_credentials")
    .select(SAFE_COLUMNS)
    .order("created_at", { ascending: true })

  if (error) return safeSupabaseError("salesperson-credentials:list", error, "Failed to load credentials")

  const rows = data ?? []
  const signatures = await getEmailSignaturesByProfileIds(
    auth.value.supabase,
    rows.map((row) => row.profile_id),
  )

  return NextResponse.json({
    credentials: rows.map((row) => mapRow(row, signatures.get(row.profile_id) ?? null)),
  })
}

export async function POST(request: Request) {
  const auth = await requireManagerSettingsAccess()
  if (!auth.ok) return auth.response

  const result = createSchema.safeParse(await request.json())
  if (!result.success) return jsonZodError(result.error, "Invalid request payload")
  const parsed = result.data

  const insert: SalespersonCredentialInsert = {
    profile_id: parsed.profile_id,
    email_address: parsed.email_address.toLowerCase(),
    smtp_host: parsed.smtp_host,
    smtp_port: parsed.smtp_port,
    smtp_encryption: parsed.smtp_encryption,
    imap_host: parsed.imap_host,
    imap_port: parsed.imap_port,
    imap_encryption: parsed.imap_encryption,
    imap_sent_folder: parsed.imap_sent_folder,
  }

  if (parsed.password) {
    insert.encrypted_password = encryptCredential(parsed.password)
  }

  const { data, error } = await auth.value.supabase
    .from("salesperson_credentials")
    .insert(insert)
    .select(SAFE_COLUMNS)
    .single()

  if (error || !data) return safeSupabaseError("salesperson-credentials:create", error, "Failed to create credential")

  const { error: signatureError } = await upsertEmailSignature(auth.value.supabase, parsed.profile_id, parsed)
  if (signatureError) return safeSupabaseError("salesperson-credentials:signature", signatureError)

  const signature: SignatureRow = {
    full_name: parsed.full_name || null,
    job_title: parsed.job_title || null,
    tel: parsed.tel || null,
    cell: parsed.cell || null,
    fax: parsed.fax || null,
    email: parsed.email || null,
    website: parsed.website || null,
  }

  return NextResponse.json({ credential: mapRow(data, signature) }, { status: 201 })
}
