import { describe, expect, it } from "vitest"
import { DEFAULT_LOGIN_ERROR_MESSAGE, getLoginErrorMessage } from "./auth-errors"

describe("getLoginErrorMessage", () => {
  it("returns null when there is no error code", () => {
    expect(getLoginErrorMessage(null)).toBeNull()
    expect(getLoginErrorMessage("")).toBeNull()
    expect(getLoginErrorMessage(undefined)).toBeNull()
  })

  it("explains a deactivated account (F02-1)", () => {
    expect(getLoginErrorMessage("account-inactive")).toMatch(/deactivated/i)
  })

  it("explains a missing profile instead of a generic failure (F02-5)", () => {
    const message = getLoginErrorMessage("unauthorized")
    expect(message).toMatch(/not set up for this app/i)
    expect(message).not.toBe(DEFAULT_LOGIN_ERROR_MESSAGE)
  })

  it("explains an idle timeout (F02-10)", () => {
    expect(getLoginErrorMessage("session-expired")).toMatch(/inactivity/i)
  })

  it("keeps the existing account-link message", () => {
    expect(getLoginErrorMessage("account-link-mismatch")).toMatch(/already linked/i)
  })

  it("falls back to the generic message for unknown codes", () => {
    expect(getLoginErrorMessage("something-else")).toBe(DEFAULT_LOGIN_ERROR_MESSAGE)
  })
})
