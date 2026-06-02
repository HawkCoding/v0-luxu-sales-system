import { requireRole } from "@/lib/api/auth"
import { safeSupabaseError } from "@/lib/api/responses"

// Lightweight list of staff a job can be assigned to. Available to admins and
// managers (the full /api/users endpoint is admin-only) so the job-page
// reassignment control can populate its picker.
export async function GET() {
  const auth = await requireRole(["admin", "manager"])
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
