import { redirect } from "next/navigation"
import { createSessionClient } from "@/lib/supabase/server"

/**
 * Server-side page guard. The app has no middleware, so a page whose only gate
 * is the client-side `can()` call in the sidebar is reachable by direct URL for
 * every authenticated role. Call this from a server `layout.tsx` next to any
 * page that renders data a role should not see.
 *
 * Unauthenticated visitors go to /login (same as the app shell); authenticated
 * users without one of `roles` go back to /app rather than seeing a 403 shell.
 */
export async function requirePageRole(roles: readonly string[]): Promise<void> {
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

  if (!profile || !roles.includes(profile.clearance_level)) {
    redirect("/app")
  }
}
