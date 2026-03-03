"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import type { Role } from "./types"

interface RoleContextValue {
  role: Role
  setRole: (r: Role) => void
  can: (action: string) => boolean
}

const RoleContext = createContext<RoleContextValue | null>(null)

const permissions: Record<string, Role[]> = {
  "view:dashboard": ["admin", "manager", "consultant", "readonly"],
  "view:pipeline": ["admin", "manager", "consultant", "readonly"],
  "edit:pipeline": ["admin", "manager", "consultant"],
  "view:enquiries": ["admin", "manager", "consultant", "readonly"],
  "create:enquiry": ["admin", "manager", "consultant"],
  "view:jobs": ["admin", "manager", "consultant", "readonly"],
  "edit:jobs": ["admin", "manager", "consultant"],
  "view:customers": ["admin", "manager", "consultant", "readonly"],
  "import:customers": ["admin", "manager", "consultant"],
  "view:quotes": ["admin", "manager", "consultant", "readonly"],
  "edit:quotes": ["admin", "manager", "consultant"],
  "view:payments": ["admin", "manager", "consultant", "readonly"],
  "edit:payments": ["admin", "manager", "consultant"],
  "view:documents": ["admin", "manager", "consultant", "readonly"],
  "view:correspondence": ["admin", "manager", "consultant", "readonly"],
  "send:correspondence": ["admin", "manager", "consultant"],
  "view:products": ["admin", "manager", "consultant", "readonly"],
  "edit:products": ["admin"],
  "view:templates": ["admin"],
  "edit:templates": ["admin"],
  "view:reporting": ["admin", "manager"],
  "export:reporting": ["manager"],
  "view:audit": ["admin", "manager"],
  "view:full_audit": ["manager"],
  "view:settings": ["admin", "manager"],
  "edit:settings": ["admin"],
  "sync:suppliers": ["admin", "manager"],
  "manage:users": ["admin"],
}

const ROLE_STORAGE_KEY = "luxu_user_role"

export function RoleProvider({ children }: { children: ReactNode }) {
  // Initialize from localStorage, fallback to consultant
  const [role, setRoleState] = useState<Role>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(ROLE_STORAGE_KEY) as Role | null
      return stored || "consultant"
    }
    return "consultant"
  })

  // Persist role changes to localStorage
  const setRole = (newRole: Role) => {
    setRoleState(newRole)
    if (typeof window !== "undefined") {
      localStorage.setItem(ROLE_STORAGE_KEY, newRole)
    }
  }

  const can = (action: string) => {
    const allowed = permissions[action]
    return allowed ? allowed.includes(role) : false
  }

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
