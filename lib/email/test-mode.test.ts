import { describe, expect, it, vi } from "vitest"
import {
  applyEmailTestMode,
  buildTestModeSubject,
  EmailTestModeError,
  getEmailTestMode,
  parseTestRecipients,
} from "@/lib/email/test-mode"

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
}))

function settingsClient(result: {
  data?: { key: string; value: string }[] | null
  error?: unknown
}) {
  return {
    from: () => ({
      select: () => ({
        in: async () => ({ data: result.data ?? null, error: result.error ?? null }),
      }),
    }),
  } as unknown as Parameters<typeof getEmailTestMode>[0]
}

describe("parseTestRecipients", () => {
  it("splits on commas and semicolons and trims", () => {
    expect(parseTestRecipients(" a@x.com , b@y.com ; c@z.com ")).toEqual([
      "a@x.com",
      "b@y.com",
      "c@z.com",
    ])
  })

  it("drops entries that are not email addresses", () => {
    expect(parseTestRecipients("a@x.com, not-an-email, @nope")).toEqual(["a@x.com"])
  })

  it("returns an empty list for blank input", () => {
    expect(parseTestRecipients("")).toEqual([])
    expect(parseTestRecipients(null)).toEqual([])
  })
})

describe("buildTestModeSubject", () => {
  it("names the intended recipient", () => {
    expect(buildTestModeSubject("Your quote", ["john@client.com"])).toBe(
      "[TEST -> john@client.com] Your quote",
    )
  })

  it("summarises long recipient lists", () => {
    expect(buildTestModeSubject("Hi", ["a@x.com", "b@x.com", "c@x.com", "d@x.com"])).toBe(
      "[TEST -> a@x.com, b@x.com +2 more] Hi",
    )
  })
})

describe("applyEmailTestMode", () => {
  it("returns null when test mode is off", () => {
    expect(applyEmailTestMode({ enabled: false, recipients: [] }, ["a@x.com"], "Hi")).toBeNull()
  })

  it("replaces the recipients with the test inbox", () => {
    expect(
      applyEmailTestMode({ enabled: true, recipients: ["qa@x.com"] }, ["john@client.com"], "Hi"),
    ).toEqual({
      recipients: ["qa@x.com"],
      subject: "[TEST -> john@client.com] Hi",
      intendedRecipients: ["john@client.com"],
    })
  })

  it("throws rather than falling through to the customer when no inbox is set", () => {
    expect(() => applyEmailTestMode({ enabled: true, recipients: [] }, ["a@x.com"], "Hi")).toThrow(
      EmailTestModeError,
    )
  })
})

describe("getEmailTestMode", () => {
  it("reads the switch and inbox from app_settings", async () => {
    const settings = await getEmailTestMode(
      settingsClient({
        data: [
          { key: "email_test_mode_enabled", value: "true" },
          { key: "email_test_mode_recipient", value: "qa@x.com, ops@x.com" },
        ],
      }),
    )

    expect(settings).toEqual({ enabled: true, recipients: ["qa@x.com", "ops@x.com"] })
  })

  it("treats a missing row as disabled", async () => {
    expect(await getEmailTestMode(settingsClient({ data: [] }))).toEqual({
      enabled: false,
      recipients: [],
    })
  })

  it("throws on a lookup error so the caller fails closed", async () => {
    await expect(getEmailTestMode(settingsClient({ error: { message: "boom" } }))).rejects.toThrow(
      EmailTestModeError,
    )
  })
})
