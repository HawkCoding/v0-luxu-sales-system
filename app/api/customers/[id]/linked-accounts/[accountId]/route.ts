import { NextResponse } from "next/server"
import { z } from "zod"
import { normalizeOptionalString } from "@/lib/normalize-optional-string"
import { createSessionClient } from "@/lib/supabase/server"
import { hasWriteAccess } from "../helpers"

const linkedAccountPatchSchema = z.object({
  relationship: z.string().max(100).nullable().optional(),
  firstName: z.string().max(100).nullable().optional(),
  lastName: z.string().max(100).nullable().optional(),
  email: z.string().email().max(255).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  linkedCustomerId: z.string().uuid().nullable().optional(),
})

type LinkedAccountPatchPayload = z.infer<typeof linkedAccountPatchSchema>

type LinkedAccountRow = {
  id: string
  customer_id: string
  linked_customer_id: string | null
  relationship: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  is_mirror: boolean
  created_at: string
}

function normalizePatch(payload: LinkedAccountPatchPayload) {
  const normalized: Partial<{
    relationship: string | null
    first_name: string | null
    last_name: string | null
    email: string | null
    phone: string | null
    linked_customer_id: string | null
  }> = {}

  if ("relationship" in payload) normalized.relationship = normalizeOptionalString(payload.relationship)
  if ("firstName" in payload) normalized.first_name = normalizeOptionalString(payload.firstName)
  if ("lastName" in payload) normalized.last_name = normalizeOptionalString(payload.lastName)
  if ("email" in payload) normalized.email = normalizeOptionalString(payload.email)?.toLowerCase() ?? null
  if ("phone" in payload) normalized.phone = normalizeOptionalString(payload.phone)
  if ("linkedCustomerId" in payload) normalized.linked_customer_id = payload.linkedCustomerId ?? null

  return normalized
}

async function ensureLinkedCustomerExists(
  supabase: Awaited<ReturnType<typeof createSessionClient>>,
  linkedCustomerId: string,
) {
  const { data, error } = await supabase
    .from("customers")
    .select("id")
    .eq("id", linkedCustomerId)
    .maybeSingle()

  if (error || !data) return false
  return true
}

async function deleteMirrorFor(
  supabase: Awaited<ReturnType<typeof createSessionClient>>,
  row: LinkedAccountRow,
) {
  if (!row.linked_customer_id) return

  await supabase
    .from("customer_linked_accounts")
    .delete()
    .eq("customer_id", row.linked_customer_id)
    .eq("linked_customer_id", row.customer_id)
    .eq("is_mirror", !row.is_mirror)
}

async function upsertMirrorFor(
  supabase: Awaited<ReturnType<typeof createSessionClient>>,
  sourceRow: LinkedAccountRow & { linked_customer_id: string },
) {
  const { data: existingMirror } = await supabase
    .from("customer_linked_accounts")
    .select("id")
    .eq("customer_id", sourceRow.linked_customer_id)
    .eq("linked_customer_id", sourceRow.customer_id)
    .eq("is_mirror", !sourceRow.is_mirror)
    .maybeSingle()

  const mirrorPayload = {
    relationship: sourceRow.relationship,
    first_name: sourceRow.first_name,
    last_name: sourceRow.last_name,
    email: sourceRow.email,
    phone: sourceRow.phone,
    is_mirror: !sourceRow.is_mirror,
  }

  if (existingMirror?.id) {
    await supabase
      .from("customer_linked_accounts")
      .update(mirrorPayload)
      .eq("id", existingMirror.id)
      .eq("customer_id", sourceRow.linked_customer_id)
  } else {
    await supabase.from("customer_linked_accounts").insert({
      customer_id: sourceRow.linked_customer_id,
      linked_customer_id: sourceRow.customer_id,
      ...mirrorPayload,
    })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; accountId: string }> },
) {
  const { id: customerId, accountId } = await params
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

  const { data: existing, error: existingError } = await supabase
    .from("customer_linked_accounts")
    .select(
      "id, customer_id, linked_customer_id, relationship, first_name, last_name, email, phone, is_mirror, created_at",
    )
    .eq("id", accountId)
    .eq("customer_id", customerId)
    .maybeSingle()

  if (existingError || !existing) {
    return NextResponse.json({ error: "Linked account not found" }, { status: 404 })
  }

  let requestBody: unknown
  try {
    requestBody = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const parsed = linkedAccountPatchSchema.safeParse(requestBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request payload", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const normalizedPatch = normalizePatch(parsed.data)
  const hasChanges = Object.keys(normalizedPatch).length > 0
  if (!hasChanges) {
    return NextResponse.json({ error: "No linked account changes provided" }, { status: 400 })
  }

  if (
    "linked_customer_id" in normalizedPatch &&
    normalizedPatch.linked_customer_id === customerId
  ) {
    return NextResponse.json({ error: "Cannot link a customer to themselves" }, { status: 400 })
  }

  const nextLinkedCustomerId =
    "linked_customer_id" in normalizedPatch
      ? (normalizedPatch.linked_customer_id ?? null)
      : (existing.linked_customer_id ?? null)

  if (nextLinkedCustomerId && !(await ensureLinkedCustomerExists(supabase, nextLinkedCustomerId))) {
    return NextResponse.json({ error: "Linked customer not found" }, { status: 404 })
  }

  const oldLinkedCustomerId = existing.linked_customer_id
  if (oldLinkedCustomerId && oldLinkedCustomerId !== nextLinkedCustomerId) {
    await deleteMirrorFor(supabase, existing as LinkedAccountRow)
  }

  const { data: updated, error: updateError } = await supabase
    .from("customer_linked_accounts")
    .update(normalizedPatch)
    .eq("id", accountId)
    .eq("customer_id", customerId)
    .select(
      "id, customer_id, linked_customer_id, relationship, first_name, last_name, email, phone, is_mirror, created_at",
    )
    .single()

  if (updateError || !updated) {
    if (updateError?.code === "23505") {
      return NextResponse.json(
        { error: "These customers are already linked on this account" },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: "Failed to update linked account" }, { status: 500 })
  }

  if (updated.linked_customer_id) {
    await upsertMirrorFor(supabase, updated as LinkedAccountRow & { linked_customer_id: string })
  }

  return NextResponse.json({
    id: updated.id,
    customerId: updated.customer_id,
    linkedCustomerId: updated.linked_customer_id,
    relationship: updated.relationship,
    firstName: updated.first_name,
    lastName: updated.last_name,
    email: updated.email,
    phone: updated.phone,
    isMirror: updated.is_mirror,
    createdAt: updated.created_at,
  })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; accountId: string }> },
) {
  const { id: customerId, accountId } = await params
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

  const { data: existing, error: existingError } = await supabase
    .from("customer_linked_accounts")
    .select("id, customer_id, linked_customer_id, is_mirror")
    .eq("id", accountId)
    .eq("customer_id", customerId)
    .maybeSingle()

  if (existingError || !existing) {
    return NextResponse.json({ error: "Linked account not found" }, { status: 404 })
  }

  if (existing.linked_customer_id) {
    await supabase
      .from("customer_linked_accounts")
      .delete()
      .eq("customer_id", existing.linked_customer_id)
      .eq("linked_customer_id", existing.customer_id)
      .eq("is_mirror", !existing.is_mirror)
  }

  const { error: deleteError } = await supabase
    .from("customer_linked_accounts")
    .delete()
    .eq("id", accountId)
    .eq("customer_id", customerId)

  if (deleteError) {
    return NextResponse.json({ error: "Failed to delete linked account" }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
