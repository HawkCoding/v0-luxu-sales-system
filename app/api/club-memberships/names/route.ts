import { requireRole } from "@/lib/api/auth"
import { safeSupabaseError } from "@/lib/api/responses"
import { distinctClubNames, parseClubMemberships } from "@/lib/club-memberships"

export const runtime = "nodejs"

const SCAN_LIMIT = 2000

/** Club names already on file, offered as suggestions so free-text entries stay consistent. */
export async function GET() {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { supabase } = auth.value

  const [customers, travellers] = await Promise.all([
    supabase.from("customers").select("club_memberships").neq("club_memberships", "[]").limit(SCAN_LIMIT),
    supabase.from("travellers").select("club_memberships").neq("club_memberships", "[]").limit(SCAN_LIMIT),
  ])

  if (customers.error) return safeSupabaseError("club-memberships:customers", customers.error)
  if (travellers.error) return safeSupabaseError("club-memberships:travellers", travellers.error)

  const names = distinctClubNames(
    [...(customers.data ?? []), ...(travellers.data ?? [])].map((row) => parseClubMemberships(row.club_memberships)),
  )

  return Response.json({ names })
}
