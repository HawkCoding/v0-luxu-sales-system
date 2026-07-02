/**
 * PATCH /api/users/[userId]
 * DELETE /api/users/[userId]
 *
 * Admin-only:
 * - PATCH: deactivate/reactivate user.
 * - DELETE: permanently delete user.
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { createServiceClient, createSessionClient } from "@/lib/supabase/server"

const roleSchema = z.enum(["admin", "manager", "consultant", "readonly"])

const patchSchema = z
  .object({
    isActive: z.boolean().optional(),
    clearanceLevel: roleSchema.optional(),
    name: z.string().trim().min(1).max(120).optional(),
    surname: z.string().trim().max(120).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
  })
  .refine(
    (data) =>
      data.isActive !== undefined ||
      data.clearanceLevel !== undefined ||
      data.name !== undefined ||
      data.surname !== undefined ||
      data.email !== undefined,
    { message: "At least one field required" }
  )

interface AdminContext {
  adminName: string
  adminUserId: string
}

async function requireAdmin():
  Promise<{ ok: true; value: AdminContext } | { ok: false; status: 401 | 403 }> {
  const sessionClient = await createSessionClient()
  const {
    data: { user },
    error: userError,
  } = await sessionClient.auth.getUser()
  if (userError || !user) return { ok: false, status: 401 }

  const { data: profile, error: profileError } = await sessionClient
    .from("profiles")
    .select("name, surname, email, clearance_level")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile || profile.clearance_level !== "admin") {
    return { ok: false, status: 403 }
  }

  const adminName = [profile.name, profile.surname].filter(Boolean).join(" ").trim() || profile.email
  return { ok: true, value: { adminName, adminUserId: user.id } }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status })
  }

  const { userId } = await params
  if (!userId?.trim()) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 })
  }

  let payload: z.infer<typeof patchSchema>
  try {
    payload = patchSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  if (userId === auth.value.adminUserId) {
    if (payload.clearanceLevel !== undefined) {
      return NextResponse.json({ error: "You cannot change your own role" }, { status: 400 })
    }
    if (payload.isActive !== undefined) {
      return NextResponse.json({ error: "You cannot deactivate your own account" }, { status: 400 })
    }
  }

  const service = createServiceClient()
  const { data: targetProfile, error: profileError } = await service
    .from("profiles")
    .select("user_id, email, name, surname, is_active, clearance_level")
    .eq("user_id", userId)
    .maybeSingle()

  if (profileError || !targetProfile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  if (payload.isActive !== undefined) {
    const banDuration = payload.isActive ? "none" : "876000h"
    const { error: authError } = await service.auth.admin.updateUserById(userId, {
      ban_duration: banDuration,
    })

    if (authError) {
      return NextResponse.json(
        { error: authError.message || "Failed to update auth status" },
        { status: 500 }
      )
    }
  }

  if (payload.email !== undefined && payload.email !== targetProfile.email) {
    const { error: authEmailError } = await service.auth.admin.updateUserById(userId, {
      email: payload.email,
      email_confirm: true,
    })

    if (authEmailError) {
      return NextResponse.json(
        { error: authEmailError.message || "Failed to update email" },
        { status: 400 }
      )
    }
  }

  const profileUpdates: {
    is_active?: boolean
    clearance_level?: z.infer<typeof roleSchema>
    name?: string
    surname?: string | null
    email?: string
  } = {}
  if (payload.isActive !== undefined) {
    profileUpdates.is_active = payload.isActive
  }
  if (payload.clearanceLevel !== undefined) {
    profileUpdates.clearance_level = payload.clearanceLevel
  }
  if (payload.name !== undefined) {
    profileUpdates.name = payload.name
  }
  if (payload.surname !== undefined) {
    profileUpdates.surname = payload.surname || null
  }
  if (payload.email !== undefined) {
    profileUpdates.email = payload.email
  }

  const { error: updateError } = await service.from("profiles").update(profileUpdates).eq("user_id", userId)

  if (updateError) {
    return NextResponse.json({ error: "Failed to update user profile" }, { status: 500 })
  }

  if (payload.isActive !== undefined) {
    try {
      await service.from("audit_logs").insert({
        action: payload.isActive ? "user_reactivated" : "user_deactivated",
        actor: auth.value.adminName,
        actor_user_id: auth.value.adminUserId,
        entity_type: "user",
        entity_id: userId,
        meta_json: {
          target_email: targetProfile.email,
          previous_is_active: targetProfile.is_active ?? true,
          next_is_active: payload.isActive,
        },
      })
    } catch {
      // non-fatal
    }
  }

  if (payload.clearanceLevel !== undefined) {
    try {
      await service.from("audit_logs").insert({
        action: "role_changed",
        actor: auth.value.adminName,
        actor_user_id: auth.value.adminUserId,
        entity_type: "user",
        entity_id: userId,
        meta_json: {
          target_email: targetProfile.email,
          previous_clearance_level: targetProfile.clearance_level,
          next_clearance_level: payload.clearanceLevel,
        },
      })
    } catch {
      // non-fatal
    }
  }

  if (payload.name !== undefined || payload.surname !== undefined || payload.email !== undefined) {
    try {
      await service.from("audit_logs").insert({
        action: "user_details_updated",
        actor: auth.value.adminName,
        actor_user_id: auth.value.adminUserId,
        entity_type: "user",
        entity_id: userId,
        meta_json: {
          previous: {
            name: targetProfile.name,
            surname: targetProfile.surname,
            email: targetProfile.email,
          },
          next: {
            name: payload.name ?? targetProfile.name,
            surname: payload.surname ?? targetProfile.surname,
            email: payload.email ?? targetProfile.email,
          },
        },
      })
    } catch {
      // non-fatal
    }
  }

  return NextResponse.json({
    ok: true,
    isActive: payload.isActive ?? (targetProfile.is_active ?? true),
    clearanceLevel: payload.clearanceLevel ?? targetProfile.clearance_level,
    name: payload.name ?? targetProfile.name,
    surname: payload.surname ?? targetProfile.surname,
    email: payload.email ?? targetProfile.email,
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status })
  }

  const { userId } = await params
  if (!userId?.trim()) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 })
  }

  if (userId === auth.value.adminUserId) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: targetProfile, error: profileError } = await service
    .from("profiles")
    .select("user_id, email, name, surname")
    .eq("user_id", userId)
    .maybeSingle()

  if (profileError || !targetProfile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  try {
    await service.from("audit_logs").insert({
      action: "user_deleted",
      actor: auth.value.adminName,
      actor_user_id: auth.value.adminUserId,
      entity_type: "user",
      entity_id: userId,
      meta_json: {
        target_email: targetProfile.email,
        target_name:
          [targetProfile.name, targetProfile.surname].filter(Boolean).join(" ").trim() ||
          targetProfile.email,
      },
    })
  } catch {
    // non-fatal
  }

  const { error: deleteError } = await service.auth.admin.deleteUser(userId)
  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message || "Failed to delete user" },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
