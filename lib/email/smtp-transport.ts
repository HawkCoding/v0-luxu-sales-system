import nodemailer from "nodemailer"
import { ImapFlow } from "imapflow"
import { decryptCredential } from "@/lib/inbound-email/crypto"
import { createServiceClient } from "@/lib/supabase/server"

export interface SmtpSendParams {
  credentialId: string
  to: string[]
  cc?: string[]
  subject: string
  htmlBody: string
  textBody?: string
  attachments?: Array<{
    filename: string
    content: Buffer
    contentType: string
  }>
}

export interface SmtpSendResult {
  messageId: string
  rawMessage: Buffer
  sentAppendFailed?: boolean
}

const CREDENTIAL_COLUMNS =
  "id, email_address, smtp_host, smtp_port, smtp_encryption, imap_host, imap_port, imap_encryption, imap_sent_folder, encrypted_password"

export async function sendViaSalespersonSmtp(params: SmtpSendParams): Promise<SmtpSendResult> {
  const supabase = createServiceClient()

  const { data: credential, error } = await supabase
    .from("salesperson_credentials")
    .select(CREDENTIAL_COLUMNS)
    .eq("id", params.credentialId)
    .single()

  if (error || !credential) {
    throw new Error(`Salesperson credential not found: ${params.credentialId}`)
  }

  if (!credential.encrypted_password) {
    throw new Error(`No password stored for credential ${params.credentialId}`)
  }

  const password = decryptCredential(credential.encrypted_password)

  const useLive =
    process.env.NODE_ENV === "production" || process.env.SMTP_FORCE_LIVE === "true"

  if (!useLive) {
    return sendViaMailpit(params, credential.email_address)
  }

  return sendViaCpanelSmtp(params, credential, password)
}

async function sendViaMailpit(
  params: SmtpSendParams,
  fromAddress: string,
): Promise<SmtpSendResult> {
  const host = process.env.MAILPIT_SMTP_HOST ?? "127.0.0.1"
  const port = Number(process.env.MAILPIT_SMTP_PORT ?? 1025)

  const transporter = nodemailer.createTransport({ host, port, secure: false })

  const info = await transporter.sendMail({
    from: fromAddress,
    to: params.to,
    cc: params.cc,
    subject: params.subject,
    html: params.htmlBody,
    text: params.textBody,
    attachments: params.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  })

  transporter.close()

  return {
    messageId: info.messageId,
    rawMessage: Buffer.from(""),
  }
}

async function sendViaCpanelSmtp(
  params: SmtpSendParams,
  credential: {
    email_address: string
    smtp_host: string
    smtp_port: number
    smtp_encryption: string
    imap_host: string
    imap_port: number
    imap_encryption: string
    imap_sent_folder: string
  },
  password: string,
): Promise<SmtpSendResult> {
  const transporter = nodemailer.createTransport({
    host: credential.smtp_host,
    port: credential.smtp_port,
    secure: credential.smtp_encryption === "ssl",
    auth: { user: credential.email_address, pass: password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  })

  let rawMessage: Buffer = Buffer.from("")

  const mailOptions: nodemailer.SendMailOptions = {
    from: credential.email_address,
    to: params.to,
    cc: params.cc,
    subject: params.subject,
    html: params.htmlBody,
    text: params.textBody,
    attachments: params.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  }

  // Capture the raw RFC822 message before sending so we can append it to Sent
  try {
    rawMessage = await new Promise<Buffer>((resolve, reject) => {
      const mail = nodemailer.createTransport({ streamTransport: true, newline: "unix" })
      mail.sendMail(mailOptions, (err, info) => {
        if (err) { reject(err); return }
        const msg = info.message
        if (Buffer.isBuffer(msg)) {
          resolve(msg)
          return
        }
        const chunks: Buffer[] = []
        msg.on("data", (chunk: Buffer) => chunks.push(chunk))
        msg.on("end", () => resolve(Buffer.concat(chunks)))
        msg.on("error", reject)
      })
    })
  } catch {
    // Non-fatal — proceed without raw capture; Sent append will be skipped
    rawMessage = Buffer.from("")
  }

  const info = await transporter.sendMail(mailOptions)
  transporter.close()

  let sentAppendFailed = false

  if (rawMessage.length > 0) {
    try {
      await appendToImapSent({
        host: credential.imap_host,
        port: credential.imap_port,
        encryption: credential.imap_encryption,
        username: credential.email_address,
        password,
        sentFolder: credential.imap_sent_folder,
        rawMessage,
      })
    } catch (err) {
      console.warn(
        "[smtp-transport] IMAP Sent append failed — email was delivered, not resending",
        err instanceof Error ? err.message : err,
      )
      sentAppendFailed = true
    }
  }

  return {
    messageId: info.messageId,
    rawMessage,
    sentAppendFailed,
  }
}

async function appendToImapSent(params: {
  host: string
  port: number
  encryption: string
  username: string
  password: string
  sentFolder: string
  rawMessage: Buffer
}): Promise<void> {
  const client = new ImapFlow({
    host: params.host,
    port: params.port,
    secure: params.encryption === "ssl",
    auth: { user: params.username, pass: params.password },
    logger: false,
  })

  await client.connect()
  try {
    await client.append(params.sentFolder, params.rawMessage, ["\\Seen"])
  } finally {
    await client.logout()
  }
}
