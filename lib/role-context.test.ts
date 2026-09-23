import { describe, expect, it } from "vitest"

import type { Role } from "./types"
import {
  canRolePerform,
  canUserPerform,
  GRANT_GATED_ACTIONS,
  NO_GRANTS,
  permissions,
} from "./role-context"

describe("canRolePerform", () => {
  const allActions = Object.keys(permissions)
  const adminActions = allActions.filter((action) => permissions[action].includes("admin"))

  it("allows admin to perform every admin-authorized action", () => {
    for (const action of adminActions) {
      expect(canRolePerform("admin", action)).toBe(true)
    }
  })

  it("grants admin every permission the matrix defines", () => {
    // Guards against another write-only key like the removed view:full_audit,
    // which granted manager a capability admin did not have and was read nowhere.
    for (const action of allActions) {
      expect(canRolePerform("admin", action)).toBe(true)
    }
  })

  it("grants manager everything except user management", () => {
    for (const action of allActions) {
      const expected = action !== "manage:users"
      expect(canRolePerform("manager", action)).toBe(expected)
    }
  })

  it("grants consultant everything except settings writes and user management", () => {
    for (const action of allActions) {
      const expected = action !== "edit:settings" && action !== "manage:users"
      expect(canRolePerform("consultant", action)).toBe(expected)
    }
  })

  it("grants nothing to a retired or unknown clearance level", () => {
    // `readonly` was retired — consultant is the lowest role. The database enum
    // still carries the label, so an old profile row must fall through to no
    // permissions rather than inheriting anyone else's.
    for (const action of allActions) {
      expect(canRolePerform("readonly" as Role, action)).toBe(false)
    }
  })

  it("returns false for unknown actions for every role", () => {
    for (const role of ["admin", "manager", "consultant"] satisfies Role[]) {
      expect(canRolePerform(role, "unknown:action")).toBe(false)
    }
  })

  it("never grants reporting from role alone", () => {
    for (const role of ["admin", "manager", "consultant"] satisfies Role[]) {
      expect(canRolePerform(role, "view:reporting")).toBe(false)
      expect(canRolePerform(role, "export:reporting")).toBe(false)
    }
  })
})

describe("canUserPerform", () => {
  const roles = ["admin", "manager", "consultant"] satisfies Role[]
  const reportingActions = Object.keys(GRANT_GATED_ACTIONS)

  it("gates view and export of reporting on the per-user grant", () => {
    expect(reportingActions).toEqual(expect.arrayContaining(["view:reporting", "export:reporting"]))
  })

  it("denies reporting to every role without the grant, admin included", () => {
    for (const role of roles) {
      for (const action of reportingActions) {
        expect(canUserPerform(role, NO_GRANTS, action)).toBe(false)
      }
    }
  })

  it("allows reporting to every role with the grant", () => {
    for (const role of roles) {
      for (const action of reportingActions) {
        expect(canUserPerform(role, { viewReporting: true }, action)).toBe(true)
      }
    }
  })

  it("denies reporting to a retired clearance level even with the grant", () => {
    expect(canUserPerform("readonly" as Role, { viewReporting: true }, "view:reporting")).toBe(false)
  })

  it("falls back to the role matrix for every other action", () => {
    for (const role of roles) {
      for (const action of Object.keys(permissions)) {
        expect(canUserPerform(role, { viewReporting: true }, action)).toBe(canRolePerform(role, action))
        expect(canUserPerform(role, NO_GRANTS, action)).toBe(canRolePerform(role, action))
      }
    }
  })
})
