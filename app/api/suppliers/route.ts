import { NextResponse } from "next/server"
import { z } from "zod"
import { mapSupplier } from "@/lib/suppliers"
import { getHotelDefaultTimes } from "@/lib/suppliers/hotel-default-times"
import {
  allowedRoles,
  requireAuthenticatedUser,
  resolveUniqueSupplierSlug,
  supplierConflictMessage,
} from "./helpers"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^[+\d\s()-]*$/
const WEBSITE_PATTERN = /^\S+\.\S+$/
const EMAIL_LABEL_MAX_LENGTH = 100



const createSupplierSchema = z.object({
  kind: z.enum(["train_operator", "hotel_property", "transfers", "vehicle_rental", "tour_operator", "airline"]),
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
  locationDetail: z.string().trim().max(255).nullable().optional(),
  streetAddress: z.string().trim().max(255).nullable().optional(),
  notes: z.string().trim().max(5000),
  emails: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        email: z
          .string()
          .trim()
          .max(255)
          .refine((value) => value === "" || EMAIL_PATTERN.test(value), {
            message: "Enter a valid email (e.g. name@example.com)",
          }),
        label: z.string().trim().max(EMAIL_LABEL_MAX_LENGTH).default("General"),
        /** Accepted for symmetry with the save schema; the create path writes array position. */
        sortOrder: z.number().int().nonnegative().optional(),
      }),
    )
    .optional()
    .default([]),
  /**
   * Set to reuse a sibling record's contact details -- the same company trading in a second
   * category (e.g. "Toyota (Transfers)" inheriting from "Toyota (Hotel)"). The database mirrors
   * the parent's contacts onto this row, so the supplied email/phone/website/emails are ignored.
   */
  parentSupplierId: z.string().uuid().nullable().optional(),
})

export async function GET(req: Request) {
  const auth = await requireAuthenticatedUser()
  if ("error" in auth) {
    return auth.error!
  }

  const { supabase } = auth
  const includeDrafts = new URL(req.url).searchParams.get("includeDrafts") === "true"
  // Always include temporary suppliers (active=false but need to appear in Suppliers page and picker).
  const supplierQuery = includeDrafts
    ? supabase.from("suppliers").select("*")
    : supabase.from("suppliers").select("*").or("active.eq.true,status.eq.temporary")
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
    return auth.error!
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
  const parsedEmails = parsed.emails
    .map((entry) => ({
      email: entry.email.trim(),
      label: entry.label.trim() || "General",
    }))
    .filter((entry) => entry.email.length > 0)
  const fallbackEmail = parsed.email.trim()
  const emailCandidates =
    parsedEmails.length > 0 || fallbackEmail.length === 0
      ? parsedEmails
      : [{ email: fallbackEmail, label: "General" }]
  const seenLowercaseEmails = new Set<string>()
  const normalizedEmails = emailCandidates.filter((entry) => {
    const normalizedKey = entry.email.toLowerCase()
    if (seenLowercaseEmails.has(normalizedKey)) {
      return false
    }
    seenLowercaseEmails.add(normalizedKey)
    return true
  })

  // Validate the link before inserting so a bad parent yields a clear 400 rather than surfacing as
  // a raw trigger exception. The database enforces the same rules as a backstop.
  const parentSupplierId = parsed.parentSupplierId ?? null
  if (parentSupplierId) {
    const { data: parentSupplier, error: parentError } = await supabase
      .from("suppliers")
      .select("id, name, kind, parent_supplier_id")
      .eq("id", parentSupplierId)
      .maybeSingle()

    if (parentError) {
      return NextResponse.json({ error: "Failed to create supplier" }, { status: 500 })
    }
    if (!parentSupplier) {
      return NextResponse.json(
        { error: "The supplier you linked to no longer exists." },
        { status: 400 },
      )
    }
    if (parentSupplier.parent_supplier_id) {
      return NextResponse.json(
        { error: `${parentSupplier.name} already inherits its contacts from another supplier.` },
        { status: 400 },
      )
    }
    if (parentSupplier.kind === parsed.kind) {
      return NextResponse.json(
        { error: "Link a supplier to a record in a different category." },
        { status: 400 },
      )
    }
  }

  let slug: string
  try {
    slug = await resolveUniqueSupplierSlug(supabase, supplierName, parsed.kind)
  } catch {
    return NextResponse.json({ error: "Failed to create supplier" }, { status: 500 })
  }

  const hotelDefaultTimes =
    parsed.kind === "hotel_property" ? await getHotelDefaultTimes(supabase) : null

  const { data: supplier, error } = await supabase
    .from("suppliers")
    .insert({
      kind: parsed.kind,
      // Airfare can't be maintained as a standing rate list -- new airline suppliers start
      // manually-priced by default, same as the backfill for existing ones.
      pricing_mode: parsed.kind === "airline" ? "manual" : "rate_card",
      name: supplierName,
      slug,
      email: normalizedEmails[0]?.email ?? null,
      phone: parsed.phone.trim() || null,
      website: parsed.website.trim() || null,
      location: parsed.location.trim() || null,
      location_detail: parsed.locationDetail?.trim() || null,
      street_address: parsed.streetAddress?.trim() || null,
      notes: parsed.notes.trim() || null,
      parent_supplier_id: parentSupplierId,
      single_supplement_pct: 0,
      default_time_start: hotelDefaultTimes?.checkIn ?? null,
      default_time_end: hotelDefaultTimes?.checkOut ?? null,
      active: false,
    })
    .select("*")
    .single()

  if (error || !supplier) {
    if (error?.code === "23505") {
      return NextResponse.json(
        { error: supplierConflictMessage(error, supplierName, parsed.kind) },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: "Failed to create supplier" }, { status: 500 })
  }

  // A linked record's email list is a mirror of its parent's, seeded by the database trigger --
  // writing the submitted addresses here would only be overwritten.
  if (!parentSupplierId && normalizedEmails.length > 0) {
    const { error: supplierEmailsError } = await supabase
      .from("supplier_emails")
      .insert(
        normalizedEmails.map((entry, index) => ({
          supplier_id: supplier.id,
          email: entry.email,
          label: entry.label,
          // Array position is the order; the first row is the primary contact mirrored onto
          // suppliers.email above.
          sort_order: index,
        })),
      )

    if (supplierEmailsError) {
      return NextResponse.json({ error: "Failed to save supplier emails" }, { status: 500 })
    }
  }

  return NextResponse.json(mapSupplier(supplier), { status: 201 })
}
