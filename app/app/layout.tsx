import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import AppClientLayout from "./client-layout"
import { createSessionClient } from "@/lib/supabase/server"
import type { Role } from "@/lib/types"

export const dynamic = "force-dynamic"

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("name, surname, clearance_level, email")
    .eq("user_id", user.id)
    .single()

  const profileMissing = !profile && profileError?.code === "PGRST116"
  const fallbackName = (user.email ?? "").split("@")[0].replace(/^./, (char) => char.toUpperCase())

  const initialUser = profile
    ? {
        name: [profile.name, profile.surname].filter(Boolean).join(" ").trim() || profile.name,
        email: profile.email || user.email || "",
        role: profile.clearance_level as Role,
        roleStatus: "resolved" as const,
      }
    : profileMissing
      ? {
          name: fallbackName,
          email: user.email ?? "",
          role: "consultant" as const,
          roleStatus: "missing" as const,
        }
      : {
          name: fallbackName,
          email: user.email ?? "",
          role: null,
          roleStatus: "pending" as const,
        }

  return <AppClientLayout initialUser={initialUser}>{children}</AppClientLayout>
}
