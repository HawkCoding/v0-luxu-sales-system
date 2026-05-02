"use client"

import { useReducer, useState } from "react"
import { Boxes, Plus } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { PackageLegSelector } from "@/components/package-leg-selector"
import type { SelectablePackageLeg } from "@/components/package-leg-selector"
import type { EditableSupplierRateCard } from "@/components/package-leg-editor"
import {
  formatMoney,
  formatRange,
  getCurrencyRanges,
  getPackageCurrencyRanges,
  getSelectedRateCards,
} from "@/components/package-wizard-pricing"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useActiveSuppliers, useLocations } from "@/lib/use-data"
import type { Location, Supplier, SupplierDetail, SupplierRateCard, SupplierRoute, SupplierSuiteType } from "@/lib/types"
import { CURRENCIES, SUPPLIER_KIND_LABELS, getSupplierVocabulary, type SupplierKind } from "@/lib/types"

type PackageWizardLeg = SelectablePackageLeg

interface WizardState {
  name: string
  description: string
  durationNights: number | null
  currency: string
  singleSupplementPct: number
  fixedPricePerPerson: number | null
  active: boolean
  legs: PackageWizardLeg[]
}

type WizardAction =
  | { type: "field"; field: keyof Omit<WizardState, "legs">; value: string | number | boolean | null }
  | { type: "addLeg"; leg: PackageWizardLeg }
  | { type: "updateLeg"; index: number; leg: PackageWizardLeg }
  | { type: "toggleRoute"; legIndex: number; routeId: string }
  | { type: "removeLeg"; index: number }
  | { type: "reset" }

const initialState: WizardState = {
  name: "",
  description: "",
  durationNights: null,
  currency: "ZAR",
  singleSupplementPct: 50,
  fixedPricePerPerson: null,
  active: true,
  legs: [],
}

function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "field":
      return { ...state, [action.field]: action.value }
    case "addLeg":
      return { ...state, legs: [...state.legs, action.leg] }
    case "updateLeg":
      return {
        ...state,
        legs: state.legs.map((leg, index) => (index === action.index ? action.leg : leg)),
      }
    case "toggleRoute":
      return {
        ...state,
        legs: state.legs.map((leg, index) => {
          if (index !== action.legIndex) {
            return leg
          }

          const routeIds = new Set(leg.selectedRouteIds)
          if (routeIds.has(action.routeId)) {
            routeIds.delete(action.routeId)
          } else {
            routeIds.add(action.routeId)
          }

          return { ...leg, selectedRouteIds: Array.from(routeIds) }
        }),
      }
    case "removeLeg":
      return { ...state, legs: state.legs.filter((_leg, index) => index !== action.index) }
    case "reset":
      return initialState
    default:
      return state
  }
}

function payloadFromState(state: WizardState) {
  return {
    name: state.name.trim(),
    description: state.description.trim() || null,
    durationNights: state.durationNights,
    currency: state.currency.trim().toUpperCase() || "ZAR",
    singleSupplementPct: state.singleSupplementPct,
    fixedPricePerPerson: state.fixedPricePerPerson,
    active: state.active,
    legs: state.legs.map((leg, index) => {
      const selectedRouteIds = new Set(leg.selectedRouteIds)
      return {
        id: leg.id,
        supplierId: leg.supplierId,
        label: leg.label.trim() || null,
        sortOrder: leg.sortOrder ?? index,
        routes:
          leg.supplierKind === "hotel_property"
            ? []
            : leg.routes.filter((route) => selectedRouteIds.has(route.id)).map((route) => ({
                id: route.id,
                name: route.name.trim(),
                originLocationId: route.originLocationId,
                destinationLocationId: route.destinationLocationId,
                active: route.active,
                existing: Boolean(route.existing),
              })),
        rateCards:
          leg.supplierKind === "hotel_property"
            ? []
            : leg.rateCards
                .filter((rateCard) => selectedRouteIds.has(rateCard.routeId))
                .map((rateCard) => ({
                  id: rateCard.id,
                  routeId: rateCard.routeId,
                  suiteTypeId: rateCard.suiteTypeId,
                  pricePerPerson: rateCard.pricePerPerson,
                  childPrice: rateCard.childPrice,
                  infantPrice: rateCard.infantPrice,
                  currency: rateCard.currency.trim().toUpperCase() || state.currency.trim().toUpperCase() || "ZAR",
                  validFrom: rateCard.validFrom,
                  validTo: rateCard.validTo ?? "",
                  existing: Boolean(rateCard.existing),
                })),
      }
    }),
  }
}

interface SupplierContext {
  suiteTypes: SupplierSuiteType[]
  routes: SupplierRoute[]
  rateCards: SupplierRateCard[]
}

async function loadSupplierContext(supplier: Supplier): Promise<SupplierContext> {
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

function selectedRouteCount(legs: PackageWizardLeg[]): number {
  return legs.reduce(
    (total, leg) => total + (leg.supplierKind === "hotel_property" ? 0 : leg.selectedRouteIds.length),
    0,
  )
}

function getSelectedRoutes(leg: PackageWizardLeg): SupplierRoute[] {
  const selectedRouteIds = new Set(leg.selectedRouteIds)
  return leg.routes.filter((route) => selectedRouteIds.has(route.id))
}

function getRouteRateCards(
  leg: PackageWizardLeg,
  routeId: string,
): EditableSupplierRateCard[] {
  return leg.rateCards.filter((rateCard) => rateCard.routeId === routeId)
}

function formatDateRange(validFrom: string, validTo: string | null): string {
  return validTo ? `${validFrom} - ${validTo}` : `from ${validFrom}`
}

function routeLocationLabel(route: SupplierRoute, locations: Location[]): string | null {
  if (route.pickupPoint || route.dropoffPoint) {
    return `${route.pickupPoint || "Pickup"} -> ${route.dropoffPoint || "Drop-off"}`
  }
  const locationsById = new Map(locations.map((location) => [location.id, location.name]))
  const origin = route.originLocationId ? locationsById.get(route.originLocationId) : null
  const destination = route.destinationLocationId ? locationsById.get(route.destinationLocationId) : null

  if (!origin && !destination) {
    return null
  }

  return `${origin ?? "Unknown"} -> ${destination ?? "Unknown"}`
}

export function PackageWizard() {
  const router = useRouter()
  const { data: suppliers = [] } = useActiveSuppliers()
  const { data: locations = [] } = useLocations()
  const [state, dispatch] = useReducer(reducer, initialState)
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(1)
  const [supplierKind, setSupplierKind] = useState<SupplierKind>("train_operator")
  const [selectedSupplierId, setSelectedSupplierId] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const filteredSuppliers = suppliers.filter((supplier) => supplier.kind === supplierKind)
  const selectedSupplier = suppliers.find((supplier) => supplier.id === selectedSupplierId)
  const hasAnySelection =
    state.legs.length > 0 && state.legs.every((leg) => leg.selectedRouteIds.length > 0)
  const isNextDisabled =
    step === 5 ||
    (step === 2 && state.legs.length === 0) ||
    (step === 3 && !hasAnySelection)

  const addSelectedSupplier = async () => {
    if (!selectedSupplier) return
    const { suiteTypes, routes, rateCards } = await loadSupplierContext(selectedSupplier)
    const supplierRouteIds = new Set(routes.map((route) => route.id))
    dispatch({
      type: "addLeg",
      leg: {
        id: crypto.randomUUID(),
        supplierId: selectedSupplier.id,
        supplierName: selectedSupplier.name,
        supplierKind: selectedSupplier.kind,
        label: selectedSupplier.name,
        sortOrder: state.legs.length,
        routes: routes.map((route) => ({ ...route, existing: true })),
        rateCards: rateCards
          .filter((rateCard) => supplierRouteIds.has(rateCard.routeId))
          .map((rateCard) => ({ ...rateCard, existing: true })),
        suiteTypes,
        selectedRouteIds: [],
      },
    })
    setSelectedSupplierId("")
  }

  const savePackage = async () => {
    if (!state.name.trim()) {
      toast.error("Package name is required")
      return
    }
    const legWithoutSelection = state.legs.find((leg) => leg.selectedRouteIds.length === 0)
    if (legWithoutSelection) {
      const vocab = getSupplierVocabulary(legWithoutSelection.supplierKind)
      toast.error(`Each leg needs at least one selected ${vocab.route.toLowerCase()}`)
      return
    }

    setIsSaving(true)
    try {
      const response = await fetch("/api/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadFromState(state)),
      })
      const payload = await response.json()
      if (!response.ok) {
        toast.error(typeof payload?.error === "string" ? payload.error : "Failed to create package")
        return
      }

      toast.success("Package created")
      dispatch({ type: "reset" })
      setOpen(false)
      router.push(`/app/packages/${payload.slug}`)
      router.refresh()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Package
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-5xl">
        <SheetHeader>
          <SheetTitle>New package</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="flex flex-wrap gap-2">
            {["Details", "Add Legs", "Routes & Rates", "Review", "Save"].map((label, index) => (
              <Button
                key={label}
                type="button"
                size="sm"
                variant={step === index + 1 ? "default" : "outline"}
                onClick={() => setStep(index + 1)}
              >
                {index + 1}. {label}
              </Button>
            ))}
          </div>

          {step === 1 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Details</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label>Name</Label>
                  <Input
                    value={state.name}
                    onChange={(event) =>
                      dispatch({ type: "field", field: "name", value: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Description</Label>
                  <Textarea
                    value={state.description}
                    onChange={(event) =>
                      dispatch({ type: "field", field: "description", value: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Duration nights</Label>
                  <NumericInput
                    min="0"
                    step="1"
                    nullable
                    value={state.durationNights}
                    onValueChange={(value) =>
                      dispatch({ type: "field", field: "durationNights", value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select
                    value={state.currency}
                    onValueChange={(value) => dispatch({ type: "field", field: "currency", value })}
                  >
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
                    value={state.singleSupplementPct}
                    onValueChange={(value) =>
                      dispatch({ type: "field", field: "singleSupplementPct", value: value ?? 0 })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fixed price per person (optional)</Label>
                  <NumericInput
                    min="0"
                    step="0.01"
                    nullable
                    value={state.fixedPricePerPerson}
                    onValueChange={(value) =>
                      dispatch({ type: "field", field: "fixedPricePerPerson", value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Overrides rate card calculation when applying to a job. Leave blank to use rate cards.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {step === 2 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Add legs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-[12rem_1fr_auto]">
                  <Select value={supplierKind} onValueChange={(value) => setSupplierKind(value as SupplierKind)}>
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
                  <Select value={selectedSupplierId || undefined} onValueChange={setSelectedSupplierId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredSuppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" onClick={addSelectedSupplier} disabled={!selectedSupplierId}>
                    Add leg
                  </Button>
                </div>
                <div className="space-y-2">
                  {state.legs.map((leg, index) => (
                    <div key={leg.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex items-center gap-2">
                        <Boxes className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{leg.label || leg.supplierName}</span>
                        <Badge variant="secondary">{SUPPLIER_KIND_LABELS[leg.supplierKind]}</Badge>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => dispatch({ type: "removeLeg", index })}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              {state.legs.map((leg, index) => (
                <PackageLegSelector
                  key={leg.id}
                  leg={leg}
                  locations={locations}
                  selectedRouteIds={leg.selectedRouteIds}
                  onChange={(nextLeg) =>
                    dispatch({
                      type: "updateLeg",
                      index,
                      leg: nextLeg,
                    })
                  }
                  onToggleRoute={(routeId) => dispatch({ type: "toggleRoute", legIndex: index, routeId })}
                  onRemove={() => dispatch({ type: "removeLeg", index })}
                />
              ))}
            </div>
          ) : null}

          {step === 4 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Review</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="font-medium">{state.name || "Unnamed package"}</p>
                  <p className="text-sm text-muted-foreground">
                    {state.legs.length} supplier legs, {selectedRouteCount(state.legs)} selected routes
                  </p>
                </div>
                {(() => {
                  const packageCurrency = state.currency.trim().toUpperCase() || "ZAR"
                  const selectedRates = state.legs.flatMap((leg) => getSelectedRateCards(leg))
                  const selectedCurrencies = new Set(
                    selectedRates.map(
                      (rate) => rate.currency.trim().toUpperCase() || packageCurrency,
                    ),
                  )
                  const hasCurrencyMismatch =
                    Array.from(selectedCurrencies).some((currency) => currency !== packageCurrency)

                  return hasCurrencyMismatch ? (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                      Some selected rates use different currencies than the package default ({packageCurrency}).
                      They will be saved as-is and are not converted.
                    </div>
                  ) : null
                })()}
                {state.legs.map((leg) => {
                  const packageCurrency = state.currency.trim().toUpperCase() || "ZAR"
                  const vocab = getSupplierVocabulary(leg.supplierKind)
                  const selectedRoutes = getSelectedRoutes(leg)
                  const selectedRateCards = getSelectedRateCards(leg)
                  const legRanges = getCurrencyRanges(selectedRateCards, packageCurrency)
                  const isHotel = leg.supplierKind === "hotel_property"

                  return (
                    <div key={leg.id} className="space-y-3 rounded-lg border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{leg.label || leg.supplierName}</p>
                        <Badge variant="secondary">{SUPPLIER_KIND_LABELS[leg.supplierKind]}</Badge>
                      </div>
                      {isHotel ? (
                        <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                          Included as a hotel option. Room type and meal plan will be chosen when applying the package.
                        </div>
                      ) : selectedRoutes.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                          Select a {vocab.route.toLowerCase()} to include this leg in the price range.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {selectedRoutes.map((route) => {
                            const routeRateCards = getRouteRateCards(leg, route.id)
                            const routeRanges = getCurrencyRanges(routeRateCards, packageCurrency)
                            const locationLabel = routeLocationLabel(route, locations)

                            return (
                              <div key={route.id} className="space-y-3 rounded-lg border bg-muted/20 p-3">
                                <div>
                                  <p className="font-medium">
                                    {route.name || `Unnamed ${vocab.route.toLowerCase()}`}
                                  </p>
                                  {vocab.routeHasLocations && locationLabel ? (
                                    <p className="text-xs text-muted-foreground">{locationLabel}</p>
                                  ) : null}
                                </div>
                                {routeRateCards.length > 0 ? (
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>{vocab.suiteType}</TableHead>
                                        <TableHead>Validity</TableHead>
                                        <TableHead className="text-right">Price pp</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {routeRateCards.map((rateCard) => {
                                        const suiteType = leg.suiteTypes.find(
                                          (suite) => suite.id === rateCard.suiteTypeId,
                                        )
                                        const currency =
                                          rateCard.currency.trim().toUpperCase() || packageCurrency

                                        return (
                                          <TableRow key={rateCard.id}>
                                            <TableCell>{suiteType?.name ?? "Unknown"}</TableCell>
                                            <TableCell className="text-muted-foreground">
                                              {formatDateRange(rateCard.validFrom, rateCard.validTo)}
                                            </TableCell>
                                            <TableCell className="text-right font-medium">
                                              {formatMoney(currency, rateCard.pricePerPerson)}
                                            </TableCell>
                                          </TableRow>
                                        )
                                      })}
                                    </TableBody>
                                  </Table>
                                ) : (
                                  <p className="text-xs text-muted-foreground">
                                    No rate cards found for this {vocab.route.toLowerCase()}.
                                  </p>
                                )}
                                {routeRanges.length > 0 ? (
                                  <p className="text-xs font-medium">
                                    Range: {routeRanges.map((range) => formatRange(range)).join("; ")} pp
                                  </p>
                                ) : null}
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {legRanges.length > 0 ? (
                        <p className="text-sm font-medium">
                          Leg range: {legRanges.map((range) => formatRange(range)).join("; ")} pp
                        </p>
                      ) : null}
                    </div>
                  )
                })}
                {(() => {
                  const packageCurrency = state.currency.trim().toUpperCase() || "ZAR"
                  const packageRanges = getPackageCurrencyRanges(state.legs, packageCurrency)
                  const singleMultiplier = 1 + state.singleSupplementPct / 100
                  const pct = state.singleSupplementPct
                  const pctLabel = Number.isInteger(pct) ? pct.toString() : pct.toFixed(2)

                  return (
                    <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
                      <div>
                        <p className="font-semibold">Indicative per-person range</p>
                        <p className="text-xs text-muted-foreground">
                          Actual quote price depends on travel dates and pax at quote time.
                        </p>
                      </div>
                      {packageRanges.length > 0 ? (
                        <div className="space-y-1 text-sm">
                          {packageRanges.map((range) => (
                            <p key={range.currency} className="font-medium">
                              {range.min === range.max
                                ? `${formatMoney(range.currency, range.min)} per person`
                                : `From ${formatMoney(range.currency, range.min)} to ${formatMoney(
                                    range.currency,
                                    range.max,
                                  )} per person`}
                            </p>
                          ))}
                          <p className="text-muted-foreground">
                            Single supplement: +{pctLabel}%
                          </p>
                          {packageRanges.map((range) => {
                            const singleMin = range.min * singleMultiplier
                            const singleMax = range.max * singleMultiplier

                            return (
                              <p key={`${range.currency}-single`} className="text-muted-foreground">
                                Single traveller:{" "}
                                {singleMin === singleMax
                                  ? formatMoney(range.currency, singleMin)
                                  : `${formatMoney(range.currency, singleMin)} - ${formatMoney(
                                      range.currency,
                                      singleMax,
                                    )}`}
                              </p>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Select at least one route with rate cards to calculate a package range.
                        </p>
                      )}
                    </div>
                  )
                })()}
              </CardContent>
            </Card>
          ) : null}

          {step === 5 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Save</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Create this package with {state.legs.length} supplier legs and{" "}
                  {selectedRouteCount(state.legs)} selected routes.
                </p>
                <Button type="button" onClick={savePackage} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save package"}
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <div className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              disabled={step === 1}
              onClick={() => setStep((current) => Math.max(1, current - 1))}
            >
              Back
            </Button>
            <Button
              type="button"
              disabled={isNextDisabled}
              onClick={() => setStep((current) => Math.min(5, current + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
