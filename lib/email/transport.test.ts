import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  EMAIL_NOT_CONFIGURED_ERROR,
  isFallbackSendingUnavailable,
  resolveMailpitSmtpConfig,
  sendEmail,
} from "@/lib/email/transport"

const sendMail = vi.fn()

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({ sendMail, close: vi.fn() }),
  },
}))

const ORIGINAL_URL = process.env.MAILPIT_SMTP_URL
const ORIGINAL_HOST = process.env.MAILPIT_SMTP_HOST
const ORIGINAL_PORT = process.env.MAILPIT_SMTP_PORT

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

describe("resolveMailpitSmtpConfig", () => {
  beforeEach(() => {
    delete process.env.MAILPIT_SMTP_URL
    delete process.env.MAILPIT_SMTP_HOST
    delete process.env.MAILPIT_SMTP_PORT
  })

  afterEach(() => {
    restore("MAILPIT_SMTP_URL", ORIGINAL_URL)
    restore("MAILPIT_SMTP_HOST", ORIGINAL_HOST)
    restore("MAILPIT_SMTP_PORT", ORIGINAL_PORT)
  })

  it("defaults to 127.0.0.1:1025 when no env vars are set", () => {
    expect(resolveMailpitSmtpConfig()).toEqual({ host: "127.0.0.1", port: 1025 })
  })

  it("prefers MAILPIT_SMTP_URL over host/port pair", () => {
    process.env.MAILPIT_SMTP_URL = "smtp://mailpit.local:2525"
    process.env.MAILPIT_SMTP_HOST = "ignored"
    process.env.MAILPIT_SMTP_PORT = "9999"

    expect(resolveMailpitSmtpConfig()).toEqual({ host: "mailpit.local", port: 2525 })
  })

  it("falls back to MAILPIT_SMTP_HOST + MAILPIT_SMTP_PORT when URL is unset", () => {
    process.env.MAILPIT_SMTP_HOST = "smtp.internal"
    process.env.MAILPIT_SMTP_PORT = "2500"

    expect(resolveMailpitSmtpConfig()).toEqual({ host: "smtp.internal", port: 2500 })
  })

  it("defaults host to 127.0.0.1 when only MAILPIT_SMTP_PORT is set", () => {
    process.env.MAILPIT_SMTP_PORT = "54325"

    expect(resolveMailpitSmtpConfig()).toEqual({ host: "127.0.0.1", port: 54325 })
  })

  it("throws when MAILPIT_SMTP_PORT is not numeric", () => {
    process.env.MAILPIT_SMTP_HOST = "smtp.internal"
    process.env.MAILPIT_SMTP_PORT = "not-a-port"

    expect(() => resolveMailpitSmtpConfig()).toThrow(/Invalid MAILPIT_SMTP_PORT/)
  })

  it("does not read the legacy MAILPIT_URL variable", () => {
    process.env.MAILPIT_SMTP_URL = ""
    process.env.MAILPIT_SMTP_HOST = ""
    process.env.MAILPIT_SMTP_PORT = ""
    process.env.MAILPIT_URL = "http://127.0.0.1:54324"

    try {
      expect(resolveMailpitSmtpConfig()).toEqual({ host: "127.0.0.1", port: 1025 })
    } finally {
      delete process.env.MAILPIT_URL
    }
  })
})

describe("sendEmail production fallback guard", () => {
  const message = { from: "office@example.com", to: "customer@example.com", subject: "Hi", text: "Hi" }

  beforeEach(() => {
    sendMail.mockReset()
    sendMail.mockResolvedValue({ messageId: "local-1" })
    vi.stubEnv("RESEND_API_KEY", "")
    vi.stubEnv("MAILPIT_SMTP_URL", "")
    vi.stubEnv("MAILPIT_SMTP_HOST", "")
    vi.stubEnv("MAILPIT_SMTP_PORT", "")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("refuses to send in production when nothing is configured", async () => {
    vi.stubEnv("NODE_ENV", "production")

    const result = await sendEmail(message)

    expect(result).toMatchObject({ success: false, error: EMAIL_NOT_CONFIGURED_ERROR })
    expect(sendMail).not.toHaveBeenCalled()
  })

  it("still delivers to the local catcher outside production", async () => {
    vi.stubEnv("NODE_ENV", "development")

    const result = await sendEmail(message)

    expect(result).toMatchObject({ success: true, provider: "mailpit" })
    expect(sendMail).toHaveBeenCalledOnce()
  })

  it("uses an explicitly configured catcher even in production", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("MAILPIT_SMTP_HOST", "smtp.internal")

    const result = await sendEmail(message)

    expect(result).toMatchObject({ success: true, provider: "mailpit" })
    expect(sendMail).toHaveBeenCalledOnce()
  })
})

describe("isFallbackSendingUnavailable", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("is true in production with no Resend key and no catcher", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("RESEND_API_KEY", "")
    vi.stubEnv("MAILPIT_SMTP_URL", "")
    vi.stubEnv("MAILPIT_SMTP_HOST", "")

    expect(isFallbackSendingUnavailable()).toBe(true)
  })

  it("is false when Resend is configured", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("RESEND_API_KEY", "re_test")

    expect(isFallbackSendingUnavailable()).toBe(false)
  })

  it("is false outside production", () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("RESEND_API_KEY", "")

    expect(isFallbackSendingUnavailable()).toBe(false)
  })
})
