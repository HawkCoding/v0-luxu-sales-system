import nodemailer from "nodemailer"
import { Resend } from "resend"
import { sendViaSalespersonSmtp } from "@/lib/email/smtp-transport"

export interface SendEmailAttachment {
  filename: string
  content: Buffer | string
  contentType?: string
}

export interface SendEmailResult {
  success: boolean
  provider: "smtp" | "resend" | "mailpit"
  providerMessageId: string | null
  error: string | null
  sentAppendFailed?: boolean
}

function normalizeRecipients(to: string | string[]): string[] {
  return Array.isArray(to)
    ? to.map((recipient) => recipient.trim()).filter(Boolean)
    : to.split(",").map((recipient) => recipient.trim()).filter(Boolean)
}

export interface MailpitSmtpConfig {
  host: string
  port: number
}

export function resolveMailpitSmtpConfig(): MailpitSmtpConfig {
  const explicitUrl = process.env.MAILPIT_SMTP_URL?.trim()
  if (explicitUrl) {
    const parsed = new URL(explicitUrl)
    const port = Number(parsed.port || 1025)
    if (!Number.isFinite(port)) {
      throw new Error(`Invalid MAILPIT_SMTP_URL port: ${parsed.port}`)
    }
    return { host: parsed.hostname, port }
  }

  const host = process.env.MAILPIT_SMTP_HOST?.trim()
  const portRaw = process.env.MAILPIT_SMTP_PORT?.trim()
  if (host && portRaw) {
    const port = Number(portRaw)
    if (!Number.isFinite(port)) {
      throw new Error(`Invalid MAILPIT_SMTP_PORT: ${portRaw}`)
    }
    return { host, port }
  }

  return { host: "127.0.0.1", port: 1025 }
}

async function sendWithMailpit(options: SendEmailOptions): Promise<SendEmailResult> {
  const { host, port } = resolveMailpitSmtpConfig()
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  })

  try {
    const info = await transporter.sendMail({
      from: options.from,
      to: normalizeRecipients(options.to),
      subject: options.subject,
      html: options.html ?? undefined,
      text: options.text ?? undefined,
      attachments: options.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: typeof attachment.content === "string"
          ? Buffer.from(attachment.content, "base64")
          : attachment.content,
        contentType: attachment.contentType,
      })),
    })

    return {
      success: true,
      provider: "mailpit",
      providerMessageId: info.messageId,
      error: null,
    }
  } catch (error) {
    return {
      success: false,
      provider: "mailpit",
      providerMessageId: null,
      error: error instanceof Error ? error.message : "Mailpit send failed",
    }
  }
}

async function sendWithResend(options: SendEmailOptions, apiKey: string): Promise<SendEmailResult> {
  const resend = new Resend(apiKey)
  const baseMessage = {
    from: options.from,
    to: normalizeRecipients(options.to),
    subject: options.subject,
  }

  try {
    const attachments = options.attachments?.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content,
      contentType: attachment.contentType,
    }))

    const { data, error } = options.html
      ? await resend.emails.send({ ...baseMessage, html: options.html, attachments })
      : await resend.emails.send({ ...baseMessage, text: options.text ?? "", attachments })

    if (error) {
      return {
        success: false,
        provider: "resend",
        providerMessageId: null,
        error: error.message,
      }
    }

    return {
      success: true,
      provider: "resend",
      providerMessageId: data?.id ?? null,
      error: null,
    }
  } catch (error) {
    return {
      success: false,
      provider: "resend",
      providerMessageId: null,
      error: error instanceof Error ? error.message : "Resend send failed",
    }
  }
}

export interface SendEmailOptions {
  from: string
  to: string | string[]
  subject: string
  html?: string | null
  text?: string | null
  attachments?: SendEmailAttachment[]
  /** When set, routes the email through the salesperson's cPanel SMTP account. */
  salespersonCredentialId?: string | null
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const recipients = normalizeRecipients(options.to)

  if (recipients.length === 0) {
    return {
      success: false,
      provider: options.salespersonCredentialId ? "smtp" : process.env.RESEND_API_KEY ? "resend" : "mailpit",
      providerMessageId: null,
      error: "Email recipient is required",
    }
  }

  if (options.salespersonCredentialId) {
    try {
      const result = await sendViaSalespersonSmtp({
        credentialId: options.salespersonCredentialId,
        to: recipients,
        subject: options.subject,
        htmlBody: options.html ?? "",
        textBody: options.text ?? undefined,
        attachments: options.attachments?.map((a) => ({
          filename: a.filename,
          content: typeof a.content === "string" ? Buffer.from(a.content, "base64") : a.content,
          contentType: a.contentType ?? "application/octet-stream",
        })),
      })
      return {
        success: true,
        provider: "smtp",
        providerMessageId: result.messageId,
        error: null,
        sentAppendFailed: result.sentAppendFailed,
      }
    } catch (err) {
      return {
        success: false,
        provider: "smtp",
        providerMessageId: null,
        error: err instanceof Error ? err.message : "SMTP send failed",
      }
    }
  }

  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (apiKey) return sendWithResend({ ...options, to: recipients }, apiKey)

  return sendWithMailpit({ ...options, to: recipients })
}
