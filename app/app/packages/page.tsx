import Link from "next/link"
import { Boxes, ChevronRight, MapPin, Tag } from "lucide-react"
import { PackageWizard } from "@/components/package-wizard"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createSessionClient } from "@/lib/supabase/server"
import { mapPackageListItem, type PackageLegWithSupplier } from "@/lib/packages"
import { SUPPLIER_KIND_LABELS } from "@/lib/types"
import { formatCurrency } from "@/lib/utils"

function formatPrice(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${formatCurrency(amount)}`
  }
}

export default async function PackagesPage() {
  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const [
    { data: packages },
    { data: legRows },
    { data: legRouteRows },
    { data: routeRows },
    { data: rateCardRows },
  ] = await Promise.all([
    supabase
      .from("packages")
      .select("*")
      .is("booking_id", null)
      .order("name", { ascending: true }),
    supabase
      .from("package_legs")
      .select("*, suppliers(name, description, kind)")
      .order("sort_order", { ascending: true }),
    supabase
      .from("package_leg_routes")
      .select("package_leg_id, route_id"),
    supabase
      .from("routes")
      .select("id, supplier_id, name"),
    supabase
      .from("rate_cards")
      .select("route_id, price_per_person"),
  ])

  const legs = ((legRows ?? []) as Array<
    Omit<PackageLegWithSupplier, "supplierName" | "supplierKind"> & {
      suppliers: {
        name: string
        description: string | null
        kind: PackageLegWithSupplier["supplierKind"]
      } | null
    }
  >).map((leg) => ({
    id: leg.id,
    package_id: leg.package_id,
    supplier_id: leg.supplier_id,
    label: leg.label,
    sort_order: leg.sort_order,
    date_anchor: leg.date_anchor,
    created_at: leg.created_at,
    supplierName: leg.suppliers?.name ?? "Unknown supplier",
    supplierDescription: leg.suppliers?.description ?? null,
    supplierKind: leg.suppliers?.kind ?? "train_operator",
  }))

  const routes = routeRows ?? []
  const rateCards = rateCardRows ?? []
  const legRoutes = legRouteRows ?? []

  const list = (packages ?? []).map((pkg) => {
    const pkgLegs = legs.filter((leg) => leg.package_id === pkg.id)
    const pkgRouteIds = new Set(
      pkgLegs.flatMap((leg) => {
        const supplierRoutes = routes.filter((route) => route.supplier_id === leg.supplier_id)
        if (leg.supplierKind === "hotel_property") {
          return supplierRoutes.map((route) => route.id)
        }
        return legRoutes
          .filter((link) => link.package_leg_id === leg.id)
          .map((link) => link.route_id)
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
  })

  return (
    <div className="max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Packages</h1>
          <p className="mt-2 text-base text-muted-foreground">
            Build multi-supplier itineraries with train, transfer, hotel, tour, and airline legs.
          </p>
        </div>
        <PackageWizard />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {list.map((pkg) => (
          <Link key={pkg.id} href={`/app/packages/${pkg.slug}`}>
            <Card className="h-full border-2 transition-colors hover:border-primary/40 hover:bg-secondary/20">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Boxes className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base font-semibold">{pkg.name}</CardTitle>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant={pkg.active ? "default" : "outline"}>
                          {pkg.active ? "Active" : "Inactive"}
                        </Badge>
                        <Badge variant="secondary">
                          {pkg.legCount} leg{pkg.legCount === 1 ? "" : "s"}
                        </Badge>
                        {pkg.durationNights !== null ? (
                          <Badge variant="outline">{pkg.durationNights} nights</Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {pkg.description ? (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{pkg.description}</p>
                ) : null}

                {pkg.trainRouteName ? (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span>{pkg.trainRouteName}</span>
                  </div>
                ) : null}

                {pkg.fixedPricePerPerson !== null ? (
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span>{formatPrice(pkg.fixedPricePerPerson, pkg.currency)} pp (fixed)</span>
                  </div>
                ) : pkg.priceTo !== null ? (
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span>
                      {pkg.priceFrom !== null
                        ? `${formatPrice(pkg.priceFrom, pkg.currency)} – ${formatPrice(pkg.priceTo, pkg.currency)} pp`
                        : `${formatPrice(pkg.priceTo, pkg.currency)} pp`}
                    </span>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {pkg.supplierKinds.map((kind) => (
                    <Badge key={kind} variant="secondary">
                      {SUPPLIER_KIND_LABELS[kind]}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {list.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <Boxes className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-3 text-base font-medium">No packages yet</p>
            <p className="mb-6 text-sm text-muted-foreground">
              Create a package to combine legs from multiple suppliers.
            </p>
            <PackageWizard />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
