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

  it("enforces the expected manager restrictions", () => {
    expect(canRolePerform("manager", "view:reporting")).toBe(true)
    expect(canRolePerform("manager", "edit:suppliers")).toBe(true)
    // Managers manage email/voucher templates (matches PATCH /api/templates).
    expect(canRolePerform("manager", "view:templates")).toBe(true)
    expect(canRolePerform("manager", "edit:templates")).toBe(true)
    // Mirrors requireManagerSettingsAccess() guarding /api/error-logs.
    expect(canRolePerform("manager", "view:error_logs")).toBe(true)
    expect(canRolePerform("manager", "edit:products")).toBe(false)
    expect(canRolePerform("manager", "edit:settings")).toBe(false)
    expect(canRolePerform("manager", "manage:users")).toBe(false)
  })

  it("blocks consultant access to admin and manager-only actions", () => {
    expect(canRolePerform("consultant", "import:customers")).toBe(false)
    expect(canRolePerform("consultant", "view:templates")).toBe(false)
    expect(canRolePerform("consultant", "view:reporting")).toBe(false)
    expect(canRolePerform("consultant", "view:audit")).toBe(false)
    expect(canRolePerform("consultant", "view:settings")).toBe(false)
    expect(canRolePerform("consultant", "view:error_logs")).toBe(false)
    expect(canRolePerform("consultant", "edit:quotes")).toBe(true)
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
