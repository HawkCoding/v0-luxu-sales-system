import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { canUserViewReporting } from "@/lib/reports/access"
import { createSessionClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

/**
 * Server-side page guard for /app/reporting. Hiding the nav item is not
 * enough — a user without the per-user reporting grant who types the URL is
 * sent back to the dashboard.
 */
export default async function ReportingLayout({ children }: { children: ReactNode }) {
  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  if (!(await canUserViewReporting(supabase, user.id))) {
    redirect("/app")
  }

  return children
}
