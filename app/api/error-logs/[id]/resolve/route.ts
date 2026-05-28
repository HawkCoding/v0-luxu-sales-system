import { NextResponse } from "next/server"
import { requireManagerSettingsAccess } from "@/lib/settings-access"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, { params }: RouteParams) {
  const auth = await requireManagerSettingsAccess()
  if (!auth.ok) return auth.response

  const { id } = await params
  const supabase = auth.value.supabase

  const { data: existing } = await supabase
    .from("error_logs")
    .select("id, resolved")
    .eq("id", id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: "Error log not found" }, { status: 404 })
  }

  if (existing.resolved) {
    return NextResponse.json({ error: "Error log already resolved" }, { status: 409 })
  }

  const { data, error } = await supabase
    .from("error_logs")
    .update({
      resolved: true,
      resolved_by: auth.value.userId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, severity, source, message, resolved, resolved_by, resolved_at, created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ errorLog: data })
}
