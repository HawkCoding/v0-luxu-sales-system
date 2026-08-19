import { describe, expect, it } from "vitest"

import type { Role } from "./types"
import { canRolePerform, permissions } from "./role-context"

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
})
