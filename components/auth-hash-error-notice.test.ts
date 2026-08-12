import { describe, expect, it } from "vitest"
import { getHashErrorMessage } from "./auth-hash-error-notice"

describe("getHashErrorMessage", () => {
  it("ignores an empty or unrelated fragment", () => {
    expect(getHashErrorMessage("")).toBeNull()
    expect(getHashErrorMessage("#")).toBeNull()
    expect(getHashErrorMessage("#section-two")).toBeNull()
  })

  it("explains a consumed recovery link (F02-4)", () => {
    const hash =
      "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"
    expect(getHashErrorMessage(hash)).toMatch(/already been used or has expired/i)
  })

  it("maps a known error when only `error` is present", () => {
    expect(getHashErrorMessage("#error=access_denied")).toMatch(/no longer valid/i)
  })

  it("falls back for an unknown error code without echoing the description", () => {
    const message = getHashErrorMessage("#error=server_error&error_code=weird_code&error_description=raw+detail")
    expect(message).toMatch(/could not be used/i)
    expect(message).not.toMatch(/raw detail/i)
  })
})
