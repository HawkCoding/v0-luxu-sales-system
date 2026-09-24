"use client"

import { createContext, useCallback, useContext, useState, type ReactNode } from "react"
import { ALL_ROLES, SETTINGS_WRITE_ROLES, USER_ADMIN_ROLES } from "@/lib/permissions"
import { isRole } from "@/lib/role-utils"
import type { Role } from "./types"

/**
 * Per-user grants that sit outside the role matrix. They are set by an admin
 * on the user's profile (Settings -> Users) and loaded server-side in
 * app/app/layout.tsx. The server gates (layouts, API routes) are the real
 * enforcement; these only drive what the client shows.
 */
export interface UserGrants {
  /** profiles.can_view_reporting — the Reporting page and CSV exports. */
  viewReporting: boolean
}

export const NO_GRANTS: UserGrants = { viewReporting: false }

interface RoleContextValue {
  role: Role
  setRole: (r: Role) => void
  grants: UserGrants
  can: (action: string) => boolean
}

const RoleContext = createContext<RoleContextValue | null>(null)

export const permissions: Record<string, Role[]> = {
  "view:dashboard": [...ALL_ROLES],
  "view:pipeline": [...ALL_ROLES],
  "edit:pipeline": [...ALL_ROLES],
  "cancel:booking": [...ALL_ROLES],
  "view:enquiries": [...ALL_ROLES],
  "create:enquiry": [...ALL_ROLES],
  "view:jobs": [...ALL_ROLES],
  "edit:jobs": [...ALL_ROLES],
  "view:customers": [...ALL_ROLES],
  "edit:customers": [...ALL_ROLES],
  "import:customers": [...ALL_ROLES],
  "view:quotes": [...ALL_ROLES],
  "edit:quotes": [...ALL_ROLES],
  "view:payments": [...ALL_ROLES],
  "edit:payments": [...ALL_ROLES],
  "view:documents": [...ALL_ROLES],
  "upload:documents": [...ALL_ROLES],
  "delete:documents": [...ALL_ROLES],
  "view:notes": [...ALL_ROLES],
  "create:notes": [...ALL_ROLES],
  "manage:notes": [...ALL_ROLES],
  "view:correspondence": [...ALL_ROLES],
  "send:correspondence": [...ALL_ROLES],
  "view:suppliers": [...ALL_ROLES],
  "edit:suppliers": [...ALL_ROLES],
  "delete:suppliers": [...ALL_ROLES],
  "create:temporary-supplier": [...ALL_ROLES],
  "view:packages": [...ALL_ROLES],
  "view:products": [...ALL_ROLES],
  "edit:products": [...ALL_ROLES],
  "view:templates": [...ALL_ROLES],
  "edit:templates": [...ALL_ROLES],
  "view:audit": [...ALL_ROLES],
  "resolve:import_review": [...ALL_ROLES],
  "view:error_logs": [...ALL_ROLES],
  "view:settings": [...ALL_ROLES],
  "edit:settings": [...SETTINGS_WRITE_ROLES],
  "manage:users": [...USER_ADMIN_ROLES],
}

/**
 * Actions decided by a per-user grant instead of the role matrix. Every role —
 * admin included — needs the grant; there is no role fallback.
 */
export const GRANT_GATED_ACTIONS: Record<string, keyof UserGrants> = {
  "view:reporting": "viewReporting",
  "export:reporting": "viewReporting",
}

export function canRolePerform(role: Role, action: string): boolean {
  const allowed = permissions[action]
  return allowed ? allowed.includes(role) : false
}

/** Role matrix plus per-user grants — what `can()` resolves to. */
export function canUserPerform(role: Role, grants: UserGrants, action: string): boolean {
  const grant = GRANT_GATED_ACTIONS[action]
  if (grant) return isRole(role) && grants[grant] === true
  return canRolePerform(role, action)
}

interface RoleProviderProps {
  children: ReactNode
  initialRole?: Role
  grants?: UserGrants
}

export function RoleProvider({ children, initialRole = "consultant", grants = NO_GRANTS }: RoleProviderProps) {
  const [role, setRoleState] = useState<Role>(initialRole)

  const setRole = useCallback((newRole: Role) => {
    setRoleState(newRole)
  }, [])

  // `grants` is read straight from props (not copied into state) so a
  // router.refresh() after an admin changes their own access re-renders the
  // server layout and the nav follows without a full reload.
  const can = (action: string) => canUserPerform(role, grants, action)

  return (
    <RoleContext.Provider value={{ role, setRole, grants, can }}>
      {children}
    </RoleContext.Provider>
  )
}

export function useRole() {
  const ctx = useContext(RoleContext)
  if (!ctx) throw new Error("useRole must be used within RoleProvider")
  return ctx
}
