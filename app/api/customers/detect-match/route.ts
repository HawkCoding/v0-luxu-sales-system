import { NextResponse } from "next/server"
import { z } from "zod"
import { normalizeOptionalString } from "@/lib/normalize-optional-string"
import { createSessionClient } from "@/lib/supabase/server"

const querySchema = z.object({
  email: z.string().trim().email().max(255).optional(),
  phone: z.string().trim().max(50).optional(),
  excludeId: z.string().uuid().optional(),
})

export async function GET(req: Request) {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    email: url.searchParams.get("email") ?? undefined,
    phone: url.searchParams.get("phone") ?? undefined,
    excludeId: url.searchParams.get("excludeId") ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const email = normalizeOptionalString(parsed.data.email)?.toLowerCase() ?? null
  const phone = normalizeOptionalString(parsed.data.phone)
  const excludeId = parsed.data.excludeId ?? null

  if (!email && !phone) {
    return NextResponse.json({ match: null })
  }

  let emailMatch: { id: string; first_name: string; last_name: string; email: string; phone: string | null } | null =
    null
  if (email) {
    let emailQuery = supabase
      .from("customers")
      .select("id, first_name, last_name, email, phone")
      .ilike("email", email)
      .limit(1)

    if (excludeId) {
      emailQuery = emailQuery.neq("id", excludeId)
    }

    const { data, error } = await emailQuery.maybeSingle()
    if (error) {
      return NextResponse.json({ error: "Failed to detect matching customer" }, { status: 500 })
    }
    emailMatch = data
  }

  if (emailMatch) {
    return NextResponse.json({
      match: {
        id: emailMatch.id,
        firstName: emailMatch.first_name,
        lastName: emailMatch.last_name,
        email: emailMatch.email,
        phone: emailMatch.phone,
      },
    })
  }

  if (!phone) {
    return NextResponse.json({ match: null })
  }

  let phoneQuery = supabase
    .from("customers")
    .select("id, first_name, last_name, email, phone")
    .eq("phone", phone)
    .limit(1)

  if (excludeId) {
    phoneQuery = phoneQuery.neq("id", excludeId)
  }

  const { data: phoneMatch, error: phoneError } = await phoneQuery.maybeSingle()
  if (phoneError) {
    return NextResponse.json({ error: "Failed to detect matching customer" }, { status: 500 })
  }

  if (!phoneMatch) {
    return NextResponse.json({ match: null })
  }

  return NextResponse.json({
    match: {
      id: phoneMatch.id,
      firstName: phoneMatch.first_name,
      lastName: phoneMatch.last_name,
      email: phoneMatch.email,
      phone: phoneMatch.phone,
    },
  })
}
