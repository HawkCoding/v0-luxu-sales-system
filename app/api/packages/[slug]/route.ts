import { NextResponse } from "next/server"
import { upsertPackageSchema, type UpsertPackageInput } from "../schemas"
import { requireAuthenticatedUser } from "../../suppliers/helpers"
import {
  hasPackageWriteAccess,
  loadPackageDetail,
  normalizePackageChildren,
  resolveUniquePackageSlug,
} from "./helpers"

interface StaleVersionConflictPayload {
  error: string
  code: "STALE_VERSION"
  currentUpdatedAt: string
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireAuthenticatedUser()
  if ("error" in auth) {
    return auth.error!
  }

  const { slug } = await params
  const detail = await loadPackageDetail(auth.supabase, slug)
  if ("error" in detail) {
    return detail.error!
  }

  return NextResponse.json(detail.detail)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireAuthenticatedUser()
  if ("error" in auth) {
    return auth.error!
  }

  const { supabase, user } = auth
  if (!(await hasPackageWriteAccess(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { slug } = await params
  let parsed: UpsertPackageInput
  try {
    parsed = upsertPackageSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const existing = await loadPackageDetail(supabase, slug)
  if ("error" in existing) {
    return existing.error!
  }

  if (
    typeof parsed.expectedUpdatedAt === "string" &&
    parsed.expectedUpdatedAt !== existing.packageRow.updated_at
  ) {
    const staleVersionConflict: StaleVersionConflictPayload = {
      error:
        "This package was modified by another user since you started editing. Please refresh and try again.",
      code: "STALE_VERSION",
      currentUpdatedAt: existing.packageRow.updated_at,
    }
    return NextResponse.json(staleVersionConflict, { status: 409 })
  }

  let nextSlug = existing.packageRow.slug
  try {
    if (parsed.name.trim() !== existing.packageRow.name) {
      nextSlug = await resolveUniquePackageSlug(supabase, parsed.name, existing.packageRow.id)
    }
  } catch {
    return NextResponse.json({ error: "Failed to validate package slug" }, { status: 500 })
  }

  let children
  try {
    children = normalizePackageChildren(existing.packageRow.id, parsed)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid package structure" },
      { status: 400 },
    )
  }

  let updateQuery = supabase
    .from("packages")
    .update({
      name: parsed.name.trim(),
      slug: nextSlug,
      description: parsed.description?.trim() || null,
      duration_nights: parsed.durationNights ?? null,
      single_supplement_pct: parsed.singleSupplementPct,
      fixed_price_per_person: parsed.fixedPricePerPerson ?? null,
      currency: parsed.currency.trim().toUpperCase() || "ZAR",
      active: parsed.active,
    })
    .eq("id", existing.packageRow.id)

  if (typeof parsed.expectedUpdatedAt === "string") {
    updateQuery = updateQuery.eq("updated_at", parsed.expectedUpdatedAt)
  }

  const { data: updatedPackage, error: updateError } = await updateQuery
    .select("updated_at")
    .maybeSingle()

  if (updateError) {
    return NextResponse.json({ error: "Failed to update package" }, { status: 500 })
  }

  if (!updatedPackage) {
    const { data: latestPackageSnapshot } = await supabase
      .from("packages")
      .select("updated_at")
      .eq("id", existing.packageRow.id)
      .maybeSingle()

    const staleVersionConflict: StaleVersionConflictPayload = {
      error:
        "This package was modified by another user since you started editing. Please refresh and try again.",
      code: "STALE_VERSION",
      currentUpdatedAt: latestPackageSnapshot?.updated_at ?? existing.packageRow.updated_at,
    }
    return NextResponse.json(staleVersionConflict, { status: 409 })
  }

  const incomingLegIds = new Set(children.legs.map((leg) => leg.id).filter(Boolean))
  const existingLegIds = existing.legs.map((leg) => leg.id)
  const legIdsToDelete = existingLegIds.filter((id) => !incomingLegIds.has(id))

  if (children.legs.length > 0) {
    const { error } = await supabase
      .from("package_legs")
      .upsert(children.legs, { onConflict: "id" })
    if (error) {
      return NextResponse.json({ error: "Failed to update package legs" }, { status: 500 })
    }
  }

  if (children.routes.length > 0) {
    const { error } = await supabase
      .from("routes")
      .upsert(children.routes, { onConflict: "id" })
    if (error) {
      return NextResponse.json({ error: "Failed to update package routes" }, { status: 500 })
    }
  }

  if (existingLegIds.length > 0) {
    const { error } = await supabase
      .from("package_leg_routes")
      .delete()
      .in("package_leg_id", existingLegIds)
    if (error) {
      return NextResponse.json({ error: "Failed to update package route selections" }, { status: 500 })
    }
  }

  if (children.routeLinks.length > 0) {
    const { error } = await supabase
      .from("package_leg_routes")
      .insert(children.routeLinks)
    if (error) {
      return NextResponse.json({ error: "Failed to update package route selections" }, { status: 500 })
    }
  }

  if (children.rateCards.length > 0) {
    const { error } = await supabase
      .from("rate_cards")
      .upsert(children.rateCards, { onConflict: "id" })
    if (error) {
      const status = error.code === "23505" || error.code === "23P01" ? 409 : 500
      return NextResponse.json({ error: "Failed to update package rates" }, { status })
    }
  }

  if (legIdsToDelete.length > 0) {
    const { error } = await supabase.from("package_legs").delete().in("id", legIdsToDelete)
    if (error) {
      return NextResponse.json({ error: "Failed to remove old package legs" }, { status: 500 })
    }
  }

  const detail = await loadPackageDetail(supabase, nextSlug)
  if ("error" in detail) {
    return detail.error!
  }

  return NextResponse.json(detail.detail)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireAuthenticatedUser()
  if ("error" in auth) {
    return auth.error!
  }

  const { supabase, user } = auth
  if (!(await hasPackageWriteAccess(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { slug } = await params
  const existing = await loadPackageDetail(supabase, slug)
  if ("error" in existing) {
    return existing.error!
  }

  const { error } = await supabase
    .from("packages")
    .delete()
    .eq("id", existing.packageRow.id)

  if (error) {
    if (error.code === "23503") {
      return NextResponse.json(
        { error: "Cannot delete package while it is referenced by another record" },
        { status: 409 },
      )
    }

    return NextResponse.json({ error: "Failed to delete package" }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
