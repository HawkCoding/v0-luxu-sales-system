import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import AppClientLayout from "./client-layout"
import { extractRoleFromJwt, isRole } from "@/lib/role-utils"
import { createSessionClient } from "@/lib/supabase/server"
import type { Role } from "@/lib/types"

export const dynamic = "force-dynamic"

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const jwtRole = extractRoleFromJwt(user)

  let displayName: string
  let email: string
  let role: Role

  if (jwtRole) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, surname, email, is_active")
      .eq("user_id", user.id)
      .single()

    if (!profile || profile.is_active === false) {
      redirect("/login")
    }

    role = jwtRole
    displayName = profile
      ? [profile.name, profile.surname].filter(Boolean).join(" ").trim() || profile.name
      : (user.email ?? "").split("@")[0].replace(/^./, (char) => char.toUpperCase())
    email = profile?.email || user.email || ""
  } else {
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, surname, clearance_level, email, is_active")
      .eq("user_id", user.id)
      .single()

    if (!profile || profile.is_active === false || !isRole(profile.clearance_level)) {
      redirect("/login")
    }

    role = profile.clearance_level
    displayName = [profile.name, profile.surname].filter(Boolean).join(" ").trim() || profile.name
    email = profile.email || user.email || ""
  }

  const initialUser = { id: user.id, name: displayName, email, role }

  return (
    <AppClientLayout initialUser={initialUser}>
      {children}
    </AppClientLayout>
  )
}
