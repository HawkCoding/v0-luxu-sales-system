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

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, surname, clearance_level, email")
    .eq("user_id", user.id)
    .single()

  const initialUser = profile
    ? {
        name: [profile.name, profile.surname].filter(Boolean).join(" ").trim() || profile.name,
        email: profile.email || user.email || "",
        role: profile.clearance_level as Role,
      }
    : {
        name: (user.email ?? "").split("@")[0].replace(/^./, (char) => char.toUpperCase()),
        email: user.email ?? "",
        role: "consultant" as const,
      }

  return <AppClientLayout initialUser={initialUser}>{children}</AppClientLayout>
}
