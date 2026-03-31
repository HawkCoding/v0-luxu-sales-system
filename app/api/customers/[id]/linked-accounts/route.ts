import { NextResponse } from "next/server"
import { z } from "zod"
import { normalizeOptionalString } from "@/lib/normalize-optional-string"
import { createSessionClient } from "@/lib/supabase/server"

const allowedRoles = new Set(["admin", "manager"])

const linkedAccountCreateSchema = z.object({
  relationship: z.string().max(100).nullable().optional(),
  firstName: z.string().max(100).nullable().optional(),
  lastName: z.string().max(100).nullable().optional(),
  email: z.string().email().max(255).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  linkedCustomerId: z.string().uuid().nullable().optional(),
})

type LinkedAccountCreatePayload = z.infer<typeof linkedAccountCreateSchema>

interface LinkedCustomerSummary {
  id: string
  first_name: string
  last_name: string
}

function buildNormalizedPayload(payload: LinkedAccountCreatePayload) {
  return {
    relationship: normalizeOptionalString(payload.relationship),
    first_name: normalizeOptionalString(payload.firstName),
    last_name: normalizeOptionalString(payload.lastName),
    email: normalizeOptionalString(payload.email)?.toLowerCase() ?? null,
    phone: normalizeOptionalString(payload.phone),
    linked_customer_id: payload.linkedCustomerId ?? null,
  }
}

function hasAtLeastOneValue(payload: ReturnType<typeof buildNormalizedPayload>): boolean {
  return Boolean(
    payload.relationship ||
      payload.first_name ||
      payload.last_name ||
      payload.email ||
      payload.phone ||
      payload.linked_customer_id,
  )
}

async function hasWriteAccess(
  supabase: Awaited<ReturnType<typeof createSessionClient>>,
  userId: string,
) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("clearance_level")
    .eq("user_id", userId)
    .single()

  if (error || !profile) return false
  return allowedRoles.has(profile.clearance_level)
}

async function getLinkedCustomerSummary(
  supabase: Awaited<ReturnType<typeof createSessionClient>>,
  customerId: string,
): Promise<LinkedCustomerSummary | null> {
  const { data, error } = await supabase
    .from("customers")
    .select("id, first_name, last_name")
    .eq("id", customerId)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return data
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: customerId } = await params
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const canWrite = await hasWriteAccess(supabase, user.id)
  if (!canWrite) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let requestBody: unknown
  try {
    requestBody = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const parsed = linkedAccountCreateSchema.safeParse(requestBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request payload", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const normalized = buildNormalizedPayload(parsed.data)
  if (!hasAtLeastOneValue(normalized)) {
    return NextResponse.json(
      { error: "Please provide at least one linked account field" },
      { status: 400 },
    )
  }

  if (normalized.linked_customer_id === customerId) {
    return NextResponse.json({ error: "Cannot link a customer to themselves" }, { status: 400 })
  }

  let linkedCustomer: LinkedCustomerSummary | null = null
  if (normalized.linked_customer_id) {
    linkedCustomer = await getLinkedCustomerSummary(supabase, normalized.linked_customer_id)
    if (!linkedCustomer) {
      return NextResponse.json({ error: "Linked customer not found" }, { status: 404 })
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from("customer_linked_accounts")
    .insert({
      customer_id: customerId,
      ...normalized,
      is_mirror: false,
    })
    .select(
      "id, customer_id, linked_customer_id, relationship, first_name, last_name, email, phone, is_mirror, created_at",
    )
    .single()

  if (insertError || !inserted) {
    if (insertError?.code === "23505") {
      return NextResponse.json(
        { error: "These customers are already linked on this account" },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: "Failed to create linked account" }, { status: 500 })
  }

  if (normalized.linked_customer_id) {
    const { error: mirrorError } = await supabase
      .from("customer_linked_accounts")
      .insert({
        customer_id: normalized.linked_customer_id,
        linked_customer_id: customerId,
        relationship: normalized.relationship,
        first_name: normalized.first_name,
        last_name: normalized.last_name,
        email: normalized.email,
        phone: normalized.phone,
        is_mirror: true,
      })

    if (mirrorError && mirrorError.code !== "23505") {
      await supabase.from("customer_linked_accounts").delete().eq("id", inserted.id)
      return NextResponse.json({ error: "Failed to create linked account mirror" }, { status: 500 })
    }
  }

  return NextResponse.json(
    {
      id: inserted.id,
      customerId: inserted.customer_id,
      linkedCustomerId: inserted.linked_customer_id,
      linkedCustomerName: linkedCustomer
        ? `${linkedCustomer.first_name} ${linkedCustomer.last_name}`.trim()
        : null,
      relationship: inserted.relationship,
      firstName: inserted.first_name,
      lastName: inserted.last_name,
      email: inserted.email,
      phone: inserted.phone,
      isMirror: inserted.is_mirror,
      createdAt: inserted.created_at,
    },
    { status: 201 },
  )
}
