"use client"

import { Plus, Trash2 } from "lucide-react"
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
import type {
  Location,
  SupplierKind,
  SupplierRateCard,
  SupplierRoute,
  SupplierSuiteType,
} from "@/lib/types"
import { SUPPLIER_KIND_LABELS } from "@/lib/types"

export interface EditablePackageLeg {
  id: string
  supplierId: string
  supplierName: string
  supplierKind: SupplierKind
  label: string
  sortOrder: number
  routes: SupplierRoute[]
  rateCards: SupplierRateCard[]
  suiteTypes: SupplierSuiteType[]
}

interface PackageLegEditorProps {
  leg: EditablePackageLeg
  locations: Location[]
  onChange: (leg: EditablePackageLeg) => void
  onRemove?: () => void
}

function makeClientId(): string {
  return crypto.randomUUID()
}

function createRoute(supplierId: string, locations: Location[]): SupplierRoute {
  const origin = locations[0]?.id ?? ""
  const destination = locations[1]?.id ?? origin

  return {
    id: makeClientId(),
    supplierId,
    name: "",
    originLocationId: origin,
    destinationLocationId: destination,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function createRateCard(leg: EditablePackageLeg): SupplierRateCard {
  const routeId = leg.routes[0]?.id

  return {
    id: makeClientId(),
    routeId: routeId ?? "",
    suiteTypeId: leg.suiteTypes[0]?.id ?? "",
    pricePerPerson: 0,
    childPrice: null,
    infantPrice: null,
    currency: "ZAR",
    validFrom: new Date().toISOString().slice(0, 10),
    validTo: null,
    createdAt: new Date().toISOString(),
  }
}

export function PackageLegEditor({
  leg,
  locations,
  onChange,
  onRemove,
}: PackageLegEditorProps) {
  const updateRoute = (
    routeId: string,
    key: keyof SupplierRoute,
    value: string | boolean,
  ) => {
    onChange({
      ...leg,
      routes: leg.routes.map((route) =>
        route.id === routeId ? { ...route, [key]: value } : route,
      ),
    })
  }

  const updateRateCard = (
    rateCardId: string,
    key: keyof SupplierRateCard,
    value: string | number | null,
  ) => {
    onChange({
      ...leg,
      rateCards: leg.rateCards.map((rateCard) =>
        rateCard.id === rateCardId ? { ...rateCard, [key]: value } : rateCard,
      ),
    })
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{leg.label || leg.supplierName}</CardTitle>
              <Badge variant="secondary">{SUPPLIER_KIND_LABELS[leg.supplierKind]}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{leg.supplierName}</p>
          </div>
          {onRemove ? (
            <Button type="button" size="icon" variant="outline" onClick={onRemove}>
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_8rem]">
          <div className="space-y-2">
            <Label>Leg label</Label>
            <Input
              value={leg.label}
              onChange={(event) => onChange({ ...leg, label: event.target.value })}
              placeholder={leg.supplierName}
            />
          </div>
          <div className="space-y-2">
            <Label>Order</Label>
            <NumericInput
              min="0"
              step="1"
              value={leg.sortOrder}
              onValueChange={(value) => onChange({ ...leg, sortOrder: value ?? 0 })}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Routes</h3>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onChange({ ...leg, routes: [...leg.routes, createRoute(leg.supplierId, locations)] })}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add route
            </Button>
          </div>
          <div className="space-y-3">
            {leg.routes.map((route) => (
              <div key={route.id} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_1fr_1fr_auto_auto]">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={route.name}
                    onChange={(event) => updateRoute(route.id, "name", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Origin</Label>
                  <Select
                    value={route.originLocationId || undefined}
                    onValueChange={(value) => updateRoute(route.id, "originLocationId", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
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
                <div className="space-y-2">
                  <Label>Destination</Label>
                  <Select
                    value={route.destinationLocationId || undefined}
                    onValueChange={(value) => updateRoute(route.id, "destinationLocationId", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
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
                <div className="flex items-end gap-2">
                  <Switch
                    checked={route.active}
                    onCheckedChange={(checked) => updateRoute(route.id, "active", checked)}
                  />
                  <span className="self-center text-sm text-muted-foreground">Active</span>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="self-end"
                  onClick={() =>
                    onChange({
                      ...leg,
                      routes: leg.routes.filter((item) => item.id !== route.id),
                      rateCards: leg.rateCards.filter((item) => item.routeId !== route.id),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {leg.routes.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No routes added yet.
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Rate cards</h3>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={leg.suiteTypes.length === 0 || leg.routes.length === 0}
              onClick={() => onChange({ ...leg, rateCards: [...leg.rateCards, createRateCard(leg)] })}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add rate
            </Button>
          </div>
          <div className="space-y-3">
            {leg.rateCards.map((rateCard) => (
              <div key={rateCard.id} className="grid gap-3 rounded-lg border p-3 md:grid-cols-4 xl:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
                <div className="space-y-2">
                  <Label>Suite type</Label>
                  <Select
                    value={rateCard.suiteTypeId || undefined}
                    onValueChange={(value) => updateRateCard(rateCard.id, "suiteTypeId", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {leg.suiteTypes.map((suiteType) => (
                        <SelectItem key={suiteType.id} value={suiteType.id}>
                          {suiteType.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Route</Label>
                  <Select
                    value={rateCard.routeId || undefined}
                    onValueChange={(value) => updateRateCard(rateCard.id, "routeId", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select route" />
                    </SelectTrigger>
                    <SelectContent>
                      {leg.routes.map((route) => (
                        <SelectItem key={route.id} value={route.id}>
                          {route.name || "Unnamed route"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Adult price</Label>
                  <NumericInput
                    min="0"
                    step="0.01"
                    value={rateCard.pricePerPerson}
                    onValueChange={(value) => updateRateCard(rateCard.id, "pricePerPerson", value ?? 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valid from</Label>
                  <Input
                    type="date"
                    value={rateCard.validFrom}
                    onChange={(event) => updateRateCard(rateCard.id, "validFrom", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valid to</Label>
                  <Input
                    type="date"
                    value={rateCard.validTo ?? ""}
                    onChange={(event) =>
                      updateRateCard(rateCard.id, "validTo", event.target.value || null)
                    }
                  />
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="self-end"
                  onClick={() =>
                    onChange({
                      ...leg,
                      rateCards: leg.rateCards.filter((item) => item.id !== rateCard.id),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {leg.suiteTypes.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                This supplier has no active suite types available for rate cards.
              </div>
            ) : leg.rateCards.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No rate cards added yet.
              </div>
            ) : null}
          </div>
        </section>
      </CardContent>
    </Card>
  )
}
