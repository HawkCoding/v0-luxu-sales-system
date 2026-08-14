"use client"

import { createContext, useCallback, useContext, useState, type ReactNode } from "react"
import type { Role } from "./types"

interface RoleContextValue {
  role: Role
  setRole: (r: Role) => void
  can: (action: string) => boolean
}

const RoleContext = createContext<RoleContextValue | null>(null)

export const permissions: Record<string, Role[]> = {
  "view:dashboard": ["admin", "manager", "consultant"],
  "view:pipeline": ["admin", "manager", "consultant"],
  "edit:pipeline": ["admin", "manager", "consultant"],
  "cancel:booking": ["admin", "manager", "consultant"],
  "view:enquiries": ["admin", "manager", "consultant"],
  "create:enquiry": ["admin", "manager", "consultant"],
  "view:jobs": ["admin", "manager", "consultant"],
  "edit:jobs": ["admin", "manager", "consultant"],
  "view:customers": ["admin", "manager", "consultant"],
  "edit:customers": ["admin", "manager", "consultant"],
  "import:customers": ["admin", "manager"],
  "view:quotes": ["admin", "manager", "consultant"],
  "edit:quotes": ["admin", "manager", "consultant"],
  "view:payments": ["admin", "manager", "consultant"],
  "edit:payments": ["admin", "manager", "consultant"],
  "view:documents": ["admin", "manager", "consultant"],
  "upload:documents": ["admin", "manager", "consultant"],
  "delete:documents": ["admin", "manager"],
  "view:notes": ["admin", "manager", "consultant"],
  "create:notes": ["admin", "manager", "consultant"],
  "manage:notes": ["admin", "manager"],
  "view:correspondence": ["admin", "manager", "consultant"],
  "send:correspondence": ["admin", "manager", "consultant"],
  "view:suppliers": ["admin", "manager", "consultant"],
  "edit:suppliers": ["admin", "manager"],
  "delete:suppliers": ["admin"],
  "create:temporary-supplier": ["admin", "manager", "consultant"],
  "view:packages": ["admin", "manager", "consultant"],
  "view:products": ["admin", "manager", "consultant"],
  "edit:products": ["admin"],
  "view:templates": ["admin", "manager"],
  "edit:templates": ["admin", "manager"],
  "view:reporting": ["admin", "manager"],
  "export:reporting": ["admin", "manager"],
  "view:audit": ["admin", "manager"],
  // Mirrors the manager/admin check on PATCH /api/jobs/[id] (resolveEmailImportReview) and
  // POST /api/jobs/[id]/clear-import-review. Keep in sync or the button 403s for consultants.
  "resolve:import_review": ["admin", "manager"],
  // Mirrors requireManagerSettingsAccess() in lib/settings-access.ts, which guards
  // /api/error-logs. Keep the two in sync or client fetches 403 in the background.
  "view:error_logs": ["admin", "manager"],
  "view:settings": ["admin", "manager"],
  "edit:settings": ["admin"],
  "manage:users": ["admin"],
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
