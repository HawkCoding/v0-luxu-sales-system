import { NextResponse } from "next/server"
import { z } from "zod"
import nodemailer from "nodemailer"
import { ImapFlow } from "imapflow"
import { jsonZodError } from "@/lib/api/responses"
import { decryptCredential } from "@/lib/inbound-email/crypto"
import { requireSettingsWrite } from "@/lib/settings-access"

const bodySchema = z.object({
  id: z.string().uuid(),
})

const CREDENTIAL_COLUMNS =
  "id, email_address, smtp_host, smtp_port, smtp_encryption, imap_host, imap_port, imap_encryption, imap_sent_folder, encrypted_password"

export async function POST(request: Request) {
  const auth = await requireSettingsWrite()
  if (!auth.ok) return auth.response

  const result = bodySchema.safeParse(await request.json())
  if (!result.success) return jsonZodError(result.error, "Invalid request payload")

  const { data: credential, error: fetchError } = await auth.value.supabase
    .from("salesperson_credentials")
    .select(CREDENTIAL_COLUMNS)
    .eq("id", result.data.id)
    .single()

  if (fetchError || !credential) {
    return NextResponse.json({ error: "Credential not found" }, { status: 404 })
  }

  if (!credential.encrypted_password) {
    return NextResponse.json(
      { error: "No password stored — save a password before testing the connection" },
      { status: 400 },
    )
  }

  let password: string
  try {
    password = decryptCredential(credential.encrypted_password)
  } catch {
    return NextResponse.json({ error: "Failed to decrypt stored password" }, { status: 500 })
  }

  const smtpResult = await testSmtp({
    host: credential.smtp_host,
    port: credential.smtp_port,
    encryption: credential.smtp_encryption,
    username: credential.email_address,
    password,
  })

  const imapResult = await testImap({
    host: credential.imap_host,
    port: credential.imap_port,
    encryption: credential.imap_encryption,
    username: credential.email_address,
    password,
  })

  return NextResponse.json({
    smtp: smtpResult.ok ? "ok" : "error",
    imap: imapResult.ok ? "ok" : "error",
    smtpError: smtpResult.error ?? undefined,
    imapError: imapResult.error ?? undefined,
  })
}

async function testSmtp(params: {
  host: string
  port: number
  encryption: string
  username: string
  password: string
}): Promise<{ ok: boolean; error?: string }> {
  const transporter = nodemailer.createTransport({
    host: params.host,
    port: params.port,
    secure: params.encryption === "ssl",
    auth: { user: params.username, pass: params.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  })

  try {
    await transporter.verify()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "SMTP connection failed" }
  } finally {
    transporter.close()
  }
}

async function testImap(params: {
  host: string
  port: number
  encryption: string
  username: string
  password: string
}): Promise<{ ok: boolean; error?: string }> {
  const client = new ImapFlow({
    host: params.host,
    port: params.port,
    secure: params.encryption === "ssl",
    auth: { user: params.username, pass: params.password },
    logger: false,
  })

  try {
    await client.connect()
    await client.logout()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "IMAP connection failed" }
  }
}
