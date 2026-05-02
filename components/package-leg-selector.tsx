"use client"

import { Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumericInput } from "@/components/ui/numeric-input"
import type { EditablePackageLeg, EditableSupplierRateCard } from "@/components/package-leg-editor"
import type { Location } from "@/lib/types"
import { SUPPLIER_KIND_LABELS, getSupplierVocabulary } from "@/lib/types"

interface PackageLegSelectorProps {
  leg: EditablePackageLeg
  locations: Location[]
  selectedRouteIds: string[]
  onChange: (leg: EditablePackageLeg) => void
  onToggleRoute: (routeId: string) => void
  onRemove?: () => void
}

function formatAmount(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

function summarizeRateCards(rateCards: EditableSupplierRateCard[]): string {
  if (rateCards.length === 0) {
    return "0 rates"
  }

  const pricesByCurrency = new Map<string, number[]>()
  rateCards.forEach((rateCard) => {
    const currency = rateCard.currency.trim().toUpperCase() || "ZAR"
    pricesByCurrency.set(currency, [
      ...(pricesByCurrency.get(currency) ?? []),
      rateCard.pricePerPerson,
    ])
  })

  const ranges = Array.from(pricesByCurrency.entries()).map(([currency, prices]) => {
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    return min === max
      ? `${currency} ${formatAmount(min)}`
      : `${currency} ${formatAmount(min)} - ${formatAmount(max)}`
  })

  return `${rateCards.length} rates - ${ranges.join("; ")}`
}

export function PackageLegSelector({
  leg,
  locations,
  selectedRouteIds,
  onChange,
  onToggleRoute,
  onRemove,
}: PackageLegSelectorProps) {
  const vocab = getSupplierVocabulary(leg.supplierKind)
  const selectedRoutes = new Set(selectedRouteIds)
  const locationsById = new Map(locations.map((location) => [location.id, location.name]))
  const isHotel = leg.supplierKind === "hotel_property"

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
      <CardContent className="space-y-3">
        <h3 className="text-sm font-semibold">{isHotel ? "Hotel option" : vocab.routePlural}</h3>
        {isHotel ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            This hotel is included as an option. Room type and meal plan are selected when applying the package to a quote.
          </div>
        ) : leg.routes.length > 0 ? (
          <div className="space-y-2">
            {leg.routes.map((route) => {
              const routeRateCards = leg.rateCards.filter(
                (rateCard) => rateCard.routeId === route.id,
              )
              const origin = route.pickupPoint ?? (route.originLocationId ? locationsById.get(route.originLocationId) : null)
              const destination = route.dropoffPoint ?? (route.destinationLocationId ? locationsById.get(route.destinationLocationId) : null)
              const checkboxId = `${leg.id}-${route.id}`

              return (
                <label
                  key={route.id}
                  htmlFor={checkboxId}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <Checkbox
                    id={checkboxId}
                    checked={selectedRoutes.has(route.id)}
                    onCheckedChange={() => onToggleRoute(route.id)}
                    className="mt-1"
                  />
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block font-medium">
                      {route.name || `Unnamed ${vocab.route.toLowerCase()}`}
                    </span>
                    {vocab.routeHasLocations && (origin || destination) ? (
                      <span className="block text-xs text-muted-foreground">
                        {origin ?? "Unknown"} {"->"} {destination ?? "Unknown"}
                      </span>
                    ) : null}
                    <span className="block text-xs text-muted-foreground">
                      {summarizeRateCards(routeRateCards)}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            This supplier has no {vocab.routePlural.toLowerCase()} yet. Create them on the
            supplier detail page before selecting this leg for a package.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
