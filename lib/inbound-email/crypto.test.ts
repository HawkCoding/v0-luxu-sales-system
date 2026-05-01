import { afterEach, describe, expect, it } from "vitest"
import { decryptCredential, encryptCredential } from "@/lib/inbound-email/crypto"

const ORIGINAL_KEY = process.env.EMAIL_CREDENTIAL_ENCRYPTION_KEY

afterEach(() => {
  process.env.EMAIL_CREDENTIAL_ENCRYPTION_KEY = ORIGINAL_KEY
})

describe("email credential encryption", () => {
  it("round-trips encrypted mailbox passwords", () => {
    process.env.EMAIL_CREDENTIAL_ENCRYPTION_KEY = "test-key-for-inbound-email"

    const encrypted = encryptCredential("secret-password")

    expect(encrypted).not.toContain("secret-password")
    expect(decryptCredential(encrypted)).toBe("secret-password")
  })
})
