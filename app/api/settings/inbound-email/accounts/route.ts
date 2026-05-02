import { NextResponse } from "next/server"
import { z } from "zod"
import { encryptCredential } from "@/lib/inbound-email/crypto"
import { requireAdminSettingsAccess } from "@/lib/settings-access"

const accountSchema = z.object({
  email: z.string().trim().email(),
  host: z.string().trim().min(1),
  port: z.coerce.number().int().min(1).max(65535).default(993),
  tlsMode: z.enum(["ssl_tls", "starttls", "none"]).default("ssl_tls"),
  username: z.string().trim().min(1),
  password: z.string().min(1),
  inboxFolder: z.string().trim().min(1).default("INBOX"),
  processedFolder: z.string().trim().min(1).default("Processed"),
  needsReviewFolder: z.string().trim().min(1).default("Needs Review"),
  enabled: z.boolean().default(true),
})

function mapAccount(row: {
  id: string
  email: string
  host: string
  port: number
  tls_mode: string
  username: string
  inbox_folder: string
  processed_folder: string
  needs_review_folder: string
  enabled: boolean
  first_sync_completed: boolean
  last_synced_at: string | null
  created_at: string
  updated_at: string
}) {
  return {
    id: row.id,
    email: row.email,
    host: row.host,
    port: row.port,
    tlsMode: row.tls_mode,
    username: row.username,
    inboxFolder: row.inbox_folder,
    processedFolder: row.processed_folder,
    needsReviewFolder: row.needs_review_folder,
    enabled: row.enabled,
    firstSyncCompleted: row.first_sync_completed,
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function GET() {
  const auth = await requireAdminSettingsAccess()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.value.supabase
    .from("inbound_email_accounts")
    .select("id, email, host, port, tls_mode, username, inbox_folder, processed_folder, needs_review_folder, enabled, first_sync_completed, last_synced_at, created_at, updated_at")
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: "Failed to load inbound email accounts" }, { status: 500 })
  }

  return NextResponse.json({ accounts: (data ?? []).map(mapAccount) })
}

export async function POST(request: Request) {
  const auth = await requireAdminSettingsAccess()
  if (!auth.ok) return auth.response

  let parsed: z.infer<typeof accountSchema>
  try {
    parsed = accountSchema.parse(await request.json())
  } catch (error) {
    return NextResponse.json({ error: "Invalid request payload", details: error }, { status: 400 })
  }

  const { data, error } = await auth.value.supabase
    .from("inbound_email_accounts")
    .insert({
      email: parsed.email.toLowerCase(),
      host: parsed.host,
      port: parsed.port,
      tls_mode: parsed.tlsMode,
      username: parsed.username,
      password_encrypted: encryptCredential(parsed.password),
      inbox_folder: parsed.inboxFolder,
      processed_folder: parsed.processedFolder,
      needs_review_folder: parsed.needsReviewFolder,
      enabled: parsed.enabled,
    })
    .select("id, email, host, port, tls_mode, username, inbox_folder, processed_folder, needs_review_folder, enabled, first_sync_completed, last_synced_at, created_at, updated_at")
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Failed to create account" }, { status: 500 })
  }

  await auth.value.supabase.from("audit_logs").insert({
    actor: auth.value.actorName,
    actor_user_id: auth.value.userId,
    entity_type: "InboundEmailAccount",
    entity_id: data.id,
    action: "inbound_email_account_created",
    meta_json: { email: data.email },
  })

  return NextResponse.json({ account: mapAccount(data) }, { status: 201 })
}
