/**
 * GET /api/users
 *
 * Admin-only:
 * - GET: list app users (profiles) for user management UI.
 * - POST: create a new app user.
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { adminAuthErrorResponse, requireAdmin } from "@/lib/api/require-admin"
import { createServiceClient, createSessionClient } from "@/lib/supabase/server"

const roleSchema = z.enum(["admin", "manager", "consultant", "readonly"])

const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  surname: z.string().trim().max(120).optional(),
  email: z.string().trim().email("Invalid email address"),
  clearanceLevel: roleSchema,
  password: z.string().min(10, "Password must be at least 10 characters"),
})

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return adminAuthErrorResponse(auth.status)
  }

  const supabase = await createSessionClient()
  const withIsActiveQuery = supabase
    .from("profiles")
    .select("user_id, email, name, surname, clearance_level, is_active")
    .order("name", { ascending: true })

  const { data: profilesWithStatus, error: withIsActiveError } = await withIsActiveQuery

  if (!withIsActiveError) {
    const users = (profilesWithStatus ?? []).map((p) => ({
      userId: p.user_id,
      email: p.email,
      firstName: p.name ?? "",
      lastName: p.surname ?? "",
      clearanceLevel: p.clearance_level,
      isActive: p.is_active ?? true,
      isCurrentUser: p.user_id === auth.value.adminUserId,
    }))

    return NextResponse.json({ users })
  }

  // If PostgREST schema cache is stale, column-specific select can fail even when
  // the DB column exists. Fall back to a legacy projection so users still load.
  const { data: legacyProfiles, error: legacyError } = await supabase
    .from("profiles")
    .select("user_id, email, name, surname, clearance_level")
    .order("name", { ascending: true })

  if (legacyError) {
    return NextResponse.json({ error: withIsActiveError.message || legacyError.message }, { status: 500 })
  }

  const users = (legacyProfiles ?? []).map((p) => ({
    userId: p.user_id,
    email: p.email,
    firstName: p.name ?? "",
    lastName: p.surname ?? "",
    clearanceLevel: p.clearance_level,
    isActive: true,
    isCurrentUser: p.user_id === auth.value.adminUserId,
  }))

  return NextResponse.json({ users })
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return adminAuthErrorResponse(auth.status)
  }

  let parsed: z.infer<typeof createUserSchema>
  try {
    parsed = createUserSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const normalizedEmail = parsed.email.toLowerCase()
  const normalizedSurname = parsed.surname?.trim() || null
  const service = createServiceClient()

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: normalizedEmail,
    password: parsed.password,
    email_confirm: true,
    user_metadata: {
      name: parsed.name,
      surname: normalizedSurname,
    },
  })

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message || "Failed to create user" },
      { status: 400 }
    )
  }

  const createdUserId = created.user.id
  const { error: profileError } = await service.from("profiles").upsert(
    {
      user_id: createdUserId,
      email: normalizedEmail,
      name: parsed.name,
      surname: normalizedSurname,
      clearance_level: parsed.clearanceLevel,
      is_active: true,
    },
    { onConflict: "user_id" }
  )

  if (profileError) {
    console.error("Failed to create user profile", {
      userId: createdUserId,
      email: normalizedEmail,
      message: profileError.message,
      code: profileError.code,
      details: profileError.details,
      hint: profileError.hint,
    })

    try {
      await service.auth.admin.deleteUser(createdUserId)
    } catch (deleteUserError) {
      console.error("Failed to rollback auth user after profile creation failure", {
        userId: createdUserId,
        email: normalizedEmail,
        deleteUserError,
      })
    }

    return NextResponse.json(
      { error: "Failed to create user profile", details: profileError.message },
      { status: 500 }
    )
  }

  try {
    await service.from("audit_logs").insert({
      action: "user_created",
      actor: auth.value.adminName,
      actor_user_id: auth.value.adminUserId,
      entity_type: "user",
      entity_id: createdUserId,
      meta_json: { email: normalizedEmail, clearance_level: parsed.clearanceLevel },
    })
  } catch {
    // non-fatal
  }

  return NextResponse.json(
    {
      user: {
        userId: createdUserId,
        email: normalizedEmail,
        firstName: parsed.name,
        lastName: normalizedSurname ?? "",
        clearanceLevel: parsed.clearanceLevel,
        isActive: true,
        isCurrentUser: false,
      },
    },
    { status: 201 }
  )
}
