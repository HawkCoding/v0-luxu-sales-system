import { NextResponse } from "next/server"
import { createSessionClient } from "@/lib/supabase/server"
import { mapLocation } from "@/lib/suppliers"

export async function GET() {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: locations, error } = await supabase
    .from("locations")
    .select("*")
    .order("name", { ascending: true })

  if (error) {
    return NextResponse.json(
      { error: "Failed to load locations" },
      { status: 500 },
    )
  }

  return NextResponse.json((locations ?? []).map(mapLocation))
}
