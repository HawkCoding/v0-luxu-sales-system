"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useSWRConfig } from "swr"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import { NumericInput } from "@/components/ui/numeric-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Location, SupplierKind } from "@/lib/types"
import { SUPPLIER_KIND_LABELS, getSupplierVocabulary, isTransportSupplier } from "@/lib/types"
import { buildRouteName } from "@/lib/routes/route-name"

export interface QuickSupplierResult {
  supplierId: string
  slug: string
  supplierName: string
  supplierKind: SupplierKind
  routeId: string
  routeName: string
  suiteTypeId: string
  suiteTypeName: string
}

interface NewSupplierQuickDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultKind?: SupplierKind
  locations: Location[]
  onCreated: (result: QuickSupplierResult) => void
}

const KIND_OPTIONS: SupplierKind[] = [
  "hotel_property",
  "transfers",
  "vehicle_rental",
  "tour_operator",
  "train_operator",
  "airline",
]

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function NewSupplierQuickDialog({
  open,
  onOpenChange,
  defaultKind = "hotel_property",
  locations,
  onCreated,
}: NewSupplierQuickDialogProps) {
  const { mutate } = useSWRConfig()
  const [kind, setKind] = useState<SupplierKind>(defaultKind)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [locationId, setLocationId] = useState("")
  const [routeName, setRouteName] = useState("")
  const [originLocationId, setOriginLocationId] = useState("")
  const [destinationLocationId, setDestinationLocationId] = useState("")
  const [pickupPoint, setPickupPoint] = useState("")
  const [dropoffPoint, setDropoffPoint] = useState("")
  const [suiteTypeName, setSuiteTypeName] = useState("")
  const [price, setPrice] = useState<number | null>(null)
  const [validFrom, setValidFrom] = useState(todayIso())
  const [priceExpires, setPriceExpires] = useState(false)
  const [validTo, setValidTo] = useState("")
  const [saving, setSaving] = useState(false)

  const vocab = getSupplierVocabulary(kind)
  const isTransport = isTransportSupplier(kind)
  const needsLocations = kind === "train_operator" || kind === "airline"
  const autoDeriveRouteName = vocab.routeNameAutoDerived
  const derivedRouteName = (() => {
    if (!autoDeriveRouteName) return ""
    const originName = locations.find((l) => l.id === originLocationId)?.name
    const destinationName = locations.find((l) => l.id === destinationLocationId)?.name
    if (!originName || !destinationName) return ""
    return buildRouteName(originName, destinationName, "one_way")
  })()
  const effectiveRouteName = autoDeriveRouteName ? routeName.trim() || derivedRouteName : routeName

  function reset() {
    setKind(defaultKind)
    setName("")
    setEmail("")
    setPhone("")
    setLocationId("")
    setRouteName("")
    setOriginLocationId("")
    setDestinationLocationId("")
    setPickupPoint("")
    setDropoffPoint("")
    setSuiteTypeName("")
    setPrice(null)
    setValidFrom(todayIso())
    setPriceExpires(false)
    setValidTo("")
  }

  function validate(): string | null {
    if (name.trim().length < 2) return "Supplier name must be at least 2 characters"
    if (!autoDeriveRouteName && routeName.trim().length < 1) return `${vocab.route} name is required`
    if (needsLocations && (!originLocationId || !destinationLocationId)) {
      return "Origin and destination are required for this category"
    }
    if (isTransport && (!pickupPoint.trim() || !dropoffPoint.trim())) {
      return "Pickup and drop-off points are required"
    }
    if (suiteTypeName.trim().length < 1) return `${vocab.suiteType} name is required`
    if (price === null || price < 0) return "Price per person is required"
    if (priceExpires && !validTo) return "Please enter the date this price expires"
    return null
  }

  async function handleSave() {
    const error = validate()
    if (error) {
      toast.error(error)
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/suppliers/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          locationId: locationId || null,
          routeName: effectiveRouteName.trim(),
          originLocationId: needsLocations ? originLocationId : null,
          destinationLocationId: needsLocations ? destinationLocationId : null,
          pickupPoint: isTransport ? pickupPoint.trim() : "",
          dropoffPoint: isTransport ? dropoffPoint.trim() : "",
          suiteTypeName: suiteTypeName.trim(),
          price: price ?? 0,
          validFrom,
          validTo: priceExpires ? validTo : null,
        }),
      })

      const payload = (await res.json()) as {
        supplierId?: string
        slug?: string
        supplierName?: string
        supplierKind?: SupplierKind
        routeId?: string
        routeName?: string
        suiteTypeId?: string
        suiteTypeName?: string
        error?: string
      }

      if (!res.ok) {
        toast.error(payload.error ?? "Failed to create supplier")
        return
      }

      await mutate("/api/suppliers")
      toast.success(
        `${name.trim()} added as a temporary supplier — a manager can activate it in Suppliers`,
      )
      onCreated({
        supplierId: payload.supplierId!,
        slug: payload.slug!,
        supplierName: payload.supplierName!,
        supplierKind: payload.supplierKind!,
        routeId: payload.routeId!,
        routeName: payload.routeName!,
        suiteTypeId: payload.suiteTypeId!,
        suiteTypeName: payload.suiteTypeName!,
      })
      reset()
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  const cityLocations = locations.filter((location) => !location.parentLocationId)

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next) }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New supplier</DialogTitle>
          <DialogDescription>
            Add a supplier with one {vocab.route.toLowerCase()}, one {vocab.suiteType.toLowerCase()}, and a rate.
            It will be saved as a temporary supplier and can be fully activated by a manager later.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={kind} onValueChange={(value) => setKind(value as SupplierKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {SUPPLIER_KIND_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Supplier name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cape Grace Hotel" />
            </div>
            <div className="space-y-1.5">
              <Label>Email (optional)</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone (optional)</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+27 ..." />
            </div>
          </div>

          {!needsLocations ? (
            <div className="space-y-1.5">
              <Label>Location (optional)</Label>
              <Select value={locationId || undefined} onValueChange={setLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.parentLocationId
                        ? `${cityLocations.find((c) => c.id === location.parentLocationId)?.name ?? "?"} · ${location.name}`
                        : location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Tagging a location lets this supplier be filtered by route destination later.
              </p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label>{vocab.route} name</Label>
            <Input
              value={autoDeriveRouteName && routeName.trim() === "" ? derivedRouteName : routeName}
              onChange={(e) => setRouteName(e.target.value)}
              placeholder={
                autoDeriveRouteName
                  ? "Auto-filled from origin and destination"
                  : kind === "hotel_property"
                    ? "e.g. Bed & Breakfast"
                    : `e.g. ${vocab.route}`
              }
            />
          </div>

          {needsLocations ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Origin</Label>
                <Select value={originLocationId || undefined} onValueChange={setOriginLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Origin" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Destination</Label>
                <Select value={destinationLocationId || undefined} onValueChange={setDestinationLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {isTransport ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Pickup point</Label>
                <Input value={pickupPoint} onChange={(e) => setPickupPoint(e.target.value)} placeholder="e.g. OR Tambo" />
              </div>
              <div className="space-y-1.5">
                <Label>Drop-off point</Label>
                <Input value={dropoffPoint} onChange={(e) => setDropoffPoint(e.target.value)} placeholder="e.g. Hotel" />
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{vocab.suiteType} name</Label>
              <Input
                value={suiteTypeName}
                onChange={(e) => setSuiteTypeName(e.target.value)}
                placeholder={kind === "hotel_property" ? "e.g. Deluxe Room" : `e.g. ${vocab.suiteType}`}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Price per person (ZAR)</Label>
              <NumericInput min="0" step="0.01" nullable value={price} onValueChange={setPrice} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="price-expires"
                checked={priceExpires}
                onCheckedChange={(checked) => {
                  setPriceExpires(Boolean(checked))
                  if (!checked) setValidTo("")
                }}
              />
              <Label htmlFor="price-expires" className="cursor-pointer font-normal">
                This price expires on a set date
              </Label>
            </div>
            {priceExpires && (
              <div className="space-y-1.5">
                <Label>Valid until</Label>
                <DatePicker
                  value={validTo}
                  minDate={validFrom}
                  onChange={(value) => setValidTo(value ?? "")}
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Create & use"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
