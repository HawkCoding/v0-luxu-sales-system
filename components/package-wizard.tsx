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
import { PackageLegEditor, type EditablePackageLeg } from "@/components/package-leg-editor"
import { useActiveSuppliers, useLocations } from "@/lib/use-data"
import type { Supplier, SupplierDetail } from "@/lib/types"
import { SUPPLIER_KIND_LABELS, type SupplierKind } from "@/lib/types"

interface WizardState {
  name: string
  description: string
  durationNights: number | null
  currency: string
  singleSupplementPct: number
  fixedPricePerPerson: number | null
  active: boolean
  legs: EditablePackageLeg[]
}

type WizardAction =
  | { type: "field"; field: keyof Omit<WizardState, "legs">; value: string | number | boolean | null }
  | { type: "addLeg"; leg: EditablePackageLeg }
  | { type: "updateLeg"; index: number; leg: EditablePackageLeg }
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
    legs: state.legs.map((leg, index) => ({
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
        currency: rateCard.currency.trim().toUpperCase() || state.currency.trim().toUpperCase() || "ZAR",
        validFrom: rateCard.validFrom,
        validTo: rateCard.validTo ?? "",
      })),
    })),
  }
}

async function loadSupplierSuiteTypes(supplier: Supplier) {
  const response = await fetch(`/api/suppliers/${supplier.slug}`)
  if (!response.ok) return []
  const detail = (await response.json()) as SupplierDetail
  return detail.suiteTypes
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

  const addSelectedSupplier = async () => {
    if (!selectedSupplier) return
    const suiteTypes = await loadSupplierSuiteTypes(selectedSupplier)
    dispatch({
      type: "addLeg",
      leg: {
        id: crypto.randomUUID(),
        supplierId: selectedSupplier.id,
        supplierName: selectedSupplier.name,
        supplierKind: selectedSupplier.kind,
        label: selectedSupplier.name,
        sortOrder: state.legs.length,
        routes: [],
        rateCards: [],
        suiteTypes,
      },
    })
    setSelectedSupplierId("")
  }

  const savePackage = async () => {
    if (!state.name.trim()) {
      toast.error("Package name is required")
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
            {["Details", "Add Legs", "Configure", "Review", "Save"].map((label, index) => (
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
                  <Input
                    value={state.currency}
                    onChange={(event) =>
                      dispatch({ type: "field", field: "currency", value: event.target.value })
                    }
                  />
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
                <PackageLegEditor
                  key={leg.id}
                  leg={leg}
                  locations={locations}
                  onChange={(nextLeg) => dispatch({ type: "updateLeg", index, leg: nextLeg })}
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
              <CardContent className="space-y-3">
                <p className="font-medium">{state.name || "Unnamed package"}</p>
                <p className="text-sm text-muted-foreground">{state.legs.length} legs configured</p>
                {state.legs.map((leg) => (
                  <div key={leg.id} className="rounded-lg border p-3 text-sm">
                    <p className="font-medium">{leg.label || leg.supplierName}</p>
                    <p className="text-muted-foreground">
                      {leg.routes.length} routes, {leg.rateCards.length} rates
                    </p>
                  </div>
                ))}
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
                  Create this package with {state.legs.length} supplier legs.
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
              disabled={step === 5}
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
