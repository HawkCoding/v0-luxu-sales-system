"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import type { Role } from "./types"

export interface User {
  name: string
  role: Role
}

interface AuthContextValue {
  user: User | null
  login: (name: string, password: string) => boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const USERS: Record<string, { password: string; role: Role }> = {
  Carmen: { password: "14789", role: "admin" },
  Leonie: { password: "14789", role: "admin" },
  Dirk: { password: "14789", role: "manager" },
  Monade: { password: "14789", role: "consultant" },
  Douwlien: { password: "14789", role: "consultant" },
}

const AUTH_STORAGE_KEY = "luxu_auth_user"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY)
      return stored ? JSON.parse(stored) : null
    }
    return null
  })

  const login = (name: string, password: string): boolean => {
    const userData = USERS[name]
    if (userData && userData.password === password) {
      const newUser = { name, role: userData.role }
      setUser(newUser)
      if (typeof window !== "undefined") {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(newUser))
      }
      return true
    }
    return false
  }

  const logout = () => {
    setUser(null)
    if (typeof window !== "undefined") {
      localStorage.removeItem(AUTH_STORAGE_KEY)
    }
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
