import { NextResponse } from "next/server"
import { z } from "zod"
import { requireManagerSettingsAccess } from "@/lib/settings-access"

const querySchema = z.object({
  severity: z.enum(["Critical", "Warning", "Info"]).optional(),
  resolved: z.enum(["true", "false"]).optional(),
  count: z.literal("true").optional(),
})

export async function GET(req: Request) {
  const auth = await requireManagerSettingsAccess()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters", details: parsed.error.flatten() }, { status: 400 })
  }

  const { severity, resolved, count } = parsed.data
  const supabase = auth.value.supabase

  if (count === "true") {
    let countQuery = supabase
      .from("error_logs")
      .select("id", { count: "exact", head: true })

    if (severity) countQuery = countQuery.eq("severity", severity)
    if (resolved !== undefined) countQuery = countQuery.eq("resolved", resolved === "true")

    const { count: total, error } = await countQuery
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ count: total ?? 0 })
  }

  let query = supabase
    .from("error_logs")
    .select("id, severity, source, message, details, resolved, resolved_by, resolved_at, created_at")

  if (severity) query = query.eq("severity", severity)
  if (resolved !== undefined) query = query.eq("resolved", resolved === "true")

  const { data, error } = await query.order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ errorLogs: data ?? [] })
}
