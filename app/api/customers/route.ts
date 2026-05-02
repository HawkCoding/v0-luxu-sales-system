import { NextResponse } from "next/server"
import { createSessionClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const query = searchParams.get("search")?.trim()

  let customerQuery = supabase
    .from("customers")
    .select("id, first_name, last_name, email, phone")
    .order("updated_at", { ascending: false })
    .limit(25)

  if (query) {
    const escaped = query.replaceAll(",", " ").replaceAll("%", "\\%").replaceAll("_", "\\_")
    customerQuery = customerQuery.or(
      `first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%,email.ilike.%${escaped}%,phone.ilike.%${escaped}%`,
    )
  }

  const { data, error } = await customerQuery

  if (error) {
    return NextResponse.json({ error: "Failed to load customers" }, { status: 500 })
  }

  return NextResponse.json({
    customers: (data ?? []).map((customer) => ({
      id: customer.id,
      firstName: customer.first_name,
      lastName: customer.last_name,
      email: customer.email,
      phone: customer.phone,
    })),
  })
}
