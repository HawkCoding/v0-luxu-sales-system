import { NextResponse } from "next/server"
import { createSessionClient } from "@/lib/supabase/server"
import { mapSupplier } from "@/lib/suppliers"

export async function GET() {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: suppliers, error } = await supabase
    .from("suppliers")
    .select("*")
    .order("kind", { ascending: true })
    .order("name", { ascending: true })

  if (error) {
    return NextResponse.json(
      { error: "Failed to load suppliers" },
      { status: 500 },
    )
  }

  return NextResponse.json((suppliers ?? []).map(mapSupplier))
}
