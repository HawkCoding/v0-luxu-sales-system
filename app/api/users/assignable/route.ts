import { requireAnyRole } from "@/lib/api/auth"
import { safeSupabaseError } from "@/lib/api/responses"

// Lightweight list of staff a job can be assigned to. Available to admins,
// managers, and consultants (the full /api/users endpoint is admin-only) so
// the job-page reassignment control and the Pipeline/Bookings consultant
// filters can populate their pickers. Consultants already see every booking
// via "view:pipeline"/"view:jobs" with no ownership scoping, so this list
// exposes nothing they can't already see through the bookings themselves.
export async function GET() {
  const auth = await requireAnyRole()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.value.supabase
    .from("profiles")
    .select("user_id, name, surname, email, clearance_level, is_active")
    .in("clearance_level", ["admin", "manager", "consultant"])
    .order("name", { ascending: true })

  if (error) return safeSupabaseError("users:assignable", error)

  const users = (data ?? [])
    .filter((p) => p.is_active !== false)
    .map((p) => ({
      userId: p.user_id,
      name: [p.name, p.surname].filter(Boolean).join(" ").trim() || p.email,
      clearanceLevel: p.clearance_level,
    }))

  return Response.json({ users })
}
