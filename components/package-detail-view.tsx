"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Save, Trash2 } from "lucide-react"
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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { PackageLegEditor, type EditablePackageLeg } from "@/components/package-leg-editor"
import { parseStaleVersionConflictPayload } from "@/lib/supplier-save-guard"
import { useLocations } from "@/lib/use-data"
import type { PackageDetail } from "@/lib/types"
import { SUPPLIER_KIND_LABELS } from "@/lib/types"

interface PackageDetailViewProps {
  packageDetail: PackageDetail
}

function buildLegState(packageDetail: PackageDetail): EditablePackageLeg[] {
  return packageDetail.legs.map((leg) => ({
    id: leg.id,
    supplierId: leg.supplierId,
    supplierName: leg.supplierName,
    supplierKind: leg.supplierKind,
    label: leg.label ?? "",
    sortOrder: leg.sortOrder,
    routes: leg.routes,
    rateCards: leg.rateCards,
    suiteTypes: leg.suiteTypes,
  }))
}

export function PackageDetailView({ packageDetail }: PackageDetailViewProps) {
  const router = useRouter()
  const { data: locations = [] } = useLocations()
  const [name, setName] = useState(packageDetail.name)
  const [description, setDescription] = useState(packageDetail.description ?? "")
  const [durationNights, setDurationNights] = useState(packageDetail.durationNights)
  const [currency, setCurrency] = useState(packageDetail.currency)
  const [singleSupplementPct, setSingleSupplementPct] = useState(packageDetail.singleSupplementPct)
  const [fixedPricePerPerson, setFixedPricePerPerson] = useState<number | null>(packageDetail.fixedPricePerPerson)
  const [active, setActive] = useState(packageDetail.active)
  const [legs, setLegs] = useState(() => buildLegState(packageDetail))
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const supplierKinds = useMemo(
    () => Array.from(new Set(legs.map((leg) => leg.supplierKind))),
    [legs],
  )

  const buildPayload = () => ({
    name: name.trim(),
    description: description.trim() || null,
    durationNights,
    currency: currency.trim().toUpperCase() || "ZAR",
    singleSupplementPct,
    fixedPricePerPerson,
    active,
    expectedUpdatedAt: packageDetail.updatedAt,
    legs: legs.map((leg, index) => ({
      id: leg.id,
      supplierId: leg.supplierId,
      label: leg.label.trim() || null,
      sortOrder: leg.sortOrder ?? index,
      routes: leg.routes.map((route) => ({
        id: route.id,
        name: route.name.trim(),
        originLocationId: route.originLocationId,
        destinationLocationId: route.destinationLocationId,
        active: route.active,
      })),
      rateCards: leg.rateCards.map((rateCard) => ({
        id: rateCard.id,
        routeId: rateCard.routeId,
        suiteTypeId: rateCard.suiteTypeId,
        pricePerPerson: rateCard.pricePerPerson,
        childPrice: rateCard.childPrice,
        infantPrice: rateCard.infantPrice,
        currency: rateCard.currency.trim().toUpperCase() || currency.trim().toUpperCase() || "ZAR",
        validFrom: rateCard.validFrom,
        validTo: rateCard.validTo ?? "",
      })),
    })),
  })

  const save = async () => {
    if (!name.trim()) {
      toast.error("Package name is required")
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

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{packageDetail.name}</h1>
          <div className="flex flex-wrap gap-2">
            <Badge variant={active ? "default" : "outline"}>{active ? "Active" : "Inactive"}</Badge>
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
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Duration nights</Label>
            <NumericInput
              nullable
              min="0"
              step="1"
              value={durationNights}
              onValueChange={setDurationNights}
            />
          </div>
          <div className="space-y-2">
            <Label>Currency</Label>
            <Input value={currency} onChange={(event) => setCurrency(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Single supplement %</Label>
            <NumericInput
              min="0"
              step="0.01"
              value={singleSupplementPct}
              onValueChange={(value) => setSingleSupplementPct(value ?? 0)}
            />
          </div>
          <div className="space-y-2">
            <Label>Fixed price per person (optional)</Label>
            <NumericInput
              min="0"
              step="0.01"
              nullable
              value={fixedPricePerPerson}
              onValueChange={setFixedPricePerPerson}
            />
            <p className="text-xs text-muted-foreground">
              Overrides rate card calculation when applying to a job. Leave blank to use rate cards.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <Switch checked={active} onCheckedChange={setActive} />
            <span className="self-center text-sm text-muted-foreground">Active</span>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Legs</h2>
          <p className="text-sm text-muted-foreground">
            Add new legs from the package wizard. Existing legs can be reordered and priced here.
          </p>
        </div>
        {legs.map((leg, index) => (
          <PackageLegEditor
            key={leg.id}
            leg={leg}
            locations={locations}
            onChange={(nextLeg) =>
              setLegs((current) =>
                current.map((item, itemIndex) => (itemIndex === index ? nextLeg : item)),
              )
            }
            onRemove={() => setLegs((current) => current.filter((_leg, itemIndex) => itemIndex !== index))}
          />
        ))}
        {legs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            No supplier legs have been added to this package.
          </div>
        ) : null}
      </section>
    </div>
  )
}
