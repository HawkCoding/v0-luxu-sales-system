import { NextResponse } from "next/server"
import { z } from "zod"
import { mapSupplier } from "@/lib/suppliers"
import { allowedRoles, requireAuthenticatedUser, type SessionClient } from "./helpers"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^[+\d\s()-]*$/
const WEBSITE_PATTERN = /^\S+\.\S+$/

function buildSupplierSlugBase(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return slug || "supplier"
}

async function resolveUniqueSupplierSlug(
  supabase: SessionClient,
  supplierName: string,
): Promise<string> {
  const slugBase = buildSupplierSlugBase(supplierName)

  const { data: slugRows, error } = await supabase
    .from("suppliers")
    .select("slug")
    .or(`slug.eq.${slugBase},slug.like.${slugBase}-%`)

  if (error) {
    throw new Error("Failed to validate supplier slug uniqueness")
  }

  const usedSlugs = new Set((slugRows ?? []).map((row) => row.slug))
  if (!usedSlugs.has(slugBase)) {
    return slugBase
  }

  let suffix = 2
  while (usedSlugs.has(`${slugBase}-${suffix}`)) {
    suffix += 1
  }

  return `${slugBase}-${suffix}`
}

const createSupplierSchema = z.object({
  kind: z.enum(["train_operator", "hotel_property", "transfers"]),
  name: z.string().trim().min(2, "Supplier name must be at least 2 characters").max(200),
  email: z
    .string()
    .trim()
    .max(255)
    .refine((value) => value === "" || EMAIL_PATTERN.test(value), {
      message: "Enter a valid email (e.g. name@example.com)",
    }),
  phone: z
    .string()
    .trim()
    .max(100)
    .refine((value) => value === "" || PHONE_PATTERN.test(value), {
      message: "Phone can include digits, spaces, +, -, and parentheses only",
    })
    .refine((value) => value === "" || value.length >= 7, {
      message: "Phone must be at least 7 characters",
    }),
  website: z
    .string()
    .trim()
    .max(255)
    .refine((value) => value === "" || WEBSITE_PATTERN.test(value), {
      message: "Enter a valid website (e.g. example.com)",
    }),
  location: z
    .string()
    .trim()
    .max(255)
    .refine((value) => value === "" || value.length >= 2, {
      message: "Location must be at least 2 characters",
    }),
  notes: z.string().trim().max(5000),
})

export async function GET(req: Request) {
  const auth = await requireAuthenticatedUser()
  if ("error" in auth) {
    return auth.error
  }

  const { supabase } = auth
  const includeDrafts = new URL(req.url).searchParams.get("includeDrafts") === "true"
  const supplierQuery = includeDrafts
    ? supabase.from("suppliers").select("*")
    : supabase.from("suppliers").select("*").eq("active", true)
  const { data: suppliers, error } = await supplierQuery
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

export async function POST(req: Request) {
  const auth = await requireAuthenticatedUser()
  if ("error" in auth) {
    return auth.error
  }

  const { supabase, user } = auth

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clearance_level")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile || !allowedRoles.has(profile.clearance_level)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsedResult = createSupplierSchema.safeParse(await req.json())
  if (!parsedResult.success) {
    return NextResponse.json(
      {
        error: "Invalid request payload",
        details: parsedResult.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }
  const parsed = parsedResult.data
  const supplierName = parsed.name.trim()

  let slug: string
  try {
    slug = await resolveUniqueSupplierSlug(supabase, supplierName)
  } catch {
    return NextResponse.json({ error: "Failed to create supplier" }, { status: 500 })
  }

  const { data: supplier, error } = await supabase
    .from("suppliers")
    .insert({
      kind: parsed.kind,
      name: supplierName,
      slug,
      email: parsed.email.trim() || null,
      phone: parsed.phone.trim() || null,
      website: parsed.website.trim() || null,
      location: parsed.location.trim() || null,
      notes: parsed.notes.trim() || null,
      active: false,
    })
    .select("*")
    .single()

  if (error || !supplier) {
    if (error?.code === "23505") {
      return NextResponse.json(
        { error: "A supplier with this name already exists." },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: "Failed to create supplier" }, { status: 500 })
  }

  return NextResponse.json(mapSupplier(supplier), { status: 201 })
}
