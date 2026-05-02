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
  TransportServiceType,
} from "@/lib/types"
import { SUPPLIER_KIND_LABELS, getSupplierVocabulary } from "@/lib/types"

export type EditableSupplierRoute = SupplierRoute & { existing?: boolean }
export type EditableSupplierRateCard = SupplierRateCard & { existing?: boolean }

export interface EditablePackageLeg {
  id: string
  supplierId: string
  supplierName: string
  supplierKind: SupplierKind
  label: string
  sortOrder: number
  routes: EditableSupplierRoute[]
  rateCards: EditableSupplierRateCard[]
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

function createRoute(
  supplierId: string,
  locations: Location[],
  hasLocations: boolean,
  isTransport: boolean,
): EditableSupplierRoute {
  const origin = hasLocations ? locations[0]?.id ?? "" : ""
  const destination = hasLocations ? locations[1]?.id ?? origin : ""

  return {
    id: makeClientId(),
    supplierId,
    name: "",
    originLocationId: isTransport ? null : origin,
    destinationLocationId: isTransport ? null : destination,
    transportServiceType: isTransport ? "transfer" : null,
    pickupPoint: "",
    dropoffPoint: "",
    includedKmPerDay: null,
    extraKmPrice: null,
    securityDeposit: null,
    oneWayFee: null,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    existing: false,
  }
}

function createRateCard(leg: EditablePackageLeg): EditableSupplierRateCard {
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
    existing: false,
  }
}

export function PackageLegEditor({
  leg,
  locations,
  onChange,
  onRemove,
}: PackageLegEditorProps) {
  const vocab = getSupplierVocabulary(leg.supplierKind)
  const routeLabel = vocab.route
  const routePluralLabel = vocab.routePlural
  const showLocations = vocab.routeHasLocations
  const isHotel = leg.supplierKind === "hotel_property"
  const isTransport = leg.supplierKind === "transfers"

  const updateRoute = (
    routeId: string,
    key: keyof SupplierRoute,
    value: string | boolean | number | null,
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

  const routeGridClass = showLocations
    ? isTransport
      ? "grid gap-3 rounded-lg border p-3 md:grid-cols-2 xl:grid-cols-4"
      : "grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_1fr_1fr_auto_auto]"
    : "grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_auto_auto]"

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
            <Label>Display order</Label>
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
        {isHotel ? (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Hotel option</h3>
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              This hotel is included as an option. Room type and meal plan are selected when applying the package to a quote.
            </div>
          </section>
        ) : (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">{routePluralLabel}</h3>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                onChange({
                  ...leg,
                    routes: [...leg.routes, createRoute(leg.supplierId, locations, showLocations, isTransport)],
                })
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Add {routeLabel.toLowerCase()}
            </Button>
          </div>
          <div className="space-y-3">
            {leg.routes.map((route) => (
              <div key={route.id} className={routeGridClass}>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>Name</Label>
                    {route.existing ? (
                      <Badge variant="outline" className="text-xs">Existing</Badge>
                    ) : null}
                  </div>
                  <Input
                    value={route.name}
                    onChange={(event) => updateRoute(route.id, "name", event.target.value)}
                    disabled={route.existing}
                  />
                </div>
                {isTransport ? (
                  <>
                    <div className="space-y-2">
                      <Label>Service type</Label>
                      <Select
                        value={route.transportServiceType ?? "transfer"}
                        onValueChange={(value: TransportServiceType) =>
                          updateRoute(route.id, "transportServiceType", value)
                        }
                        disabled={route.existing}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="transfer">Transfer</SelectItem>
                          <SelectItem value="rental">Vehicle rental</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{route.transportServiceType === "rental" ? "Rental pickup point" : vocab.originLabel}</Label>
                      <Input
                        value={route.pickupPoint ?? ""}
                        onChange={(event) => updateRoute(route.id, "pickupPoint", event.target.value)}
                        disabled={route.existing}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{route.transportServiceType === "rental" ? "Return point" : vocab.destinationLabel}</Label>
                      <Input
                        value={route.dropoffPoint ?? ""}
                        onChange={(event) => updateRoute(route.id, "dropoffPoint", event.target.value)}
                        disabled={route.existing}
                      />
                    </div>
                  </>
                ) : showLocations ? (
                  <>
                    <div className="space-y-2">
                      <Label>{vocab.originLabel}</Label>
                      <Select
                        value={route.originLocationId || undefined}
                        onValueChange={(value) => updateRoute(route.id, "originLocationId", value)}
                        disabled={route.existing}
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
                      <Label>{vocab.destinationLabel}</Label>
                      <Select
                        value={route.destinationLocationId || undefined}
                        onValueChange={(value) =>
                          updateRoute(route.id, "destinationLocationId", value)
                        }
                        disabled={route.existing}
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
                  </>
                ) : null}
                <div className="flex items-end gap-2">
                  <Switch
                    checked={route.active}
                    onCheckedChange={(checked) => updateRoute(route.id, "active", checked)}
                    disabled={route.existing}
                  />
                  <span className="self-center text-sm text-muted-foreground">Active</span>
                </div>
                {route.existing ? (
                  <div className="self-end" />
                ) : (
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
                )}
              </div>
            ))}
            {leg.routes.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No {routePluralLabel.toLowerCase()} added yet.
              </div>
            ) : null}
          </div>
        </section>
        )}

        {!isHotel ? (
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
              <div
                key={rateCard.id}
                className={
                  isTransport
                    ? "grid gap-3 rounded-lg border p-3 md:grid-cols-4 xl:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]"
                    : "grid gap-3 rounded-lg border p-3 md:grid-cols-4 xl:grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_1fr_auto]"
                }
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>{vocab.suiteType}</Label>
                    {rateCard.existing ? (
                      <Badge variant="outline" className="text-xs">Existing</Badge>
                    ) : null}
                  </div>
                  <Select
                    value={rateCard.suiteTypeId || undefined}
                    onValueChange={(value) => updateRateCard(rateCard.id, "suiteTypeId", value)}
                    disabled={rateCard.existing}
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
                  <Label>{routeLabel}</Label>
                  <Select
                    value={rateCard.routeId || undefined}
                    onValueChange={(value) => updateRateCard(rateCard.id, "routeId", value)}
                    disabled={rateCard.existing}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={`Select ${routeLabel.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {leg.routes.map((route) => (
                        <SelectItem key={route.id} value={route.id}>
                          {route.name || `Unnamed ${routeLabel.toLowerCase()}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{isTransport ? "Vehicle price" : "Adult price"}</Label>
                  <NumericInput
                    min="0"
                    step="0.01"
                    value={rateCard.pricePerPerson}
                    onValueChange={(value) => updateRateCard(rateCard.id, "pricePerPerson", value ?? 0)}
                    disabled={rateCard.existing}
                  />
                </div>
                {!isTransport ? (
                  <>
                    <div className="space-y-2">
                      <Label>Child price</Label>
                      <NumericInput
                        min="0"
                        step="0.01"
                        nullable
                        nullDisplayValue="0"
                        value={rateCard.childPrice}
                        onValueChange={(value) => updateRateCard(rateCard.id, "childPrice", value)}
                        disabled={rateCard.existing}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Infant price</Label>
                      <NumericInput
                        min="0"
                        step="0.01"
                        nullable
                        nullDisplayValue="0"
                        value={rateCard.infantPrice}
                        onValueChange={(value) => updateRateCard(rateCard.id, "infantPrice", value)}
                        disabled={rateCard.existing}
                      />
                    </div>
                  </>
                ) : null}
                <div className="space-y-2">
                  <Label>Valid from</Label>
                  <Input
                    type="date"
                    value={rateCard.validFrom}
                    onChange={(event) => updateRateCard(rateCard.id, "validFrom", event.target.value)}
                    disabled={rateCard.existing}
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
                    disabled={rateCard.existing}
                  />
                </div>
                {rateCard.existing ? (
                  <div className="self-end" />
                ) : (
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
                )}
              </div>
            ))}
            {leg.suiteTypes.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                This supplier has no active {vocab.suiteTypePlural.toLowerCase()} available for rate cards.
              </div>
            ) : leg.rateCards.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No rate cards added yet.
              </div>
            ) : null}
          </div>
        </section>
        ) : null}
      </CardContent>
    </Card>
  )
}
