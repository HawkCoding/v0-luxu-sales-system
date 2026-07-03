import { NextResponse } from "next/server"
import { mapPackageListItem, type PackageLegWithSupplier } from "@/lib/packages"
import { createPackageSchema } from "./schemas"
import {
  hasPackageWriteAccess,
  loadPackageDetail,
  loadSupplierKinds,
  normalizePackageChildren,
  resolveUniquePackageSlug,
} from "./[slug]/helpers"
import { requireAuthenticatedUser } from "../suppliers/helpers"

export async function GET() {
  const auth = await requireAuthenticatedUser()
  if ("error" in auth) {
    return auth.error!
  }

  const { supabase } = auth
  const [
    { data: packages, error: packagesError },
    { data: legRows, error: legsError },
    { data: legRouteRows, error: legRoutesError },
    { data: routeRows, error: routesError },
    { data: rateCardRows, error: rateCardsError },
  ] = await Promise.all([
    supabase
      .from("packages")
      .select("*")
      .order("name", { ascending: true }),
    supabase
      .from("package_legs")
      .select("*, suppliers(name, description, kind)")
      .order("sort_order", { ascending: true }),
    supabase.from("package_leg_routes").select("package_leg_id, route_id"),
    supabase.from("routes").select("id, supplier_id, name"),
    supabase.from("rate_cards").select("route_id, price_per_person"),
  ])

  if (packagesError || legsError || legRoutesError || routesError || rateCardsError) {
    return NextResponse.json({ error: "Failed to load packages" }, { status: 500 })
  }

  const legs = ((legRows ?? []) as Array<
    Omit<PackageLegWithSupplier, "supplierName" | "supplierDescription" | "supplierKind"> & {
      suppliers: { name: string; description: string | null; kind: PackageLegWithSupplier["supplierKind"] } | null
    }
  >).map((leg) => ({
    id: leg.id,
    package_id: leg.package_id,
    supplier_id: leg.supplier_id,
    label: leg.label,
    sort_order: leg.sort_order,
    created_at: leg.created_at,
    supplierName: leg.suppliers?.name ?? "Unknown supplier",
    supplierDescription: leg.suppliers?.description ?? null,
    supplierKind: leg.suppliers?.kind ?? "train_operator",
  }))

  const routes = routeRows ?? []
  const rateCards = rateCardRows ?? []
  const legRoutes = legRouteRows ?? []

  return NextResponse.json(
    (packages ?? []).map((pkg) => {
      const pkgLegs = legs.filter((leg) => leg.package_id === pkg.id)
      const pkgRouteIds = new Set(
        pkgLegs.flatMap((leg) => {
          const supplierRoutes = routes.filter((route) => route.supplier_id === leg.supplier_id)
          const linkedRouteIds = legRoutes
            .filter((link) => link.package_leg_id === leg.id)
            .map((link) => link.route_id)
          if (leg.supplierKind === "hotel_property" && linkedRouteIds.length === 0) {
            return supplierRoutes.map((route) => route.id)
          }
          return linkedRouteIds
        }),
      )
      const prices = rateCards
        .filter((rc) => pkgRouteIds.has(rc.route_id))
        .map((rc) => rc.price_per_person)
      const trainLeg = pkgLegs.find((leg) => leg.supplierKind === "train_operator")
      const trainRouteIds = new Set(
        trainLeg
          ? legRoutes
              .filter((link) => link.package_leg_id === trainLeg.id)
              .map((link) => link.route_id)
          : [],
      )
      const trainRoute = trainLeg
        ? routes.find((route) => trainRouteIds.has(route.id))
        : null
      return mapPackageListItem(pkg, pkgLegs, prices, trainRoute?.name ?? null)
    }),
  )
}

export async function POST(req: Request) {
  const auth = await requireAuthenticatedUser()
  if ("error" in auth) {
    return auth.error!
  }

  const { supabase, user } = auth
  if (!(await hasPackageWriteAccess(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let parsed
  try {
    parsed = createPackageSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  let slug: string
  try {
    slug = await resolveUniquePackageSlug(supabase, parsed.name)
  } catch {
    return NextResponse.json({ error: "Failed to create package" }, { status: 500 })
  }

  const { data: pkg, error: packageError } = await supabase
    .from("packages")
    .insert({
      name: parsed.name.trim(),
      slug,
      description: parsed.description?.trim() || null,
      duration_nights: parsed.durationNights ?? null,
      single_supplement_pct: parsed.singleSupplementPct,
      fixed_price_per_person: parsed.fixedPricePerPerson ?? null,
      currency: parsed.currency.trim().toUpperCase() || "ZAR",
      active: parsed.active,
    })
    .select("*")
    .single()

  if (packageError || !pkg) {
    return NextResponse.json({ error: "Failed to create package" }, { status: 500 })
  }

  const supplierKinds = await loadSupplierKinds(
    supabase,
    Array.from(new Set(parsed.legs.map((leg) => leg.supplierId))),
  )

  let children
  try {
    children = normalizePackageChildren(pkg.id, parsed, supplierKinds)
  } catch (error) {
    await supabase.from("packages").delete().eq("id", pkg.id)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid package structure" },
      { status: 400 },
    )
  }

  const { error: legsError } =
    children.legs.length > 0
      ? await supabase.from("package_legs").insert(children.legs)
      : { error: null }

  if (legsError) {
    await supabase.from("packages").delete().eq("id", pkg.id)
    return NextResponse.json({ error: "Failed to create package legs" }, { status: 500 })
  }

  const { error: routesError } =
    children.routes.length > 0
      ? await supabase.from("routes").insert(children.routes)
      : { error: null }

  if (routesError) {
    await supabase.from("packages").delete().eq("id", pkg.id)
    return NextResponse.json({ error: "Failed to create package routes" }, { status: 500 })
  }

  const { error: routeLinksError } =
    children.routeLinks.length > 0
      ? await supabase.from("package_leg_routes").insert(children.routeLinks)
      : { error: null }

  if (routeLinksError) {
    await supabase.from("packages").delete().eq("id", pkg.id)
    return NextResponse.json({ error: "Failed to create package route selections" }, { status: 500 })
  }

  const { error: rateCardsError } =
    children.rateCards.length > 0
      ? await supabase.from("rate_cards").insert(children.rateCards)
      : { error: null }

  if (rateCardsError) {
    await supabase.from("packages").delete().eq("id", pkg.id)
    return NextResponse.json({ error: "Failed to create package rates" }, { status: 500 })
  }

  const detail = await loadPackageDetail(supabase, slug)
  if ("error" in detail) {
    return detail.error!
  }

  return NextResponse.json(detail.detail, { status: 201 })
}
