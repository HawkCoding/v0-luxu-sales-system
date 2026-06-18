"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { NumericInput } from "@/components/ui/numeric-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { NewSupplierQuickDialog, type QuickSupplierResult } from "@/components/new-supplier-quick-dialog"
import { useActiveSuppliers, useLocations } from "@/lib/use-data"
import {
  getDestinationNames,
  supplierMatchesDestination,
} from "@/lib/packages/location-filter"
import type { Location, SupplierDetail, SupplierKind, SupplierRoute, SupplierSuiteType } from "@/lib/types"
import { SUPPLIER_KIND_LABELS } from "@/lib/types"

export interface QuoteExtraSelection {
  supplierId: string
  supplierName: string
  supplierKind: SupplierKind
  routeId: string
  routeName: string
  suiteTypeId: string
  suiteTypeName: string
  quantity?: number
}

interface QuoteLineSupplierPickerProps {
  /** Destination location IDs (e.g. from the package's train route) to soft-filter suppliers. */
  destinationLocationIds?: string[]
  /** The supplier categories offered. Defaults to the add-on kinds. */
  kinds?: SupplierKind[]
  onAdd: (selection: QuoteExtraSelection) => void
  addLabel?: string
  busy?: boolean
}

const compactSelectTriggerClass = "w-full min-w-0 [&_[data-slot=select-value]]:truncate"

const DEFAULT_KINDS: SupplierKind[] = [
  "hotel_property",
  "transfers",
  "vehicle_rental",
  "tour_operator",
  "train_operator",
  "airline",
]

function routeLabelFor(kind: SupplierKind): string {
  if (kind === "hotel_property") return "Meal plan"
  if (kind === "transfers") return "Transfer"
  if (kind === "vehicle_rental") return "Rental route"
  return "Route"
}

function suiteLabelFor(kind: SupplierKind): string {
  if (kind === "hotel_property") return "Room type"
  if (kind === "transfers" || kind === "vehicle_rental") return "Vehicle type"
  if (kind === "airline") return "Cabin"
  return "Type"
}

function quantityLabelFor(kind: SupplierKind): string | null {
  if (kind === "hotel_property") return "Nights"
  if (kind === "vehicle_rental") return "Days"
  return null
}

function describeLocation(locations: Location[], route: SupplierRoute): string | null {
  if (route.pickupPoint || route.dropoffPoint) {
    return `${route.pickupPoint ?? "Pickup"} → ${route.dropoffPoint ?? "Drop-off"}`
  }
  const byId = new Map(locations.map((l) => [l.id, l.name]))
  const origin = route.originLocationId ? byId.get(route.originLocationId) : null
  const destination = route.destinationLocationId ? byId.get(route.destinationLocationId) : null
  if (!origin && !destination) return null
  return `${origin ?? "?"} → ${destination ?? "?"}`
}

export function QuoteLineSupplierPicker({
  destinationLocationIds = [],
  kinds = DEFAULT_KINDS,
  onAdd,
  addLabel = "Add extra",
  busy = false,
}: QuoteLineSupplierPickerProps) {
  const { data: suppliers = [] } = useActiveSuppliers()
  const { data: locations = [] } = useLocations()

  const [kind, setKind] = useState<SupplierKind>(kinds[0] ?? "hotel_property")
  const [supplierId, setSupplierId] = useState("")
  const [showAll, setShowAll] = useState(false)
  const [detail, setDetail] = useState<SupplierDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [routeId, setRouteId] = useState("")
  const [suiteTypeId, setSuiteTypeId] = useState("")
  const [quantity, setQuantity] = useState<number | null>(null)
  const [quickOpen, setQuickOpen] = useState(false)

  const scopeByDestination = kind !== "train_operator" && destinationLocationIds.length > 0 && !showAll
  const destinationNames = getDestinationNames(destinationLocationIds, locations)

  const kindSuppliers = suppliers
    .filter((supplier) => supplier.kind === kind)
    .filter(
      (supplier) =>
        !scopeByDestination || supplierMatchesDestination(supplier, destinationLocationIds, locations),
    )

  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId)

  // Load the chosen supplier's routes + types.
  useEffect(() => {
    let cancelled = false
    if (!selectedSupplier) {
      setDetail(null)
      return
    }
    setLoadingDetail(true)
    fetch(`/api/suppliers/${selectedSupplier.slug}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SupplierDetail | null) => {
        if (cancelled) return
        setDetail(data && !("error" in data) ? data : null)
        setRouteId("")
        setSuiteTypeId("")
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedSupplier])

  const routes: SupplierRoute[] = (detail?.routes ?? []).filter((route) => route.active)
  const suiteTypes: SupplierSuiteType[] = (detail?.suiteTypes ?? []).filter((suiteType) => suiteType.active)

  const canAdd = Boolean(supplierId && routeId && suiteTypeId)
  const quantityLabel = quantityLabelFor(kind)

  function handleAdd() {
    if (!selectedSupplier || !canAdd) return
    const route = routes.find((r) => r.id === routeId)
    const suiteType = suiteTypes.find((s) => s.id === suiteTypeId)
    if (!route || !suiteType) return
    onAdd({
      supplierId: selectedSupplier.id,
      supplierName: selectedSupplier.name,
      supplierKind: selectedSupplier.kind,
      routeId,
      routeName: route.name,
      suiteTypeId,
      suiteTypeName: suiteType.name,
      quantity: quantityLabel && quantity ? quantity : undefined,
    })
    // Reset selection for the next add.
    setSupplierId("")
    setDetail(null)
    setRouteId("")
    setSuiteTypeId("")
    setQuantity(null)
  }

  function handleQuickCreated(result: QuickSupplierResult) {
    setKind(result.supplierKind)
    setSupplierId(result.supplierId)
    // The detail load effect will fetch routes/types; pre-set the new ones so they apply once loaded.
    setRouteId(result.routeId)
    setSuiteTypeId(result.suiteTypeId)
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5 min-w-0">
          <Label>Category</Label>
          <Select
            value={kind}
            onValueChange={(value) => {
              setKind(value as SupplierKind)
              setSupplierId("")
              setDetail(null)
            }}
          >
            <SelectTrigger className={compactSelectTriggerClass} title={SUPPLIER_KIND_LABELS[kind]}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {kinds.map((option) => (
                <SelectItem key={option} value={option}>
                  {SUPPLIER_KIND_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 min-w-0">
          <Label>Supplier</Label>
          <Select value={supplierId || undefined} onValueChange={setSupplierId}>
            <SelectTrigger
              className={compactSelectTriggerClass}
              title={kindSuppliers.find((supplier) => supplier.id === supplierId)?.name}
            >
              <SelectValue placeholder="Select supplier" />
            </SelectTrigger>
            <SelectContent>
              {kindSuppliers.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No suppliers found</div>
              ) : (
                kindSuppliers.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    <span className="flex items-center gap-1.5">
                      {supplier.name}
                      {supplier.status === "temporary" && (
                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-400 py-0">
                          Temporary
                        </Badge>
                      )}
                    </span>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {kind !== "train_operator" && destinationLocationIds.length > 0 ? (
          <span>
            {scopeByDestination
              ? `In ${destinationNames.join(", ") || "destination"}.`
              : "Showing all."}{" "}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => setShowAll((current) => !current)}
            >
              {scopeByDestination ? "Show all" : `Show only ${destinationNames.join(", ") || "destination"}`}
            </button>
          </span>
        ) : null}
        <button
          type="button"
          className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
          onClick={() => setQuickOpen(true)}
        >
          <Plus className="h-3 w-3" /> New supplier
        </button>
      </div>

      {selectedSupplier?.status === "temporary" && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>This is a temporary supplier pending manager activation. It will still be added to the quote.</span>
        </div>
      )}

      {selectedSupplier ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5 min-w-0">
            <Label>{routeLabelFor(kind)}</Label>
            <Select value={routeId || undefined} onValueChange={setRouteId} disabled={loadingDetail}>
              <SelectTrigger
                className={compactSelectTriggerClass}
                title={routes.find((route) => route.id === routeId)?.name}
              >
                <SelectValue placeholder={loadingDetail ? "Loading…" : `Select ${routeLabelFor(kind).toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {routes.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">No routes configured</div>
                ) : (
                  routes.map((route) => {
                    const location = describeLocation(locations, route)
                    return (
                      <SelectItem key={route.id} value={route.id}>
                        {route.name}
                        {location ? ` · ${location}` : ""}
                      </SelectItem>
                    )
                  })
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 min-w-0">
            <Label>{suiteLabelFor(kind)}</Label>
            <Select value={suiteTypeId || undefined} onValueChange={setSuiteTypeId} disabled={loadingDetail}>
              <SelectTrigger
                className={compactSelectTriggerClass}
                title={suiteTypes.find((suiteType) => suiteType.id === suiteTypeId)?.name}
              >
                <SelectValue placeholder={`Select ${suiteLabelFor(kind).toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {suiteTypes.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">No types configured</div>
                ) : (
                  suiteTypes.map((suiteType) => (
                    <SelectItem key={suiteType.id} value={suiteType.id}>
                      {suiteType.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          {quantityLabel ? (
            <div className="space-y-1.5">
              <Label>{quantityLabel}</Label>
              <NumericInput min="1" step="1" nullable value={quantity} onValueChange={setQuantity} placeholder="1" />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={handleAdd} disabled={!canAdd || busy}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {addLabel}
        </Button>
      </div>

      <NewSupplierQuickDialog
        open={quickOpen}
        onOpenChange={setQuickOpen}
        defaultKind={kind}
        locations={locations}
        onCreated={handleQuickCreated}
      />
    </div>
  )
}
