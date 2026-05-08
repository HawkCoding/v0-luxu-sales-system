import nodemailer from "nodemailer"
import { Resend } from "resend"

export interface SendEmailOptions {
  from: string
  to: string | string[]
  subject: string
  html?: string | null
  text?: string | null
  attachments?: SendEmailAttachment[]
}

export interface SendEmailAttachment {
  filename: string
  content: Buffer | string
  contentType?: string
}

export interface SendEmailResult {
  success: boolean
  provider: "resend" | "mailpit"
  providerMessageId: string | null
  error: string | null
}

function normalizeRecipients(to: string | string[]): string[] {
  return Array.isArray(to)
    ? to.map((recipient) => recipient.trim()).filter(Boolean)
    : to.split(",").map((recipient) => recipient.trim()).filter(Boolean)
}

function resolveMailpitSmtpUrl(): URL {
  const rawUrl = process.env.MAILPIT_URL?.trim() || "http://127.0.0.1:54324"
  const parsed = new URL(rawUrl)

  if (parsed.protocol === "smtp:") return parsed

  parsed.protocol = "smtp:"
  return parsed
}

async function sendWithMailpit(options: SendEmailOptions): Promise<SendEmailResult> {
  const smtpUrl = resolveMailpitSmtpUrl()
  const transporter = nodemailer.createTransport({
    host: smtpUrl.hostname,
    port: Number(smtpUrl.port || 1025),
    secure: smtpUrl.protocol === "smtps:",
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

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const recipients = normalizeRecipients(options.to)

  if (recipients.length === 0) {
    return {
      success: false,
      provider: process.env.RESEND_API_KEY ? "resend" : "mailpit",
      providerMessageId: null,
      error: "Email recipient is required",
    }
  }

  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (apiKey) return sendWithResend({ ...options, to: recipients }, apiKey)

  return sendWithMailpit({ ...options, to: recipients })
}
