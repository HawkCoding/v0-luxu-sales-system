"use client"

import { useState } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useActivePackages } from "@/lib/use-data"
import type { Package, PackageDetail, QuoteLineItem } from "@/lib/types"
import { SUPPLIER_KIND_LABELS } from "@/lib/types"

interface ApplyPackageDialogProps {
  jobId: string
  quoteId: string
  travelDate: string | null
  existingLineItemCount: number
  onApplied: () => void
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

export function ApplyPackageDialog({
  jobId,
  quoteId,
  travelDate,
  existingLineItemCount,
  onApplied,
}: ApplyPackageDialogProps) {
  const { data: packages = [] } = useActivePackages()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("pick")
  const [search, setSearch] = useState("")
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null)
  const [packageDetail, setPackageDetail] = useState<PackageDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [suiteTypeSelections, setSuiteTypeSelections] = useState<Record<string, string>>({})
  const [previewLineItems, setPreviewLineItems] = useState<QuoteLineItem[]>([])
  const [validating, setValidating] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)

  const activePackages = packages.filter((pkg) => pkg.active)
  const filteredPackages = activePackages.filter((pkg) =>
    pkg.name.toLowerCase().includes(search.toLowerCase()) ||
    (pkg.trainRouteName ?? "").toLowerCase().includes(search.toLowerCase()),
  )

  function reset() {
    setStep("pick")
    setSearch("")
    setSelectedPackage(null)
    setPackageDetail(null)
    setSuiteTypeSelections({})
    setPreviewLineItems([])
    setApplyError(null)
  }

  async function selectPackage(pkg: Package) {
    setSelectedPackage(pkg)
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/packages/${pkg.slug}`)
      if (!res.ok) throw new Error("Failed to load package details")
      const detail: PackageDetail = await res.json()
      setPackageDetail(detail)
      const defaults: Record<string, string> = {}
      for (const leg of detail.legs) {
        if (leg.suiteTypes.length === 1) {
          defaults[leg.id] = leg.suiteTypes[0].id
        }
      }
      setSuiteTypeSelections(defaults)
      setStep("configure")
    } catch {
      toast.error("Could not load package details")
    } finally {
      setLoadingDetail(false)
    }
  }

  const allSuiteTypesSelected =
    packageDetail !== null &&
    (packageDetail.fixedPricePerPerson !== null ||
      packageDetail.legs.every((leg) => Boolean(suiteTypeSelections[leg.id])))

  async function validateAndPreview() {
    if (!selectedPackage || !packageDetail) return
    setValidating(true)
    setApplyError(null)

    const legSuiteTypes = packageDetail.legs.map((leg) => ({
      legId: leg.id,
      suiteTypeId: suiteTypeSelections[leg.id] ?? "",
    }))

    try {
      const res = await fetch(`/api/packages/${selectedPackage.slug}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          quoteId,
          travelDate: travelDate ?? new Date().toISOString().slice(0, 10),
          legSuiteTypes,
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
    setApplying(true)
    try {
      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineItems: previewLineItems }),
      })
      if (!res.ok) {
        const payload = await res.json()
        toast.error(typeof payload?.error === "string" ? payload.error : "Failed to apply package")
        return
      }
      toast.success(`Package "${selectedPackage?.name}" applied to quote`)
      setOpen(false)
      reset()
      onApplied()
    } catch {
      toast.error("Failed to apply package")
    } finally {
      setApplying(false)
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
              <DialogTitle>Apply a package</DialogTitle>
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
              <DialogTitle>{packageDetail.name}</DialogTitle>
              <DialogDescription>
                {packageDetail.fixedPricePerPerson !== null
                  ? "This package uses a fixed price. No suite type selection needed."
                  : "Select the suite type for each leg."}
              </DialogDescription>
            </DialogHeader>

            {!travelDate && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                This job has no departure date set. Pricing will be validated against today&apos;s date.
              </p>
            )}

            {packageDetail.fixedPricePerPerson === null && (
              <div className="space-y-4">
                {packageDetail.legs.map((leg) => (
                  <div key={leg.id} className="space-y-1.5">
                    <Label>{leg.label ?? leg.supplierName}</Label>
                    {leg.suiteTypes.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No suite types configured</p>
                    ) : (
                      <Select
                        value={suiteTypeSelections[leg.id] ?? ""}
                        onValueChange={(value) =>
                          setSuiteTypeSelections((prev) => ({ ...prev, [leg.id]: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select suite type" />
                        </SelectTrigger>
                        <SelectContent>
                          {leg.suiteTypes.filter((st) => st.active).map((st) => (
                            <SelectItem key={st.id} value={st.id}>
                              {st.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                ))}
              </div>
            )}

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
                disabled={!allSuiteTypesSelected || validating}
              >
                {validating ? "Checking pricing…" : "Next"}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "confirm" && (
          <>
            <DialogHeader>
              <DialogTitle>Confirm replacement</DialogTitle>
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
                      <td className="px-3 py-2 text-xs">{li.description}</td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">{li.qty}</td>
                      <td className="px-3 py-2 text-right text-xs">R {li.unitPrice.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-xs font-medium">R {li.total.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("configure")}>
                Back
              </Button>
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
