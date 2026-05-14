"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumericInput } from "@/components/ui/numeric-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { PackageLegSelector, type SelectablePackageLeg } from "@/components/package-leg-selector"
import { parseStaleVersionConflictPayload } from "@/lib/supplier-save-guard"
import { useActiveSuppliers, useLocations } from "@/lib/use-data"
import { useRole } from "@/lib/role-context"
import type { PackageDetail, Supplier, SupplierDetail } from "@/lib/types"
import { CURRENCIES, SUPPLIER_KIND_LABELS, type SupplierKind } from "@/lib/types"

interface PackageDetailViewProps {
  packageDetail: PackageDetail
}

function buildLegState(packageDetail: PackageDetail): SelectablePackageLeg[] {
  return packageDetail.legs.map((leg) => ({
    id: leg.id,
    supplierId: leg.supplierId,
    supplierName: leg.supplierName,
    supplierKind: leg.supplierKind,
    label: leg.label ?? "",
    sortOrder: leg.sortOrder,
    routes: leg.routes.map((route) => ({ ...route, existing: true })),
    rateCards: leg.rateCards.map((rateCard) => ({ ...rateCard, existing: true })),
    suiteTypes: leg.suiteTypes,
    selectedRouteIds: leg.routes.map((route) => route.id),
  }))
}

async function loadSupplierContext(supplier: Supplier) {
  const response = await fetch(`/api/suppliers/${supplier.slug}`)
  if (!response.ok) {
    return { suiteTypes: [], routes: [], rateCards: [] }
  }
  const detail = (await response.json()) as SupplierDetail
  return {
    suiteTypes: detail.suiteTypes ?? [],
    routes: detail.routes ?? [],
    rateCards: detail.rateCards ?? [],
  }
}

export function PackageDetailView({ packageDetail }: PackageDetailViewProps) {
  const router = useRouter()
  const { role } = useRole()
  const { data: locations = [] } = useLocations()
  const { data: allSuppliers = [] } = useActiveSuppliers()

  const [name, setName] = useState(packageDetail.name)
  const [description, setDescription] = useState(packageDetail.description ?? "")
  const [durationNights, setDurationNights] = useState(packageDetail.durationNights)
  const [currency, setCurrency] = useState(packageDetail.currency)
  const [singleSupplementPct, setSingleSupplementPct] = useState(packageDetail.singleSupplementPct)
  const [markupPct, setMarkupPct] = useState(packageDetail.markupPct ?? 0)
  const [fixedPricePerPerson, setFixedPricePerPerson] = useState<number | null>(packageDetail.fixedPricePerPerson)
  const [active, setActive] = useState(packageDetail.active)
  const [legs, setLegs] = useState(() => buildLegState(packageDetail))
  const [hydratedSupplierIds, setHydratedSupplierIds] = useState<Set<string>>(new Set())
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  // Add leg state
  const [addLegKind, setAddLegKind] = useState<SupplierKind>("train_operator")
  const [addLegSupplierId, setAddLegSupplierId] = useState("")
  const [isAddingLeg, setIsAddingLeg] = useState(false)

  const filteredAddSuppliers = allSuppliers.filter((s) => s.kind === addLegKind)
  const selectedAddSupplier = allSuppliers.find((s) => s.id === addLegSupplierId)

  const supplierKinds = useMemo(
    () => Array.from(new Set(legs.map((leg) => leg.supplierKind))),
    [legs],
  )
  const canSeeMarkup = role === "admin"

  const markDirty = () => setIsDirty(true)

  useEffect(() => {
    setName(packageDetail.name)
    setDescription(packageDetail.description ?? "")
    setDurationNights(packageDetail.durationNights)
    setCurrency(packageDetail.currency)
    setSingleSupplementPct(packageDetail.singleSupplementPct)
    setMarkupPct(packageDetail.markupPct ?? 0)
    setFixedPricePerPerson(packageDetail.fixedPricePerPerson)
    setActive(packageDetail.active)
    setLegs(buildLegState(packageDetail))
    setHydratedSupplierIds(new Set())
    setIsDirty(false)
  }, [packageDetail])

  useEffect(() => {
    const suppliersToHydrate = legs
      .filter((leg) => !hydratedSupplierIds.has(leg.supplierId))
      .map((leg) => allSuppliers.find((supplier) => supplier.id === leg.supplierId))
      .filter((supplier): supplier is Supplier => Boolean(supplier))

    if (suppliersToHydrate.length === 0) return

    let cancelled = false

    Promise.all(
      suppliersToHydrate.map(async (supplier) => ({
        supplierId: supplier.id,
        context: await loadSupplierContext(supplier),
      })),
    ).then((results) => {
      if (cancelled) return

      const contextsBySupplierId = new Map(
        results.map(({ supplierId, context }) => [supplierId, context]),
      )

      setLegs((current) =>
        current.map((leg) => {
          const context = contextsBySupplierId.get(leg.supplierId)
          if (!context) return leg

          const selectedRouteIds = new Set(leg.selectedRouteIds)
          const routeIds = new Set(context.routes.map((route) => route.id))

          return {
            ...leg,
            routes: context.routes.map((route) => ({ ...route, existing: true })),
            rateCards: context.rateCards
              .filter((rateCard) => routeIds.has(rateCard.routeId))
              .map((rateCard) => ({ ...rateCard, existing: true })),
            suiteTypes: context.suiteTypes,
            selectedRouteIds: leg.selectedRouteIds.filter((routeId) => routeIds.has(routeId)),
          }
        }),
      )
      setHydratedSupplierIds((current) => {
        const next = new Set(current)
        results.forEach(({ supplierId }) => next.add(supplierId))
        return next
      })
    })

    return () => {
      cancelled = true
    }
  }, [allSuppliers, hydratedSupplierIds, legs])

  const buildPayload = () => ({
    name: name.trim(),
    description: description.trim() || null,
    durationNights,
    currency: currency.trim().toUpperCase() || "ZAR",
    singleSupplementPct,
    ...(canSeeMarkup ? { markupPct } : {}),
    fixedPricePerPerson,
    active,
    expectedUpdatedAt: packageDetail.updatedAt,
    legs: legs.map((leg, index) => ({
      id: leg.id,
      supplierId: leg.supplierId,
      label: leg.label.trim() || null,
      sortOrder: leg.sortOrder ?? index,
      routes:
        leg.supplierKind === "hotel_property"
          ? []
          : leg.routes
            .filter((route) => leg.selectedRouteIds.includes(route.id))
            .map((route) => ({
              id: route.id,
              name: route.name.trim(),
              originLocationId: route.originLocationId,
              destinationLocationId: route.destinationLocationId,
              pickupPoint: route.pickupPoint,
              dropoffPoint: route.dropoffPoint,
              vehicleRentalDetails: route.vehicleRentalDetails,
              active: route.active,
              existing: Boolean(route.existing),
            })),
      rateCards:
        leg.supplierKind === "hotel_property"
          ? []
          : leg.rateCards
            .filter((rateCard) => leg.selectedRouteIds.includes(rateCard.routeId))
            .map((rateCard) => ({
              id: rateCard.id,
              routeId: rateCard.routeId,
              suiteTypeId: rateCard.suiteTypeId,
              pricePerPerson: rateCard.pricePerPerson,
              childPrice: rateCard.childPrice,
              infantPrice: rateCard.infantPrice,
              currency: rateCard.currency.trim().toUpperCase() || currency.trim().toUpperCase() || "ZAR",
              validFrom: rateCard.validFrom,
              validTo: rateCard.validTo ?? "",
              existing: Boolean(rateCard.existing),
            })),
    })),
  })

  const save = async () => {
    if (!name.trim()) {
      toast.error("Package name is required")
      return
    }

    const legWithoutRoute = legs.find(
      (leg) =>
        leg.supplierKind !== "hotel_property" &&
        leg.supplierKind !== "transfers" &&
        leg.supplierKind !== "vehicle_rental" &&
        leg.selectedRouteIds.length === 0,
    )
    if (legWithoutRoute) {
      toast.error(`Select at least one route for ${legWithoutRoute.label || legWithoutRoute.supplierName}`)
      return
    }

    setIsSaving(true)
    try {
      const response = await fetch(`/api/packages/${packageDetail.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      })
      const payload = await response.json()

      if (!response.ok) {
        const staleConflict = parseStaleVersionConflictPayload(payload)
        if (response.status === 409 && staleConflict) {
          toast.error(staleConflict.error)
          return
        }
        toast.error(typeof payload?.error === "string" ? payload.error : "Failed to save package")
        return
      }

      toast.success("Package saved")
      setIsDirty(false)
      router.replace(`/app/packages/${payload.slug}`)
      router.refresh()
    } finally {
      setIsSaving(false)
    }
  }

  const deletePackage = async () => {
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/packages/${packageDetail.slug}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const payload = await response.json()
        toast.error(typeof payload?.error === "string" ? payload.error : "Failed to delete package")
        return
      }

      toast.success("Package deleted")
      router.push("/app/packages")
      router.refresh()
    } finally {
      setIsDeleting(false)
    }
  }

  const addLeg = async () => {
    if (!selectedAddSupplier) return
    setIsAddingLeg(true)
    try {
      const { suiteTypes, routes, rateCards } = await loadSupplierContext(selectedAddSupplier)
      const supplierRouteIds = new Set(routes.map((route) => route.id))
      setLegs((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          supplierId: selectedAddSupplier.id,
          supplierName: selectedAddSupplier.name,
          supplierKind: selectedAddSupplier.kind,
          label: selectedAddSupplier.name,
          sortOrder: current.length,
          routes: routes.map((route) => ({ ...route, existing: true })),
          rateCards: rateCards
            .filter((rateCard) => supplierRouteIds.has(rateCard.routeId))
            .map((rateCard) => ({ ...rateCard, existing: true })),
          suiteTypes,
          selectedRouteIds: [],
        },
      ])
      setAddLegSupplierId("")
      markDirty()
    } finally {
      setIsAddingLeg(false)
    }
  }

  return (
    <div className="max-w-5xl space-y-6 p-6 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{packageDetail.name}</h1>
          <div className="flex flex-wrap gap-2">
            <Badge variant={active ? "default" : "outline"}>{active ? "Active" : "Inactive"}</Badge>
            {isDirty ? (
              <Badge variant="outline" className="border-amber-400 text-amber-600">
                Unsaved changes
              </Badge>
            ) : null}
            {supplierKinds.map((kind) => (
              <Badge key={kind} variant="secondary">
                {SUPPLIER_KIND_LABELS[kind]}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={save} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Saving..." : "Save"}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" disabled={isDeleting}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete package?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the package, legs, routes, and rate cards.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={deletePackage}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Package metadata</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(event) => { setName(event.target.value); markDirty() }}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(event) => { setDescription(event.target.value); markDirty() }}
            />
          </div>
          <div className="space-y-2">
            <Label>Duration nights</Label>
            <NumericInput
              nullable
              min="0"
              step="1"
              value={durationNights}
              onValueChange={(value) => { setDurationNights(value); markDirty() }}
            />
          </div>
          <div className="space-y-2">
            <Label>Currency</Label>
            <Select value={currency} onValueChange={(value) => { setCurrency(value); markDirty() }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Single supplement %</Label>
            <NumericInput
              min="0"
              step="0.01"
              value={singleSupplementPct}
              onValueChange={(value) => { setSingleSupplementPct(value ?? 0); markDirty() }}
            />
          </div>
          {canSeeMarkup ? (
            <div className="space-y-2">
              <Label>Package markup %</Label>
              <NumericInput
                min="0"
                step="0.01"
                value={markupPct}
                onValueChange={(value) => { setMarkupPct(value ?? 0); markDirty() }}
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>Fixed price per person (optional)</Label>
            <NumericInput
              min="0"
              step="0.01"
              nullable
              value={fixedPricePerPerson}
              onValueChange={(value) => { setFixedPricePerPerson(value); markDirty() }}
            />
            <p className="text-xs text-muted-foreground">
              Overrides rate card calculation when applying to a job. Leave blank to use rate cards.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="pkg-active"
              checked={active}
              onCheckedChange={(checked) => { setActive(checked); markDirty() }}
            />
            <Label htmlFor="pkg-active" className="font-normal text-muted-foreground">Active</Label>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Legs</h2>
          <p className="text-sm text-muted-foreground">
            Select existing supplier routes and services for each package leg. Maintain supplier routes,
            services, and rate cards on the supplier page.
          </p>
        </div>
        {legs.map((leg, index) => (
          <PackageLegSelector
            key={leg.id}
            leg={leg}
            locations={locations}
            selectedRouteIds={leg.selectedRouteIds}
            onChange={(nextLeg) => {
              setLegs((current) =>
                current.map((item, itemIndex) => (itemIndex === index ? nextLeg : item)),
              )
              markDirty()
            }}
            onToggleRoute={(routeId) => {
              setLegs((current) =>
                current.map((item, itemIndex) => {
                  if (itemIndex !== index) return item
                  const selectedRouteIds = new Set(item.selectedRouteIds)
                  if (selectedRouteIds.has(routeId)) {
                    selectedRouteIds.delete(routeId)
                  } else {
                    selectedRouteIds.add(routeId)
                  }
                  return { ...item, selectedRouteIds: Array.from(selectedRouteIds) }
                }),
              )
              markDirty()
            }}
            onRemove={() => {
              setLegs((current) => current.filter((_leg, itemIndex) => itemIndex !== index))
              markDirty()
            }}
          />
        ))}
        {legs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            No supplier legs have been added to this package.
          </div>
        ) : null}

        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Add leg</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-[12rem_1fr_auto]">
              <Select value={addLegKind} onValueChange={(value) => { setAddLegKind(value as SupplierKind); setAddLegSupplierId("") }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SUPPLIER_KIND_LABELS).map(([kind, label]) => (
                    <SelectItem key={kind} value={kind}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={addLegSupplierId || undefined} onValueChange={setAddLegSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {filteredAddSuppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                disabled={!addLegSupplierId || isAddingLeg}
                onClick={addLeg}
              >
                <Plus className="mr-2 h-4 w-4" />
                {isAddingLeg ? "Adding..." : "Add leg"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {isDirty ? (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">You have unsaved changes.</p>
            <Button type="button" onClick={save} disabled={isSaving}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
