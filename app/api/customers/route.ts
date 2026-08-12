import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"
import { CUSTOMER_COLUMNS } from "@/lib/supabase/columns"
import { normalizeFirstName, normalizeLastName } from "@/lib/person-name-format"
import { PHONE_VALIDATION_MESSAGE, isPlausiblePhone } from "@/lib/phone-format"
import { COMPLETED_REPEAT_BOOKING_STAGES } from "@/lib/customer-repeat-status"

const allowedRoles = new Set(["admin", "manager", "consultant"])

const createCustomerSchema = z.object({
  title: z.enum(["Dr", "Prof", "Mr", "Mrs", "Ms"]).nullable().optional(),
  first_name: z.string().trim().min(1, "First name is required").max(100),
  last_name: z.string().trim().min(1, "Last name is required").max(100),
  email: z.string().trim().toLowerCase().email("Must be a valid email address").max(255),
  phone: z
    .string()
    .trim()
    .max(50)
    .nullable()
    .optional()
    .refine((value) => value === null || value === undefined || value === "" || isPlausiblePhone(value), {
      message: PHONE_VALIDATION_MESSAGE,
    }),
  country: z.string().trim().max(100).nullable().optional(),
  province: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  date_of_birth: z.string().date().nullable().optional(),
  id_passport: z.string().trim().max(50).nullable().optional(),
  vip_status: z.boolean().optional().default(false),
  preferences: z.string().trim().max(2000).nullable().optional(),
  communication_preferences: z.string().trim().max(1000).nullable().optional(),
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
    .select("id, first_name, last_name, email, phone, vip_status, is_repeat_client")
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

  const customerIds = (data ?? []).map((customer) => customer.id)
  const repeatCustomerIds = new Set<string>()
  if (customerIds.length > 0) {
    const { data: completedBookings, error: completedBookingsError } = await supabase
      .from("bookings")
      .select("customer_id")
      .in("customer_id", customerIds)
      .in("stage", COMPLETED_REPEAT_BOOKING_STAGES)

    if (completedBookingsError) {
      return NextResponse.json({ error: "Failed to load customer repeat status" }, { status: 500 })
    }

    ;(completedBookings ?? []).forEach((booking) => {
      if (booking.customer_id) repeatCustomerIds.add(booking.customer_id)
    })
  }

  return NextResponse.json({
    customers: (data ?? []).map((customer) => ({
      id: customer.id,
      firstName: customer.first_name,
      lastName: customer.last_name,
      email: customer.email,
      phone: customer.phone,
      vipStatus: customer.vip_status,
      isRepeatClient: repeatCustomerIds.has(customer.id),
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

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clearance_level")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile || !allowedRoles.has(profile.clearance_level)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let parsed: z.infer<typeof createCustomerSchema>
  try {
    parsed = createCustomerSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from("customers")
    .select("id, first_name, last_name")
    .ilike("email", parsed.email)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      {
        error: "That email already belongs to another customer.",
        code: "DUPLICATE_EMAIL",
        existingCustomer: {
          id: existing.id,
          firstName: existing.first_name,
          lastName: existing.last_name,
        },
      },
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
      province: parsed.province ?? null,
      title: parsed.title ?? null,
      notes: parsed.notes ?? null,
      date_of_birth: parsed.date_of_birth ?? null,
      id_passport: parsed.id_passport || null,
      vip_status: parsed.vip_status,
      preferences: parsed.preferences ?? null,
      communication_preferences: parsed.communication_preferences ?? null,
    })
    .select(CUSTOMER_COLUMNS)
    .single()

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "That email already belongs to another customer.", code: "DUPLICATE_EMAIL" },
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
      province: customer.province,
      title: customer.title,
      notes: customer.notes,
      dateOfBirth: customer.date_of_birth,
      vipStatus: customer.vip_status,
      preferences: customer.preferences,
      communicationPreferences: customer.communication_preferences,
      firstTravelDate: customer.first_travel_date,
      lastTravelDate: customer.last_travel_date,
      isRepeatClient: false,
      createdAt: customer.created_at,
      updatedAt: customer.updated_at,
    },
    { status: 201 },
  )
}
