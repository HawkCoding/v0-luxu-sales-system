import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { createSessionClient } from "@/lib/supabase/server"

export default async function AuditLayout({ children }: { children: ReactNode }) {
  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("clearance_level")
    .eq("user_id", user.id)
    .single()

  if (profile?.clearance_level !== "admin" && profile?.clearance_level !== "manager") {
    redirect("/app")
  }

  return children
}
