import { describe, expect, it } from "vitest"
import { buildInboundEmailIdentityKey, isSameInboundEmailIdentity } from "@/lib/inbound-email/identity"

describe("inbound email identity", () => {
  it("keys duplicates by account, UIDVALIDITY, and UID", () => {
    const identity = { emailAccountId: "account-1", uidvalidity: 42, uid: 1001 }

    expect(buildInboundEmailIdentityKey(identity)).toBe("account-1:42:1001")
    expect(isSameInboundEmailIdentity(identity, { ...identity })).toBe(true)
    expect(isSameInboundEmailIdentity(identity, { ...identity, uid: 1002 })).toBe(false)
  })
})
