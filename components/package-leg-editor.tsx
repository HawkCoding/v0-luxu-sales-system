"use client"

import { Plus, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Switch } from "@/components/ui/switch"
import type {
  Location,
  SupplierKind,
  SupplierRateCard,
  SupplierRoute,
  SupplierSuiteType,
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
  /** Hotel legs only — the default stay position the apply dialog derives check-in dates from. */
  dateAnchor: "pre" | "post" | null
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

function createRoute(supplierId: string): EditableSupplierRoute {
  // Never pre-select locations — an unnoticed default silently links the
  // route to whichever locations sort first alphabetically.
  return {
    id: makeClientId(),
    supplierId,
    name: "",
    originLocationId: null,
    destinationLocationId: null,
    pickupPoint: "",
    dropoffPoint: "",
    vehicleRentalDetails: null,
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
    rateTypeId: "",
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
  const isTransport = leg.supplierKind === "transfers" || leg.supplierKind === "vehicle_rental"

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

  const routeGridClass = isTransport
    ? "grid items-start gap-2.5 rounded-lg border p-3 md:grid-cols-2 lg:grid-cols-[minmax(10rem,1fr)_minmax(8rem,0.75fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_5.5rem_2.25rem]"
    : showLocations
      ? "grid items-start gap-2.5 rounded-lg border p-3 md:grid-cols-2 lg:grid-cols-[minmax(10rem,1fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_5.5rem_2.25rem]"
      : "grid items-start gap-2.5 rounded-lg border p-3 md:grid-cols-[minmax(12rem,1fr)_5.5rem_2.25rem]"
  const packageFieldClass = "grid min-w-0 grid-rows-[2.25rem_auto] gap-1.5"
  const packageLabelClass = "flex min-h-9 items-start gap-2 leading-tight"
  const compactSelectTriggerClass = "w-full min-w-0 [&_[data-slot=select-value]]:truncate"
  const rateCardGridClass = isTransport
    ? "grid items-start gap-2.5 rounded-lg border p-3 md:grid-cols-3 lg:grid-cols-[minmax(10rem,1.4fr)_minmax(10rem,1.4fr)_minmax(6rem,0.7fr)_minmax(8rem,0.85fr)_minmax(8rem,0.85fr)_2.25rem]"
    : "grid items-start gap-2.5 rounded-lg border p-3 md:grid-cols-3 lg:grid-cols-[minmax(10rem,1.45fr)_minmax(10rem,1.45fr)_minmax(4.75rem,0.55fr)_minmax(4.75rem,0.55fr)_minmax(4.75rem,0.55fr)_minmax(8rem,0.85fr)_minmax(8rem,0.85fr)_2.25rem]"
  const rateCardFieldClass = packageFieldClass
  const rateCardLabelClass = packageLabelClass
  const compactDateInputClass = "w-full px-2 text-sm"

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
                    routes: [...leg.routes, createRoute(leg.supplierId)],
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
                <div className={packageFieldClass}>
                  <div className={packageLabelClass}>
                    <Label>Name</Label>
                    {route.existing ? (
                      <Badge variant="outline" className="text-xs">Existing</Badge>
                    ) : null}
                  </div>
                  <Input
                    title={route.name}
                    value={route.name}
                    onChange={(event) => updateRoute(route.id, "name", event.target.value)}
                    disabled={route.existing}
                  />
                </div>
                {isTransport ? (
                  <>
                    <div className={packageFieldClass}>
                      <div className={packageLabelClass}>
                        <Label>{vocab.originLabel}</Label>
                      </div>
                      <Input
                        title={route.pickupPoint ?? ""}
                        value={route.pickupPoint ?? ""}
                        onChange={(event) => updateRoute(route.id, "pickupPoint", event.target.value)}
                        disabled={route.existing}
                      />
                    </div>
                    <div className={packageFieldClass}>
                      <div className={packageLabelClass}>
                        <Label>{vocab.destinationLabel}</Label>
                      </div>
                      <Input
                        title={route.dropoffPoint ?? ""}
                        value={route.dropoffPoint ?? ""}
                        onChange={(event) => updateRoute(route.id, "dropoffPoint", event.target.value)}
                        disabled={route.existing}
                      />
                    </div>
                  </>
                ) : showLocations ? (
                  <>
                    <div className={packageFieldClass}>
                      <div className={packageLabelClass}>
                        <Label>{vocab.originLabel}</Label>
                      </div>
                      <Select
                        value={route.originLocationId || ""}
                        onValueChange={(value) => updateRoute(route.id, "originLocationId", value)}
                        disabled={route.existing}
                      >
                        <SelectTrigger
                          className={compactSelectTriggerClass}
                          title={locations.find((location) => location.id === route.originLocationId)?.name}
                        >
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
                    <div className={packageFieldClass}>
                      <div className={packageLabelClass}>
                        <Label>{vocab.destinationLabel}</Label>
                      </div>
                      <Select
                        value={route.destinationLocationId || ""}
                        onValueChange={(value) =>
                          updateRoute(route.id, "destinationLocationId", value)
                        }
                        disabled={route.existing}
                      >
                        <SelectTrigger
                          className={compactSelectTriggerClass}
                          title={locations.find((location) => location.id === route.destinationLocationId)?.name}
                        >
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
                <div className={packageFieldClass}>
                  <div className={packageLabelClass} />
                  <div className="flex h-9 items-center gap-2">
                    <Switch
                      checked={route.active}
                      onCheckedChange={(checked) => updateRoute(route.id, "active", checked)}
                      disabled={route.existing}
                    />
                    <span className="text-sm text-muted-foreground">Active</span>
                  </div>
                </div>
                {route.existing ? (
                  <div className={packageFieldClass} />
                ) : (
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="self-end h-9 w-9"
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
                className={rateCardGridClass}
              >
                <div className={rateCardFieldClass}>
                  <div className={rateCardLabelClass}>
                    <Label>{vocab.suiteType}</Label>
                    {rateCard.existing ? (
                      <Badge variant="outline" className="text-xs">Existing</Badge>
                    ) : null}
                  </div>
                  <Select
                    value={rateCard.suiteTypeId || ""}
                    onValueChange={(value) => updateRateCard(rateCard.id, "suiteTypeId", value)}
                    disabled={rateCard.existing}
                  >
                    <SelectTrigger
                      className={compactSelectTriggerClass}
                      title={leg.suiteTypes.find((suiteType) => suiteType.id === rateCard.suiteTypeId)?.name}
                    >
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
                <div className={rateCardFieldClass}>
                  <div className={rateCardLabelClass}>
                    <Label>{routeLabel}</Label>
                  </div>
                  <Select
                    value={rateCard.routeId || ""}
                    onValueChange={(value) => updateRateCard(rateCard.id, "routeId", value)}
                    disabled={rateCard.existing}
                  >
                    <SelectTrigger
                      className={compactSelectTriggerClass}
                      title={leg.routes.find((route) => route.id === rateCard.routeId)?.name}
                    >
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
                <div className={rateCardFieldClass}>
                  <div className={rateCardLabelClass}>
                    <Label>{isTransport ? "Vehicle price" : "Adult price"}</Label>
                  </div>
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
                    <div className={rateCardFieldClass}>
                      <div className={rateCardLabelClass}>
                        <Label>Child price</Label>
                      </div>
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
                    <div className={rateCardFieldClass}>
                      <div className={rateCardLabelClass}>
                        <Label>Infant price</Label>
                      </div>
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
                <div className={rateCardFieldClass}>
                  <div className={rateCardLabelClass}>
                    <Label>Valid from</Label>
                  </div>
                  <DatePicker
                    buttonClassName={compactDateInputClass}
                    value={rateCard.validFrom}
                    onChange={(value) => updateRateCard(rateCard.id, "validFrom", value ?? "")}
                    disabled={rateCard.existing}
                    aria-label="Valid from"
                  />
                </div>
                <div className={rateCardFieldClass}>
                  <div className={rateCardLabelClass}>
                    <Label>Valid to</Label>
                  </div>
                  <DatePicker
                    buttonClassName={compactDateInputClass}
                    value={rateCard.validTo ?? ""}
                    minDate={rateCard.validFrom}
                    onChange={(value) => updateRateCard(rateCard.id, "validTo", value || null)}
                    disabled={rateCard.existing}
                    aria-label="Valid to"
                  />
                </div>
                {rateCard.existing ? (
                  <div className={rateCardFieldClass} />
                ) : (
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="self-end h-9 w-9"
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
