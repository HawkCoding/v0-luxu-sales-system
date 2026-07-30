"use client"

import { Plus, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { NumericInput } from "@/components/ui/numeric-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { BookingTransportRequest, PackageLeg, RateType } from "@/lib/types"
import {
  createDraftTransportRequest,
  type TransportLegState,
} from "@/lib/packages/apply-dialog-state"
import { RateTypeSelect } from "@/components/rate-type-select"

const NONE_VALUE = "__none"

interface TransportLegEditorProps {
  leg: PackageLeg
  value: TransportLegState
  onChange: (next: TransportLegState) => void
  /** Active (non-archived) rate types — shows the per-leg rate type selector when non-empty. */
  rateTypes?: RateType[]
}

export function TransportLegEditor({ leg, value, onChange, rateTypes = [] }: TransportLegEditorProps) {
  const isRental = leg.supplierKind === "vehicle_rental"

  function updateRequest(id: string, patch: Partial<BookingTransportRequest>) {
    onChange({
      ...value,
      requests: value.requests.map((request) => (request.id === id ? { ...request, ...patch } : request)),
    })
  }

  /** Routes are quick-fill templates: picking one pre-fills empty pickup/drop-off fields but never
   * overwrites what the salesperson already typed. */
  function applyRouteTemplate(routeId: string) {
    const route = leg.routes.find((candidate) => candidate.id === routeId)
    onChange({
      ...value,
      routeId,
      requests: value.requests.map((request) => ({
        ...request,
        pickupPoint: request.pickupPoint.trim() ? request.pickupPoint : route?.pickupPoint ?? "",
        dropoffPoint: request.dropoffPoint.trim() ? request.dropoffPoint : route?.dropoffPoint ?? "",
      })),
    })
  }

  function updateRentalDetails(id: string, patch: Partial<NonNullable<BookingTransportRequest["rentalDetails"]>>) {
    onChange({
      ...value,
      requests: value.requests.map((request) =>
        request.id === id
          ? {
              ...request,
              rentalDetails: {
                transportRequestId: request.id,
                returnAt: null,
                returnCutoffTime: null,
                createdAt: request.createdAt,
                updatedAt: request.updatedAt,
                ...request.rentalDetails,
                ...patch,
              },
            }
          : request,
      ),
    })
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <div className="text-sm font-medium">{leg.label ?? leg.supplierName}</div>
            {value.origin === "auto" && (
              <Badge
                variant="secondary"
                className="text-[10px] h-4"
                title="Filled automatically from the enquiry — edit any field, or use Confirm services, to accept it"
              >
                Auto-filled
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {leg.supplierName} — {isRental ? "Vehicle rental" : "Transfer"}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs">
            <Checkbox
              checked={value.selected}
              onCheckedChange={(checked) => onChange({ ...value, selected: checked === true })}
            />
            Include in quote & voucher
          </label>
          {value.selected ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                onChange({ ...value, requests: [...value.requests, createDraftTransportRequest(leg, value.routeId)] })
              }
            >
              <Plus className="mr-1 h-3 w-3" />
              Add {isRental ? "vehicle" : "transfer"}
            </Button>
          ) : null}
        </div>
      </div>

      {value.selected && leg.routes.length > 0 ? (
        <div className="max-w-[280px] space-y-1.5">
          <Label>{isRental ? "Rental route template" : "Transfer route template"}</Label>
          <Select value={value.routeId ?? ""} onValueChange={applyRouteTemplate}>
            <SelectTrigger>
              <SelectValue placeholder="Quick-fill from a route (optional)" />
            </SelectTrigger>
            <SelectContent>
              {leg.routes.map((route) => (
                <SelectItem key={route.id} value={route.id}>
                  {route.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Pre-fills empty pickup/drop-off fields — documents always show what you type below.
          </p>
        </div>
      ) : null}

      {value.selected ? (
        <RateTypeSelect
          rateTypes={rateTypes}
          value={value.rateTypeId}
          onChange={(rateTypeId) => onChange({ ...value, rateTypeId })}
          id={`rate-type-${leg.id}`}
          className="max-w-[280px]"
        />
      ) : null}

      {value.selected
        ? value.requests.map((request, index) => (
            <div key={request.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-1.5">
                <Label>{isRental ? "Pickup point" : "Pickup"}</Label>
                <Input
                  value={request.pickupPoint}
                  onChange={(event) => updateRequest(request.id, { pickupPoint: event.target.value })}
                  placeholder=""
                />
              </div>
              <div className="space-y-1.5">
                <Label>{isRental ? "Return point" : "Drop-off"}</Label>
                <Input
                  value={request.dropoffPoint}
                  onChange={(event) => updateRequest(request.id, { dropoffPoint: event.target.value })}
                  placeholder=""
                />
              </div>
              <div className="space-y-1.5">
                <Label>Pickup date/time</Label>
                <DateTimePicker
                  value={request.pickupAt}
                  onChange={(pickupAt) => updateRequest(request.id, { pickupAt })}
                  aria-label="Pickup date"
                />
              </div>
              {isRental ? (
                <div className="space-y-1.5">
                  <Label>Return date/time</Label>
                  <DateTimePicker
                    value={request.rentalDetails?.returnAt}
                    onChange={(returnAt) => updateRentalDetails(request.id, { returnAt })}
                    aria-label="Return date"
                  />
                </div>
              ) : null}
              {leg.suiteTypes.length > 0 ? (
                <div className="space-y-1.5">
                  <Label>Vehicle category</Label>
                  <Select
                    value={request.suiteTypeId ?? NONE_VALUE}
                    onValueChange={(next) =>
                      updateRequest(request.id, { suiteTypeId: next === NONE_VALUE ? null : next })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>Not set</SelectItem>
                      {leg.suiteTypes.map((suiteType) => (
                        <SelectItem key={suiteType.id} value={suiteType.id}>
                          {suiteType.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Vehicle category</Label>
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    No vehicle categories configured for {leg.supplierName} — add one under Suppliers before booking it.
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Passengers</Label>
                <NumericInput
                  min="0"
                  step="1"
                  nullable
                  value={request.passengerCount}
                  onValueChange={(next) => updateRequest(request.id, { passengerCount: next })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Luggage</Label>
                <NumericInput
                  min="0"
                  step="1"
                  nullable
                  value={request.luggageCount}
                  onValueChange={(next) => updateRequest(request.id, { luggageCount: next })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Flight number</Label>
                <Input
                  value={request.flightNumber ?? ""}
                  onChange={(event) => updateRequest(request.id, { flightNumber: event.target.value || null })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Price override</Label>
                <NumericInput
                  min="0"
                  step="0.01"
                  nullable
                  value={request.priceOverride}
                  onValueChange={(next) => updateRequest(request.id, { priceOverride: next })}
                  placeholder="Rate card price"
                  aria-label="Price override"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Special requests / allergies</Label>
                <Textarea
                  value={request.notes ?? ""}
                  onChange={(event) => updateRequest(request.id, { notes: event.target.value || null })}
                />
              </div>
              {value.requests.length > 1 ? (
                <div className="flex items-end justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={`Remove ${isRental ? "vehicle" : "transfer"} ${index + 1}`}
                    onClick={() =>
                      onChange({ ...value, requests: value.requests.filter((item) => item.id !== request.id) })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>
          ))
        : null}
    </div>
  )
}
