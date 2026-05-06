import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"
import { normalizeFirstName, normalizeLastName } from "@/lib/person-name-format"

const createCustomerSchema = z.object({
  title: z.enum(["Dr", "Prof", "Mr", "Mrs", "Ms"]).nullable().optional(),
  first_name: z.string().trim().min(1, "First name is required").max(100),
  last_name: z.string().trim().min(1, "Last name is required").max(100),
  email: z.string().trim().toLowerCase().email("Must be a valid email address").max(255),
  phone: z.string().trim().max(50).nullable().optional(),
  country: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
})

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

export async function POST(request: Request) {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let parsed: z.infer<typeof createCustomerSchema>
  try {
    parsed = createCustomerSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from("customers")
    .select("id")
    .eq("email", parsed.email)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: "A customer with this email address already exists." },
      { status: 409 },
    )
  }

  const firstName = normalizeFirstName(parsed.first_name)
  const lastName = normalizeLastName(parsed.last_name)

  const { data: customer, error: insertError } = await supabase
    .from("customers")
    .insert({
      first_name: firstName,
      last_name: lastName,
      email: parsed.email,
      phone: parsed.phone ?? null,
      country: parsed.country ?? null,
      title: parsed.title ?? null,
      notes: parsed.notes ?? null,
    })
    .select("id, first_name, last_name, email, phone, country, title, notes, created_at, updated_at")
    .single()

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "A customer with this email address already exists." },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 })
  }

  return NextResponse.json(
    {
      id: customer.id,
      firstName: customer.first_name,
      lastName: customer.last_name,
      email: customer.email,
      phone: customer.phone,
      country: customer.country,
      title: customer.title,
      notes: customer.notes,
      createdAt: customer.created_at,
      updatedAt: customer.updated_at,
    },
    { status: 201 },
  )
}
