"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { supabase } from "@/lib/supabase/client"
import type { Role } from "./types"

export interface User {
  name: string
  role: Role
}

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (name: string, password: string) => Promise<boolean>
  logout: () => void
}

// Internal email mapping — must match what you create in Supabase Auth dashboard.
// Create these users at: Supabase Dashboard → Authentication → Users → Add User
// Email: carmen@luxus.app  Password: <the user's PIN>
const NAME_TO_EMAIL: Record<string, string> = {
  Carmen: "carmen@luxus.app",
  Leonie: "leonie@luxus.app",
  Dirk: "dirk@luxus.app",
  Monade: "monade@luxus.app",
  Douwlien: "douwlien@luxus.app",
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId: string, fallbackEmail: string) => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, clearance_level")
      .eq("user_id", userId)
      .single()

    if (profile) {
      setUser({ name: profile.name, role: profile.clearance_level as Role })
    } else {
      // Profile not found — derive name from email prefix, default to consultant
      const emailName = fallbackEmail.split("@")[0]
      const displayName = emailName.charAt(0).toUpperCase() + emailName.slice(1)
      setUser({ name: displayName, role: "consultant" })
    }
  }, [])

  useEffect(() => {
    let mounted = true

    // Check existing session on mount
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (mounted && session?.user) {
        await loadProfile(session.user.id, session.user.email ?? "")
      }
      if (mounted) setLoading(false)
    }
    init()

    // Subscribe to auth state changes (login / logout / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return
      if (session?.user) {
        await loadProfile(session.user.id, session.user.email ?? "")
      } else {
        setUser(null)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const login = async (name: string, password: string): Promise<boolean> => {
    const email = NAME_TO_EMAIL[name]
    if (!email) return false

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return !error
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
