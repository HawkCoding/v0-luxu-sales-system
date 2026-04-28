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

    expect(canRolePerform("admin", "export:reporting")).toBe(false)
    expect(canRolePerform("admin", "view:full_audit")).toBe(false)
  })

  it("enforces the expected manager restrictions", () => {
    expect(canRolePerform("manager", "view:reporting")).toBe(true)
    expect(canRolePerform("manager", "edit:suppliers")).toBe(true)
    expect(canRolePerform("manager", "edit:products")).toBe(false)
    expect(canRolePerform("manager", "edit:templates")).toBe(false)
    expect(canRolePerform("manager", "edit:settings")).toBe(false)
    expect(canRolePerform("manager", "manage:users")).toBe(false)
  })

  it("blocks consultant access to admin and manager-only actions", () => {
    expect(canRolePerform("consultant", "import:customers")).toBe(false)
    expect(canRolePerform("consultant", "view:templates")).toBe(false)
    expect(canRolePerform("consultant", "view:reporting")).toBe(false)
    expect(canRolePerform("consultant", "view:audit")).toBe(false)
    expect(canRolePerform("consultant", "edit:quotes")).toBe(true)
  })

  it("allows readonly users to perform only configured view actions", () => {
    const readonlyExpected = new Set([
      "view:dashboard",
      "view:pipeline",
      "view:enquiries",
      "view:jobs",
      "view:customers",
      "view:quotes",
      "view:payments",
      "view:documents",
      "view:correspondence",
      "view:suppliers",
      "view:packages",
      "view:products",
    ])

    for (const action of allActions) {
      expect(canRolePerform("readonly", action)).toBe(readonlyExpected.has(action))
    }
  })

  it("returns false for unknown actions for every role", () => {
    for (const role of ["admin", "manager", "consultant", "readonly"] satisfies Role[]) {
      expect(canRolePerform(role, "unknown:action")).toBe(false)
    }
  })
})
