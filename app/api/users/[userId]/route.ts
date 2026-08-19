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
import { adminAuthErrorResponse, requireAdmin } from "@/lib/api/require-admin"
import { jsonError, jsonZodError } from "@/lib/api/responses"
import { createServiceClient } from "@/lib/supabase/server"

const roleSchema = z.enum(["admin", "manager", "consultant"])

/** How many booking references to name back in the "still assigned" error. */
const BLOCKING_BOOKING_SAMPLE_SIZE = 5

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return adminAuthErrorResponse(auth.status)
  }

  const { userId } = await params
  if (!userId?.trim()) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const result = patchSchema.safeParse(raw)
  if (!result.success) return jsonZodError(result.error)
  const payload = result.data

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
    return adminAuthErrorResponse(auth.status)
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

  // bookings.assigned_salesperson_id / owner_user_id reference auth.users, so a
  // user still attached to a booking cannot be deleted. Say so instead of
  // letting the FK surface as a 500.
  const { data: linkedBookings, error: linkedBookingsError } = await service
    .from("bookings")
    .select("booking_number")
    .or(`assigned_salesperson_id.eq.${userId},owner_user_id.eq.${userId}`)
    .limit(BLOCKING_BOOKING_SAMPLE_SIZE + 1)

  if (linkedBookingsError) {
    console.error("Failed to check bookings before deleting user", linkedBookingsError)
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 })
  }

  if (linkedBookings && linkedBookings.length > 0) {
    const references = linkedBookings
      .slice(0, BLOCKING_BOOKING_SAMPLE_SIZE)
      .map((booking) => booking.booking_number)
      .filter(Boolean)

    return NextResponse.json(
      {
        error:
          "This user is still assigned to bookings. Reassign or unassign them before deleting the account.",
        details: { references },
      },
      { status: 409 }
    )
  }

  const { error: deleteError } = await service.auth.admin.deleteUser(userId)
  if (deleteError) {
    console.error("Failed to delete user", { userId, message: deleteError.message })
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 })
  }

  // Audit only what actually happened — logging before the delete recorded
  // failed attempts as completed deletions (QA 02, F02-3).
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

  return NextResponse.json({ ok: true })
}
