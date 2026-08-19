"use client"

import { createContext, useCallback, useContext, useState, type ReactNode } from "react"
import { ALL_ROLES, SETTINGS_WRITE_ROLES, USER_ADMIN_ROLES } from "@/lib/permissions"
import type { Role } from "./types"

interface RoleContextValue {
  role: Role
  setRole: (r: Role) => void
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
  "view:reporting": [...ALL_ROLES],
  "export:reporting": [...ALL_ROLES],
  "view:audit": [...ALL_ROLES],
  "resolve:import_review": [...ALL_ROLES],
  "view:error_logs": [...ALL_ROLES],
  "view:settings": [...ALL_ROLES],
  "edit:settings": [...SETTINGS_WRITE_ROLES],
  "manage:users": [...USER_ADMIN_ROLES],
}

export function canRolePerform(role: Role, action: string) {
  const allowed = permissions[action]
  return allowed ? allowed.includes(role) : false
}

interface RoleProviderProps {
  children: ReactNode
  initialRole?: Role
}

export function RoleProvider({ children, initialRole = "consultant" }: RoleProviderProps) {
  const [role, setRoleState] = useState<Role>(initialRole)

  const setRole = useCallback((newRole: Role) => {
    setRoleState(newRole)
  }, [])

  const can = (action: string) => canRolePerform(role, action)

  return (
    <RoleContext.Provider value={{ role, setRole, can }}>
      {children}
    </RoleContext.Provider>
  )
}

export function useRole() {
  const ctx = useContext(RoleContext)
  if (!ctx) throw new Error("useRole must be used within RoleProvider")
  return ctx
}
