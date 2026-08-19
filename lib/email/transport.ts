import nodemailer from "nodemailer"
import { Resend } from "resend"
import { sendViaSalespersonSmtp } from "@/lib/email/smtp-transport"
import {
  applyEmailTestMode,
  EmailTestModeError,
  EMAIL_TEST_MODE_LOOKUP_ERROR,
  getEmailTestMode,
} from "@/lib/email/test-mode"

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
  /** Addresses the email would have gone to, when test mode redirected it. */
  testModeRedirectedFrom?: string[] | null
  /** Addresses actually delivered to — the test inbox when redirected. */
  deliveredTo?: string[]
  /** Subject as actually sent, carrying the `[TEST -> ...]` prefix when redirected. */
  effectiveSubject?: string
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

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production"
}

/** True when an explicit Mailpit/SMTP catcher host was configured, rather than the dev default. */
function hasExplicitMailpitTarget(): boolean {
  return Boolean(process.env.MAILPIT_SMTP_URL?.trim() || process.env.MAILPIT_SMTP_HOST?.trim())
}

/**
 * True when a send that has no salesperson SMTP credential cannot go anywhere:
 * production, no Resend key, and no explicitly configured mail catcher. Callers
 * use this to fail fast with an actionable message before doing expensive work.
 */
export function isFallbackSendingUnavailable(): boolean {
  return (
    isProductionRuntime() &&
    !hasExplicitMailpitTarget() &&
    !process.env.RESEND_API_KEY?.trim()
  )
}

export const EMAIL_NOT_CONFIGURED_ERROR =
  "Email is not configured for this environment: no salesperson SMTP credential resolved and RESEND_API_KEY is not set."

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
  if (portRaw) {
    const port = Number(portRaw)
    if (!Number.isFinite(port)) {
      throw new Error(`Invalid MAILPIT_SMTP_PORT: ${portRaw}`)
    }
    return { host: host || "127.0.0.1", port }
  }

  return { host: host || "127.0.0.1", port: 1025 }
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

/**
 * The single choke point every outbound email passes through. Test mode is
 * enforced here — before any provider is chosen — so no send path, present or
 * future, can reach a customer while the switch is on.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const intendedRecipients = normalizeRecipients(options.to)
  const fallbackProvider = options.salespersonCredentialId
    ? "smtp"
    : process.env.RESEND_API_KEY
      ? "resend"
      : "mailpit"

  if (intendedRecipients.length === 0) {
    return {
      success: false,
      provider: fallbackProvider,
      providerMessageId: null,
      error: "Email recipient is required",
    }
  }

  let redirect: ReturnType<typeof applyEmailTestMode> = null
  try {
    redirect = applyEmailTestMode(
      await getEmailTestMode(),
      intendedRecipients,
      options.subject,
    )
  } catch (err) {
    const error = err instanceof EmailTestModeError ? err.message : EMAIL_TEST_MODE_LOOKUP_ERROR
    console.error("[email] refusing to send:", error)
    return {
      success: false,
      provider: fallbackProvider,
      providerMessageId: null,
      error,
      testModeRedirectedFrom: intendedRecipients,
    }
  }

  const recipients = redirect?.recipients ?? intendedRecipients
  const subject = redirect?.subject ?? options.subject
  const testModeFields = {
    testModeRedirectedFrom: redirect ? intendedRecipients : null,
    deliveredTo: recipients,
    effectiveSubject: subject,
  }

  if (redirect) {
    console.info(
      `[email] TEST MODE: redirected ${intendedRecipients.join(", ")} -> ${recipients.join(", ")}`,
    )
  }

  if (options.salespersonCredentialId) {
    try {
      const result = await sendViaSalespersonSmtp({
        credentialId: options.salespersonCredentialId,
        to: recipients,
        subject,
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
        ...testModeFields,
      }
    } catch (err) {
      return {
        success: false,
        provider: "smtp",
        providerMessageId: null,
        error: err instanceof Error ? err.message : "SMTP send failed",
        ...testModeFields,
      }
    }
  }

  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (apiKey) {
    const result = await sendWithResend({ ...options, to: recipients, subject }, apiKey)
    return { ...result, ...testModeFields }
  }

  // The Mailpit fallback exists for local development only. In production it
  // would silently dial 127.0.0.1:1025 and surface as ECONNREFUSED, hiding the
  // real problem (no sending mailbox configured).
  if (isProductionRuntime() && !hasExplicitMailpitTarget()) {
    console.error("[email] refusing to send:", EMAIL_NOT_CONFIGURED_ERROR)
    return {
      success: false,
      provider: "mailpit",
      providerMessageId: null,
      error: EMAIL_NOT_CONFIGURED_ERROR,
      ...testModeFields,
    }
  }

  const result = await sendWithMailpit({ ...options, to: recipients, subject })
  return { ...result, ...testModeFields }
}
