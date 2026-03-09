import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"
import { mapSupplierDetail } from "@/lib/suppliers"

const allowedRoles = new Set(["admin", "manager"])

const pricingOptionSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Pricing option name is required"),
  singlePrice: z.number().finite().nonnegative(),
  doublePrice: z.number().finite().nonnegative(),
  familyPrice: z.number().finite().nonnegative(),
  currency: z.string().trim().min(1).max(10),
  isPrimary: z.boolean(),
})

const supplierUpdateSchema = z.object({
  name: z.string().trim().min(1, "Supplier name is required"),
  kind: z.enum(["train_operator", "hotel_property", "transfers"]),
  email: z.string().trim().email().or(z.literal("")),
  phone: z.string().trim().max(100),
  website: z.string().trim().max(255),
  location: z.string().trim().max(255),
  notes: z.string().trim().max(5000),
  active: z.boolean(),
  pricingOptions: z
    .array(pricingOptionSchema)
    .superRefine((options, ctx) => {
      const primaryCount = options.filter((option) => option.isPrimary).length
      if (primaryCount > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Only one pricing option can be marked as primary.",
        })
      }

      const seenNames = new Set<string>()
      for (const option of options) {
        const normalizedName = option.name.trim().toLowerCase()
        if (!normalizedName) continue
        if (seenNames.has(normalizedName)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Pricing option names must be unique per supplier.",
          })
          break
        }
        seenNames.add(normalizedName)
      }
    }),
})

async function requireAuthenticatedUser() {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      supabase,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  return { supabase, user }
}

async function loadSupplierDetail(supabase: Awaited<ReturnType<typeof createSessionClient>>, id: string) {
  const [{ data: supplier, error: supplierError }, { data: pricingOptions, error: pricingError }] =
    await Promise.all([
      supabase.from("suppliers").select("*").eq("id", id).single(),
      supabase
        .from("supplier_pricing_options")
        .select("*")
        .eq("supplier_id", id)
        .order("is_primary", { ascending: false })
        .order("name", { ascending: true }),
    ])

  if (supplierError || !supplier) {
    return {
      error: NextResponse.json({ error: "Supplier not found" }, { status: 404 }),
    }
  }

  if (pricingError) {
    return {
      error: NextResponse.json(
        { error: "Failed to load supplier pricing" },
        { status: 500 },
      ),
    }
  }

  return {
    supplier,
    pricingOptions: pricingOptions ?? [],
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthenticatedUser()
  if ("error" in auth) {
    return auth.error
  }

  const { id } = await params
  const detail = await loadSupplierDetail(auth.supabase, id)
  if ("error" in detail) {
    return detail.error
  }

  return NextResponse.json(
    mapSupplierDetail(detail.supplier, detail.pricingOptions),
  )
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthenticatedUser()
  if ("error" in auth) {
    return auth.error
  }

  const { supabase, user } = auth
  const { id } = await params

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clearance_level")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile || !allowedRoles.has(profile.clearance_level)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let parsed: z.infer<typeof supplierUpdateSchema>
  try {
    parsed = supplierUpdateSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const existingDetail = await loadSupplierDetail(supabase, id)
  if ("error" in existingDetail) {
    return existingDetail.error
  }

  const existingIds = new Set(existingDetail.pricingOptions.map((option) => option.id))
  const unknownIds = parsed.pricingOptions
    .map((option) => option.id)
    .filter((optionId): optionId is string => Boolean(optionId && !existingIds.has(optionId)))

  if (unknownIds.length > 0) {
    return NextResponse.json(
      { error: "Invalid supplier pricing option selection" },
      { status: 400 },
    )
  }

  const hasPrimarySelection = parsed.pricingOptions.some((option) => option.isPrimary)
  const normalizedPricingOptions = parsed.pricingOptions.map((option, index) => ({
    id: option.id ?? crypto.randomUUID(),
    supplier_id: id,
    name: option.name,
    single_price: option.singlePrice,
    double_price: option.doublePrice,
    family_price: option.familyPrice,
    currency: option.currency,
    is_primary: hasPrimarySelection ? option.isPrimary : index === 0,
  }))

  const { error: supplierUpdateError } = await supabase
    .from("suppliers")
    .update({
      name: parsed.name,
      kind: parsed.kind,
      email: parsed.email || null,
      phone: parsed.phone || null,
      website: parsed.website || null,
      location: parsed.location || null,
      notes: parsed.notes || null,
      active: parsed.active,
    })
    .eq("id", id)

  if (supplierUpdateError) {
    return NextResponse.json(
      { error: "Failed to update supplier" },
      { status: 500 },
    )
  }

  const incomingIds = new Set(normalizedPricingOptions.map((option) => option.id))
  const idsToDelete = existingDetail.pricingOptions
    .map((option) => option.id)
    .filter((optionId) => !incomingIds.has(optionId))

  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from("supplier_pricing_options")
      .delete()
      .in("id", idsToDelete)

    if (deleteError) {
      return NextResponse.json(
        { error: "Failed to remove old supplier pricing" },
        { status: 500 },
      )
    }
  }

  if (normalizedPricingOptions.length > 0) {
    const { error: pricingError } = await supabase
      .from("supplier_pricing_options")
      .upsert(normalizedPricingOptions, { onConflict: "id" })

    if (pricingError) {
      return NextResponse.json(
        { error: "Failed to update supplier pricing" },
        { status: 500 },
      )
    }
  }

  const updatedDetail = await loadSupplierDetail(supabase, id)
  if ("error" in updatedDetail) {
    return updatedDetail.error
  }

  return NextResponse.json(
    mapSupplierDetail(updatedDetail.supplier, updatedDetail.pricingOptions),
  )
}
