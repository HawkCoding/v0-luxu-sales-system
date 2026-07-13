"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, Loader2, PackageOpen, Search, Send } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/lib/auth-context"
import { useActivePackages } from "@/lib/use-data"
import {
  CONSULTANTS,
  SUPPLIER_KIND_LABELS,
  type ConsultantAbbreviation,
  type Package,
  type PackageDetail,
  type QuoteLineItem,
} from "@/lib/types"

type Step = "pick" | "configure" | "preview" | "sending"

interface SendQuoteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingId: string
  bookingNumber: string
  departureDate: string | null
  noOfAdults: number
  noOfChildren: number
  customerName: string
  emailImportNeedsReview?: boolean
  onSent: () => void
}

interface ApplyPackageResponse {
  lineItems?: QuoteLineItem[]
  error?: string
}

interface LegSelectionState {
  selected: boolean
  routeId: string
  suiteTypeId: string
}

const SENDING_STEPS = [
  { label: "Creating quote...", duration: 0 },
  { label: "Rendering email preview...", duration: 0 },
  { label: "Sending email and moving pipeline...", duration: 0 },
]

function formatPrice(amount: number | null, currency = "ZAR") {
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00`))
}

function getDefaultTravelDate(departureDate: string | null) {
  return departureDate || new Date().toISOString().slice(0, 10)
}

function getValidityDate() {
  const date = new Date()
  date.setDate(date.getDate() + 14)
  return date.toISOString().slice(0, 10)
}

function resolveConsultantAbbreviation(name?: string | null): ConsultantAbbreviation | null {
  if (!name) return null

  const normalized = name.toLowerCase()
  const match = CONSULTANTS.find((consultant) =>
    normalized.includes(consultant.name.toLowerCase()) ||
    normalized.includes(consultant.key.toLowerCase()),
  )

  return match?.key ?? null
}

function calculateTotals(lineItems: QuoteLineItem[]) {
  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0)
  const vat = Math.round(subtotal * 0.15 * 100) / 100
  const total = Math.round((subtotal + vat) * 100) / 100

  return { subtotal, vat, total }
}

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

function buildDefaultSelections(detail: PackageDetail): Record<string, LegSelectionState> {
  return Object.fromEntries(
    detail.legs.map((leg) => {
      const activeSuiteTypes = leg.suiteTypes.filter((suiteType) => suiteType.active)
      return [
        leg.id,
        {
          selected: !isOptionalLeg(leg.supplierKind),
          routeId: leg.routes.length === 1 ? leg.routes[0].id : "",
          suiteTypeId: activeSuiteTypes.length === 1 ? activeSuiteTypes[0].id : "",
        },
      ]
    }),
  )
}

function getEmptySelection(selected: boolean): LegSelectionState {
  return { selected, routeId: "", suiteTypeId: "" }
}

export function SendQuoteDialog({
  open,
  onOpenChange,
  bookingId,
  bookingNumber,
  departureDate,
  noOfAdults,
  noOfChildren,
  customerName,
  emailImportNeedsReview = false,
  onSent,
}: SendQuoteDialogProps) {
  const { user } = useAuth()
  const { data: packages = [] } = useActivePackages()
  const [step, setStep] = useState<Step>("pick")
  const [search, setSearch] = useState("")
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null)
  const [packageDetail, setPackageDetail] = useState<PackageDetail | null>(null)
  const [legSelections, setLegSelections] = useState<Record<string, LegSelectionState>>({})
  const [previewLineItems, setPreviewLineItems] = useState<QuoteLineItem[]>([])
  const [validityUntil, setValidityUntil] = useState(getValidityDate)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sendingStepIndex, setSendingStepIndex] = useState(0)
  const [createdQuoteId, setCreatedQuoteId] = useState<string | null>(null)
  const [createdQuoteNumber, setCreatedQuoteNumber] = useState<string | null>(null)

  const activePackages = packages.filter((pkg) => pkg.active)
  const filteredPackages = activePackages.filter((pkg) =>
    [pkg.name, pkg.trainRouteName ?? ""].some((value) =>
      value.toLowerCase().includes(search.toLowerCase()),
    ),
  )
  const totals = useMemo(() => calculateTotals(previewLineItems), [previewLineItems])
  const travelDate = getDefaultTravelDate(departureDate)
  const consultantAbbreviation = resolveConsultantAbbreviation(user?.name)
  const allSelectionsComplete =
    packageDetail !== null &&
    packageDetail.legs.every((leg) => {
      const selection = legSelections[leg.id]
      if (!selection) return false
      if (isOptionalLeg(leg.supplierKind) && !selection.selected) return true
      const hasRoute = leg.routes.length === 1 || Boolean(selection.routeId)
      return hasRoute && Boolean(selection.suiteTypeId)
    })

  function reset() {
    setStep("pick")
    setSearch("")
    setSelectedPackage(null)
    setPackageDetail(null)
    setLegSelections({})
    setPreviewLineItems([])
    setValidityUntil(getValidityDate())
    setSendError(null)
    setSendingStepIndex(0)
    setCreatedQuoteId(null)
    setCreatedQuoteNumber(null)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (step === "sending" && !nextOpen) return
    onOpenChange(nextOpen)
    if (!nextOpen) reset()
  }

  async function previewPackage(
    pkg: Package,
    detail: PackageDetail,
    selections: Record<string, LegSelectionState>,
  ) {
    setPreviewing(true)
    setSendError(null)

    try {
      const response = await fetch(`/api/packages/${pkg.slug}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: bookingId,
          quoteId: bookingId,
          travelDate,
          selections: detail.legs.map((leg) => ({
            legId: leg.id,
            selected: selections[leg.id]?.selected ?? !isOptionalLeg(leg.supplierKind),
            routeId: selections[leg.id]?.routeId || undefined,
            suiteTypeId: selections[leg.id]?.suiteTypeId || undefined,
          })),
        }),
      })
      const payload = (await response.json()) as ApplyPackageResponse

      if (!response.ok || !payload.lineItems) {
        setSendError(payload.error ?? "Pricing preview failed")
        return
      }

      setPreviewLineItems(payload.lineItems)
      setStep("preview")
    } catch {
      setSendError("Failed to preview pricing. Please try again.")
    } finally {
      setPreviewing(false)
    }
  }

  async function selectPackage(pkg: Package) {
    setSelectedPackage(pkg)
    setLoadingDetail(true)
    setSendError(null)
    setCreatedQuoteId(null)
    setCreatedQuoteNumber(null)

    try {
      const response = await fetch(`/api/packages/${pkg.slug}`)
      if (!response.ok) throw new Error("Failed to load package")

      const detail = (await response.json()) as PackageDetail
      const defaults = buildDefaultSelections(detail)

      setPackageDetail(detail)
      setLegSelections(defaults)

      if (detail.fixedPricePerPerson !== null && detail.legs.every((leg) => !isOptionalLeg(leg.supplierKind))) {
        await previewPackage(pkg, detail, defaults)
      } else {
        setStep("configure")
      }
    } catch {
      toast.error("Could not load package details")
    } finally {
      setLoadingDetail(false)
    }
  }

  async function previewConfiguredPackage() {
    if (!selectedPackage || !packageDetail) return
    await previewPackage(selectedPackage, packageDetail, legSelections)
  }

  async function sendQuote() {
    if (previewLineItems.length === 0) return
    if (emailImportNeedsReview) {
      toast.error("Resolve Needs Review before sending this quote")
      return
    }

    setStep("sending")
    setSendError(null)
    setSendingStepIndex(0)

    try {
      setSendingStepIndex(0)
      let quoteId = createdQuoteId
      let quoteNumber = createdQuoteNumber

      if (!quoteId) {
        const quoteResponse = await fetch("/api/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookingId,
            itineraryId: null,
            status: "ready",
            validityUntil,
            subtotal: totals.subtotal,
            vat: totals.vat,
            total: totals.total,
            lineItems: previewLineItems,
          }),
        })

        if (!quoteResponse.ok) {
          const payload = (await quoteResponse.json()) as { error?: string }
          throw new Error(payload.error ?? "Failed to create quote")
        }

        const quotePayload = (await quoteResponse.json()) as { id: string; quoteNumber?: string | null }
        quoteId = quotePayload.id
        quoteNumber = quotePayload.quoteNumber ?? null
        setCreatedQuoteId(quoteId)
        setCreatedQuoteNumber(quoteNumber)
      }

      setSendingStepIndex(1)

      // Email is composed server-side from the quote_email template.
      const previewResponse = await fetch(`/api/quotes/${quoteId}/email-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const previewPayload = (await previewResponse.json()) as {
        html?: string
        subject?: string
        error?: string
      }

      if (!previewResponse.ok || !previewPayload.html) {
        throw new Error(previewPayload.error ?? "Failed to render quote email")
      }

      const subject =
        previewPayload.subject ?? `Quote ${quoteNumber ?? bookingNumber} - Luxus Travel & Tours`

      setSendingStepIndex(2)
      const correspondenceResponse = await fetch("/api/correspondence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          quoteId,
          channel: "email",
          kind: "quote",
          subject,
          bodyHtml: previewPayload.html,
          moveStage: "quote_sent",
          actor: consultantAbbreviation ?? undefined,
        }),
      })

      if (!correspondenceResponse.ok) {
        const payload = (await correspondenceResponse.json()) as { error?: string }
        throw new Error(payload.error ?? "Failed to record quote email")
      }

      toast.success("Quote sent - moved to pipeline")
      onSent()
      onOpenChange(false)
      reset()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send quote"
      setSendError(message)
      setStep("preview")
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {step === "pick" && (
          <>
            <DialogHeader>
              <DialogTitle>Send quote</DialogTitle>
              <DialogDescription>
                Select a package to price {bookingNumber} and prepare the quote email.
              </DialogDescription>
            </DialogHeader>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search packages..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {filteredPackages.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No active packages found
                </p>
              ) : (
                filteredPackages.map((pkg) => (
                  <button
                    key={pkg.id}
                    type="button"
                    className="w-full rounded-lg border p-3 text-left transition-colors hover:border-primary/40 hover:bg-secondary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={loadingDetail || previewing}
                    onClick={() => selectPackage(pkg)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{pkg.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {pkg.legCount} leg{pkg.legCount === 1 ? "" : "s"}
                          {pkg.trainRouteName ? ` - ${pkg.trainRouteName}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-xs font-medium">
                        {pkg.fixedPricePerPerson !== null ? (
                          <span>{formatPrice(pkg.fixedPricePerPerson, pkg.currency)} pp</span>
                        ) : pkg.priceTo !== null ? (
                          <span>
                            {pkg.priceFrom !== null
                              ? `${formatPrice(pkg.priceFrom, pkg.currency)} - ${formatPrice(pkg.priceTo, pkg.currency)} pp`
                              : `${formatPrice(pkg.priceTo, pkg.currency)} pp`}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Pricing varies</span>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
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

            {(loadingDetail || previewing) && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading package pricing...
              </div>
            )}
          </>
        )}

        {step === "configure" && packageDetail && (
          <>
            <DialogHeader>
              <DialogTitle>{packageDetail.name}</DialogTitle>
              <DialogDescription>
                Select the package options that apply before previewing the quote.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md border bg-secondary/20 p-3 text-sm">
              <p className="font-medium text-foreground">Occupancy</p>
              <p className="mt-1 text-muted-foreground">
                {noOfAdults} adult{noOfAdults === 1 ? "" : "s"}, {noOfChildren} child
                {noOfChildren === 1 ? "" : "ren"} - departing {formatDate(travelDate)}
              </p>
            </div>

            <div className="space-y-4">
              {packageDetail.legs.map((leg) => {
                const selection = legSelections[leg.id]
                const optional = isOptionalLeg(leg.supplierKind)
                const enabled = selection?.selected ?? !optional
                const activeSuiteTypes = leg.suiteTypes.filter((suiteType) => suiteType.active)

                return (
                  <div key={leg.id} className="space-y-3 rounded-md border p-3">
                    <div className="flex items-start gap-3">
                      {optional ? (
                        <Checkbox
                          checked={enabled}
                          onCheckedChange={(checked) =>
                            setLegSelections((current) => ({
                              ...current,
                              [leg.id]: {
                                ...(current[leg.id] ?? getEmptySelection(!optional)),
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
                      <div className="grid gap-3 md:grid-cols-2">
                        {leg.routes.length !== 1 ? (
                          <div className="space-y-1.5">
                            <Label className="capitalize">{getRouteLabel(leg.supplierKind)}</Label>
                            {leg.routes.length === 0 ? (
                              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                No {getRouteLabel(leg.supplierKind)}s configured for this supplier.
                              </p>
                            ) : (
                              <Select
                                value={selection?.routeId ?? ""}
                                onValueChange={(value) =>
                                  setLegSelections((current) => ({
                                    ...current,
                                    [leg.id]: { ...(current[leg.id] ?? getEmptySelection(!optional)), routeId: value },
                                  }))
                                }
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
                            )}
                          </div>
                        ) : null}

                        <div className="space-y-1.5">
                          <Label className="capitalize">{getSuiteLabel(leg.supplierKind)}</Label>
                          {activeSuiteTypes.length === 0 ? (
                            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                              No active {getSuiteLabel(leg.supplierKind)} configured for this leg.
                            </p>
                          ) : (
                            <Select
                              value={selection?.suiteTypeId ?? ""}
                              onValueChange={(value) =>
                                setLegSelections((current) => ({
                                  ...current,
                                  [leg.id]: { ...(current[leg.id] ?? getEmptySelection(!optional)), suiteTypeId: value },
                                }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={`Select ${getSuiteLabel(leg.supplierKind)}`} />
                              </SelectTrigger>
                              <SelectContent>
                                {activeSuiteTypes.map((suiteType) => (
                                  <SelectItem key={suiteType.id} value={suiteType.id}>
                                    {suiteType.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>

            {sendError ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {sendError}
              </p>
            ) : null}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("pick")}>
                Back
              </Button>
              <Button
                onClick={previewConfiguredPackage}
                disabled={!allSelectionsComplete || previewing}
              >
                {previewing ? "Previewing..." : "Preview Pricing"}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "preview" && (
          <>
            <DialogHeader>
              <DialogTitle>Pricing preview</DialogTitle>
              <DialogDescription>
                Quote valid until {formatDate(validityUntil)}. VAT is calculated at 15%.
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
                  {previewLineItems.map((lineItem, index) => (
                    <tr key={`${lineItem.description}-${index}`} className="border-b last:border-0">
                      <td className="px-3 py-2 text-xs">{lineItem.description}</td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                        {lineItem.qty}
                      </td>
                      <td className="px-3 py-2 text-right text-xs">
                        {lineItem.unitPrice === 0 ? (
                          <span className="italic text-muted-foreground">Included</span>
                        ) : (
                          formatPrice(lineItem.unitPrice)
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-xs font-medium">
                        {lineItem.total === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          formatPrice(lineItem.total)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ml-auto w-full max-w-xs space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatPrice(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">VAT</span>
                <span>{formatPrice(totals.vat)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-base font-semibold">
                <span>Total</span>
                <span>{formatPrice(totals.total)}</span>
              </div>
            </div>

            {sendError ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {sendError}
              </p>
            ) : null}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setStep(packageDetail?.fixedPricePerPerson === null ? "configure" : "pick")}
              >
                Back
              </Button>
              <Button onClick={sendQuote}>
                <Send className="mr-2 h-4 w-4" />
                Send Quote
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "sending" && (
          <div className="space-y-6 py-4">
            <DialogHeader>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <PackageOpen className="h-6 w-6 text-primary" />
              </div>
              <DialogTitle className="text-center">Sending quote</DialogTitle>
              <DialogDescription className="text-center">
                Preparing {bookingNumber} for the pipeline.
              </DialogDescription>
            </DialogHeader>

            <Progress value={((sendingStepIndex + 1) / SENDING_STEPS.length) * 100} />

            <div className="space-y-3">
              {SENDING_STEPS.map((sendingStep, index) => {
                const isComplete = index < sendingStepIndex
                const isActive = index === sendingStepIndex

                return (
                  <div key={sendingStep.label} className="flex items-center gap-3 text-sm">
                    {isComplete ? (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    ) : isActive ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <span className="h-4 w-4 rounded-full border" aria-hidden="true" />
                    )}
                    <span className={isActive ? "text-foreground" : "text-muted-foreground"}>
                      {sendingStep.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
