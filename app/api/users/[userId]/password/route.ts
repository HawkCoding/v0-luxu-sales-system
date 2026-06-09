/**
 * POST /api/users/[userId]/password
 *
 * Admin-only: set or reset another user's password.
 * Sends a notification email to the target user (if RESEND_API_KEY is set).
 * Logs the action to audit_logs.
 */

import { NextResponse } from "next/server"
import { createServiceClient, createSessionClient } from "@/lib/supabase/server"
import { getEmailFromAddress } from "@/lib/email/from"
import { sendEmail } from "@/lib/email/transport"
import { BRAND_NAME } from "@/lib/brand"

export const runtime = "nodejs"

async function requireAdmin() {
  const sessionClient = await createSessionClient()
  const {
    data: { user },
    error: userError,
  } = await sessionClient.auth.getUser()
  if (userError || !user) return { authorized: false as const, adminName: null, adminUserId: null }

  const { data: profile, error: profileError } = await sessionClient
    .from("profiles")
    .select("name, surname, clearance_level")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile || profile.clearance_level !== "admin") {
    return { authorized: false as const, adminName: null, adminUserId: null }
  }
  const adminName = [profile.name, profile.surname].filter(Boolean).join(" ").trim() || profile.name
  return { authorized: true as const, adminName, adminUserId: user.id }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { authorized, adminName, adminUserId } = await requireAdmin()
  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { userId } = await params
  if (!userId?.trim()) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 })
  }

  let body: { newPassword?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const newPassword = typeof body.newPassword === "string" ? body.newPassword.trim() : ""
  if (!newPassword || newPassword.length < 6) {
    return NextResponse.json(
      { error: "newPassword is required and must be at least 6 characters" },
      { status: 400 }
    )
  }

  const service = createServiceClient()

  // Ensure target user exists in profiles (app user)
  const { data: targetProfile, error: profileErr } = await service
    .from("profiles")
    .select("user_id, email, name")
    .eq("user_id", userId)
    .maybeSingle()

  if (profileErr || !targetProfile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const targetEmail = targetProfile.email
  if (!targetEmail) {
    return NextResponse.json({ error: "User has no email" }, { status: 400 })
  }

  const { error: updateError } = await service.auth.admin.updateUserById(userId, {
    password: newPassword,
  })

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message || "Failed to update password" },
      { status: 500 }
    )
  }

  // Audit log
  try {
    await service.from("audit_logs").insert({
      action: "password_reset",
      actor: adminName,
      actor_user_id: adminUserId,
      entity_type: "user",
      entity_id: userId,
      meta_json: { target_email: targetEmail },
    })
  } catch {
    // non-fatal
  }

  // Notification email (optional)
  try {
    await sendEmail({
      from: await getEmailFromAddress(service),
      to: targetEmail,
      subject: `Your password was reset – ${BRAND_NAME}`,
      text: `Your password for ${BRAND_NAME} was reset by ${adminName} at ${new Date().toISOString()}.\n\nIf you did not request this, contact your administrator.`,
    })
  } catch {
    // Ignore send errors for now; password was already updated.
  }

  return NextResponse.json({ ok: true })
}
