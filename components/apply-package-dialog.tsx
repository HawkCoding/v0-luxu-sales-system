"use client"

import { useEffect, useState } from "react"
import { Boxes, Search } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useActivePackages } from "@/lib/use-data"
import type { Package, PackageDetail, QuoteLineItem, RouteDirection } from "@/lib/types"
import { SUPPLIER_KIND_LABELS } from "@/lib/types"
import { PresenceAvatars } from "@/components/presence-avatars"
import { useRecordPresence } from "@/hooks/use-record-presence"
import { useVersionedSave } from "@/hooks/use-versioned-save"
import { CommissionControl, type CommissionControlValue } from "@/components/supplier/commission-control"
import { CommissionBadge } from "@/components/quotes/commission-badge"

interface ApplyPackageDialogProps {
  jobId: string
  quoteId: string
  travelDate: string | null
  existingLineItemCount: number
  expectedUpdatedAt?: string
  onApplied: () => void
}

interface QuotePatchPayload {
  lineItems: QuoteLineItem[]
}

interface QuotePatchResponse {
  id: string
  subtotal: number
  vat: number
  total: number
  lineItems: QuoteLineItem[]
  updatedAt: string
}

function formatPrice(amount: number | null, currency: string) {
  if (amount === null) return null
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`
  }
}

type Step = "pick" | "configure" | "confirm"

interface LegSelectionState {
  selected: boolean
  routeId: string
  suiteTypeId: string
  direction?: RouteDirection
  commissionOverride?: CommissionControlValue
  showCommissionOverride?: boolean
}

const DIRECTION_OPTIONS: { key: RouteDirection; label: string }[] = [
  { key: "outbound", label: "Outbound" },
  { key: "return", label: "Return" },
  { key: "round_trip", label: "Round trip" },
]

function isOptionalLeg(kind: PackageDetail["legs"][number]["supplierKind"]): boolean {
  return kind === "hotel_property" || kind === "transfers" || kind === "vehicle_rental"
}

function getRouteLabel(kind: PackageDetail["legs"][number]["supplierKind"]): string {
  if (kind === "hotel_property") return "meal plan"
  if (kind === "transfers") return "transfer"
  if (kind === "vehicle_rental") return "rental route"
  return "route"
}

function getSuiteLabel(kind: PackageDetail["legs"][number]["supplierKind"]): string {
  if (kind === "hotel_property") return "room type"
  if (kind === "transfers" || kind === "vehicle_rental") return "vehicle type"
  if (kind === "airline") return "cabin"
  return "suite type"
}

function defaultDirectionForRoute(
  route: PackageDetail["legs"][number]["routes"][number] | undefined,
): RouteDirection | undefined {
  if (!route) return undefined
  return route.directionMode === "round_trip" ? "round_trip" : undefined
}

function buildDefaultSelections(detail: PackageDetail): Record<string, LegSelectionState> {
  return Object.fromEntries(
    detail.legs.map((leg) => {
      const activeSuiteTypes = leg.suiteTypes.filter((suiteType) => suiteType.active)
      const onlyRoute = leg.routes.length === 1 ? leg.routes[0] : undefined
      return [
        leg.id,
        {
          selected: !isOptionalLeg(leg.supplierKind),
          routeId: onlyRoute ? onlyRoute.id : "",
          suiteTypeId: activeSuiteTypes.length === 1 ? activeSuiteTypes[0].id : "",
          direction: defaultDirectionForRoute(onlyRoute),
          commissionOverride: { type: null, value: null },
          showCommissionOverride: false,
        },
      ]
    }),
  )
}

function getEmptySelection(selected: boolean): LegSelectionState {
  return {
    selected,
    routeId: "",
    suiteTypeId: "",
    commissionOverride: { type: null, value: null },
    showCommissionOverride: false,
  }
}

export function ApplyPackageDialog({
  jobId,
  quoteId,
  travelDate,
  existingLineItemCount,
  expectedUpdatedAt,
  onApplied,
}: ApplyPackageDialogProps) {
  const { data: packages = [] } = useActivePackages()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("pick")
  const [search, setSearch] = useState("")
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null)
  const [packageDetail, setPackageDetail] = useState<PackageDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [legSelections, setLegSelections] = useState<Record<string, LegSelectionState>>({})
  const [previewLineItems, setPreviewLineItems] = useState<QuoteLineItem[]>([])
  const [validating, setValidating] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const { others, setEditing } = useRecordPresence("quote", open ? quoteId : undefined)
  const {
    save: saveQuote,
    isSaving: applying,
    conflict: quoteConflict,
    clearConflict: clearQuoteConflict,
  } = useVersionedSave<QuotePatchPayload, QuotePatchResponse>({
    url: `/api/quotes/${quoteId}`,
    method: "PATCH",
    entity: "quote",
    recordId: quoteId,
    expectedUpdatedAt,
  })

  const activePackages = packages.filter((pkg) => pkg.active)
  const filteredPackages = activePackages.filter((pkg) =>
    pkg.name.toLowerCase().includes(search.toLowerCase()) ||
    (pkg.trainRouteName ?? "").toLowerCase().includes(search.toLowerCase()),
  )

  useEffect(() => {
    setEditing(open && step !== "pick")
  }, [open, setEditing, step])

  function reset() {
    setStep("pick")
    setSearch("")
    setSelectedPackage(null)
    setPackageDetail(null)
    setLegSelections({})
    setPreviewLineItems([])
    setApplyError(null)
    clearQuoteConflict()
  }

  async function selectPackage(pkg: Package) {
    setSelectedPackage(pkg)
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/packages/${pkg.slug}`)
      if (!res.ok) throw new Error("Failed to load package details")
      const detail: PackageDetail = await res.json()
      setPackageDetail(detail)
      setLegSelections(buildDefaultSelections(detail))
      setStep("configure")
    } catch {
      toast.error("Could not load package details")
    } finally {
      setLoadingDetail(false)
    }
  }

  const allSelectionsComplete =
    packageDetail !== null &&
    packageDetail.legs.every((leg) => {
      const selection = legSelections[leg.id]
      if (!selection) return false
      if (isOptionalLeg(leg.supplierKind) && !selection.selected) return true
      const hasRoute = leg.routes.length <= 1 || Boolean(selection.routeId)
      return hasRoute && Boolean(selection.suiteTypeId)
    })

  async function validateAndPreview() {
    if (!selectedPackage || !packageDetail) return
    setValidating(true)
    setApplyError(null)

    const selections = packageDetail.legs.map((leg) => {
      const state = legSelections[leg.id]
      const override = state?.commissionOverride
      const commissionOverride =
        override && override.type !== null && override.value !== null && Number.isFinite(override.value)
          ? { type: override.type, value: override.value }
          : undefined
      return {
        legId: leg.id,
        selected: state?.selected ?? !isOptionalLeg(leg.supplierKind),
        routeId: state?.routeId || undefined,
        suiteTypeId: state?.suiteTypeId || undefined,
        direction: state?.direction,
        commissionOverride,
      }
    })

    try {
      const res = await fetch(`/api/packages/${selectedPackage.slug}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          quoteId,
          travelDate: travelDate ?? new Date().toISOString().slice(0, 10),
          selections,
        }),
      })
      const payload = await res.json()
      if (!res.ok) {
        setApplyError(typeof payload?.error === "string" ? payload.error : "Validation failed")
        return
      }
      setPreviewLineItems(payload.lineItems as QuoteLineItem[])
      setStep("confirm")
    } catch {
      setApplyError("Failed to validate pricing. Please try again.")
    } finally {
      setValidating(false)
    }
  }

  async function applyToQuote() {
    if (previewLineItems.length === 0) return
    try {
      await saveQuote({ lineItems: previewLineItems })
      toast.success(`Package "${selectedPackage?.name}" applied to quote`)
      setOpen(false)
      reset()
      onApplied()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to apply package"
      setApplyError(message)
      toast.error(message)
    }
  }

  async function applyToQuoteAnyway() {
    if (previewLineItems.length === 0) return
    try {
      await saveQuote({ lineItems: previewLineItems }, { ignoreExpectedUpdatedAt: true })
      toast.success(`Package "${selectedPackage?.name}" applied to quote`)
      setOpen(false)
      reset()
      onApplied()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to apply package"
      setApplyError(message)
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset() }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Boxes className="mr-2 h-4 w-4" />
          Apply Package
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {step === "pick" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                Apply a package
                <PresenceAvatars users={others} />
              </DialogTitle>
              <DialogDescription>
                Select a package to pre-fill this quote with pricing from its rate cards.
              </DialogDescription>
            </DialogHeader>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search packages..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {filteredPackages.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No active packages found</p>
              ) : (
                filteredPackages.map((pkg) => (
                  <button
                    key={pkg.id}
                    type="button"
                    className="w-full rounded-lg border p-3 text-left transition-colors hover:border-primary/40 hover:bg-secondary/20 disabled:opacity-50"
                    disabled={loadingDetail}
                    onClick={() => selectPackage(pkg)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{pkg.name}</p>
                        {pkg.trainRouteName ? (
                          <p className="text-xs text-muted-foreground">{pkg.trainRouteName}</p>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        {pkg.fixedPricePerPerson !== null ? (
                          <p className="text-xs font-medium">{formatPrice(pkg.fixedPricePerPerson, pkg.currency)} pp</p>
                        ) : pkg.priceTo !== null ? (
                          <p className="text-xs font-medium">
                            {pkg.priceFrom !== null
                              ? `${formatPrice(pkg.priceFrom, pkg.currency)} – ${formatPrice(pkg.priceTo, pkg.currency)} pp`
                              : `${formatPrice(pkg.priceTo, pkg.currency)} pp`}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {pkg.supplierKinds.map((kind) => (
                        <Badge key={kind} variant="secondary" className="text-[10px]">
                          {SUPPLIER_KIND_LABELS[kind]}
                        </Badge>
                      ))}
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        )}

        {step === "configure" && packageDetail && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {packageDetail.name}
                <PresenceAvatars users={others} />
              </DialogTitle>
              <DialogDescription>
                Select the package options that apply to this quote.
              </DialogDescription>
            </DialogHeader>

            {!travelDate && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                This job has no departure date set. Pricing will be validated against today&apos;s date.
              </p>
            )}

            <div className="space-y-4">
              {packageDetail.legs.map((leg) => {
                const selection = legSelections[leg.id]
                const optional = isOptionalLeg(leg.supplierKind)
                const enabled = selection?.selected ?? !optional
                const activeSuiteTypes = leg.suiteTypes.filter((st) => st.active)
                const selectedRoute = leg.routes.find((r) => r.id === selection?.routeId)
                const isRoundTripRoute = selectedRoute?.directionMode === "round_trip"
                const routeCommissionInherited =
                  selectedRoute?.commissionType && selectedRoute.commissionValue != null
                    ? { type: selectedRoute.commissionType, value: selectedRoute.commissionValue as number }
                    : null

                return (
                  <div key={leg.id} className="space-y-3 rounded-md border p-3">
                    <div className="flex items-start gap-3">
                      {optional ? (
                        <Checkbox
                          checked={enabled}
                          onCheckedChange={(checked) =>
                            setLegSelections((prev) => ({
                              ...prev,
                              [leg.id]: {
                                ...(prev[leg.id] ?? getEmptySelection(!optional)),
                                selected: checked === true,
                              },
                            }))
                          }
                          className="mt-1"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <Label>{leg.label ?? leg.supplierName}</Label>
                        {optional ? (
                          <p className="text-xs text-muted-foreground">Optional {SUPPLIER_KIND_LABELS[leg.supplierKind].toLowerCase()}</p>
                        ) : null}
                      </div>
                    </div>

                    {enabled ? (
                      <div className="space-y-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          {leg.routes.length > 1 ||
                          leg.supplierKind === "hotel_property" ||
                          leg.supplierKind === "transfers" ||
                          leg.supplierKind === "vehicle_rental" ? (
                            <div className="space-y-1.5">
                              <Label className="capitalize">{getRouteLabel(leg.supplierKind)}</Label>
                              <Select
                                value={selection?.routeId ?? ""}
                                onValueChange={(value) => {
                                  const newRoute = leg.routes.find((r) => r.id === value)
                                  setLegSelections((prev) => ({
                                    ...prev,
                                    [leg.id]: {
                                      ...(prev[leg.id] ?? getEmptySelection(!optional)),
                                      routeId: value,
                                      direction: defaultDirectionForRoute(newRoute),
                                    },
                                  }))
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder={`Select ${getRouteLabel(leg.supplierKind)}`} />
                                </SelectTrigger>
                                <SelectContent>
                                  {leg.routes.map((route) => (
                                    <SelectItem key={route.id} value={route.id}>
                                      {route.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ) : null}

                          <div className="space-y-1.5">
                            <Label className="capitalize">{getSuiteLabel(leg.supplierKind)}</Label>
                            {activeSuiteTypes.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No {getSuiteLabel(leg.supplierKind)} configured</p>
                            ) : (
                              <Select
                                value={selection?.suiteTypeId ?? ""}
                                onValueChange={(value) =>
                                  setLegSelections((prev) => ({
                                    ...prev,
                                    [leg.id]: { ...(prev[leg.id] ?? getEmptySelection(!optional)), suiteTypeId: value },
                                  }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder={`Select ${getSuiteLabel(leg.supplierKind)}`} />
                                </SelectTrigger>
                                <SelectContent>
                                  {activeSuiteTypes.map((st) => (
                                    <SelectItem key={st.id} value={st.id}>
                                      {st.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        </div>

                        {isRoundTripRoute ? (
                          <div className="space-y-1.5">
                            <Label>Direction</Label>
                            <div
                              role="radiogroup"
                              aria-label="Route direction"
                              className="inline-flex rounded-md border bg-muted p-0.5"
                            >
                              {DIRECTION_OPTIONS.map((opt) => {
                                const selected = (selection?.direction ?? "round_trip") === opt.key
                                return (
                                  <button
                                    key={opt.key}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    onClick={() =>
                                      setLegSelections((prev) => ({
                                        ...prev,
                                        [leg.id]: {
                                          ...(prev[leg.id] ?? getEmptySelection(!optional)),
                                          direction: opt.key,
                                        },
                                      }))
                                    }
                                    className={`px-2.5 py-1 text-xs rounded-sm transition-colors ${
                                      selected
                                        ? "bg-background text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                    }`}
                                  >
                                    {opt.label}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        ) : null}

                        <div>
                          {selection?.showCommissionOverride ? (
                            <CommissionControl
                              value={selection.commissionOverride ?? { type: null, value: null }}
                              onChange={(next) =>
                                setLegSelections((prev) => ({
                                  ...prev,
                                  [leg.id]: {
                                    ...(prev[leg.id] ?? getEmptySelection(!optional)),
                                    commissionOverride: next,
                                  },
                                }))
                              }
                              isEditing
                              label="Commission Override"
                              inherited={routeCommissionInherited}
                              inheritedSourceLabel={routeCommissionInherited ? "route" : undefined}
                              onClear={() =>
                                setLegSelections((prev) => ({
                                  ...prev,
                                  [leg.id]: {
                                    ...(prev[leg.id] ?? getEmptySelection(!optional)),
                                    commissionOverride: { type: null, value: null },
                                    showCommissionOverride: false,
                                  },
                                }))
                              }
                              clearLabel="Remove"
                            />
                          ) : (
                            <button
                              type="button"
                              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                              onClick={() =>
                                setLegSelections((prev) => ({
                                  ...prev,
                                  [leg.id]: {
                                    ...(prev[leg.id] ?? getEmptySelection(!optional)),
                                    showCommissionOverride: true,
                                  },
                                }))
                              }
                            >
                              + Override commission
                            </button>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>

            {applyError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {applyError}
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => { setStep("pick"); setApplyError(null) }}>
                Back
              </Button>
              <Button
                onClick={validateAndPreview}
                disabled={!allSelectionsComplete || validating}
              >
                {validating ? "Checking pricing…" : "Next"}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "confirm" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                Confirm replacement
                <PresenceAvatars users={others} />
              </DialogTitle>
              <DialogDescription>
                {existingLineItemCount > 0
                  ? `This will replace ${existingLineItemCount} existing line item${existingLineItemCount === 1 ? "" : "s"} with the following:`
                  : "The following line items will be added to the quote:"}
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Unit price</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {previewLineItems.map((li, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-3 py-2 text-xs">
                        <div>{li.description}</div>
                        <CommissionBadge
                          commission={li.pricingSnapshot?.commission ?? null}
                          currency={packageDetail?.currency ?? "ZAR"}
                        />
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">{li.qty}</td>
                      <td className="px-3 py-2 text-right text-xs">R {li.unitPrice.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-xs font-medium">R {li.total.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {quoteConflict && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {quoteConflict.error}
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("configure")}>
                Back
              </Button>
              {quoteConflict && (
                <Button variant="outline" onClick={applyToQuoteAnyway} disabled={applying}>
                  Save anyway
                </Button>
              )}
              <Button onClick={applyToQuote} disabled={applying}>
                {applying ? "Applying…" : existingLineItemCount > 0 ? "Replace & apply" : "Apply to quote"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
