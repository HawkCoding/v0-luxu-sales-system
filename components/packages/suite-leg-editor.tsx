"use client"

import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
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
import type { PackageLeg } from "@/lib/types"
import { isOptionalPackageLegKind } from "@/lib/types"
import type { PassengerTotals } from "@/lib/packages/passenger-totals"
import {
  createDraftUnit,
  PASSENGER_SPLIT_SUPPLIER_KINDS,
  type SuiteLegState,
  type SuiteUnitState,
} from "@/lib/packages/apply-dialog-state"

const NONE_VALUE = "__none"

interface SuiteLegEditorProps {
  leg: PackageLeg
  value: SuiteLegState
  onChange: (next: SuiteLegState) => void
  /** Booking totals for this leg's supplier — shown as the target for per-unit passenger splits. */
  expectedTotals?: PassengerTotals | null
}

export function SuiteLegEditor({ leg, value, onChange, expectedTotals }: SuiteLegEditorProps) {
  const isHotel = leg.supplierKind === "hotel_property"
  const optional = isOptionalPackageLegKind(leg.supplierKind)
  const showPassengerSplit = PASSENGER_SPLIT_SUPPLIER_KINDS.has(leg.supplierKind)
  const activeSuiteTypes = leg.suiteTypes.filter((suiteType) => suiteType.active)

  function updateUnit(id: string, patch: Partial<SuiteUnitState>) {
    onChange({
      ...value,
      units: value.units.map((unit) =>
        unit.id === id
          ? {
              ...unit,
              ...patch,
              // Bed/layout/bathroom choices only make sense for the currently selected suite type.
              ...(patch.suiteTypeId !== undefined
                ? { bedroomTypeId: null, bedroomLayoutId: null, bathroomTypeId: null }
                : {}),
            }
          : unit,
      ),
    })
  }

  const splitSummed = value.units.reduce(
    (acc, unit) => ({
      adultCount: acc.adultCount + unit.adultCount,
      childCount: acc.childCount + unit.childCount,
      infantCount: acc.infantCount + unit.infantCount,
    }),
    { adultCount: 0, childCount: 0, infantCount: 0 },
  )
  const splitMatches =
    !expectedTotals ||
    (splitSummed.adultCount === expectedTotals.adultCount &&
      splitSummed.childCount === expectedTotals.childCount &&
      splitSummed.infantCount === expectedTotals.infantCount)

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-[160px] flex-1">
          <div className="text-sm font-medium">{leg.label ?? leg.supplierName}</div>
          <div className="text-xs text-muted-foreground">{leg.supplierName}</div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs" htmlFor={`service-date-${leg.id}`}>Service date</Label>
          <Input
            id={`service-date-${leg.id}`}
            type="date"
            value={value.serviceDate ?? ""}
            onChange={(event) => onChange({ ...value, serviceDate: event.target.value || null })}
            className="h-8 w-40"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs">
          <Checkbox
            checked={value.selected}
            onCheckedChange={(checked) => onChange({ ...value, selected: checked === true })}
          />
          {optional ? "Include in quote & voucher" : "Include in voucher"}
        </label>
      </div>

      {value.selected ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {leg.routes.length > 1 || isHotel ? (
              <div className="space-y-1.5">
                <Label>{isHotel ? "Meal plan" : "Route"}</Label>
                <Select
                  value={value.routeId ?? ""}
                  onValueChange={(routeId) => onChange({ ...value, routeId })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isHotel ? "Select meal plan" : "Select route"} />
                  </SelectTrigger>
                  <SelectContent>
                    {leg.routes.map((route) => (
                      <SelectItem key={route.id} value={route.id}>
                        {route.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {isHotel ? (
              <div className="space-y-1.5">
                <Label htmlFor={`nights-${leg.id}`}>Nights</Label>
                <Input
                  id={`nights-${leg.id}`}
                  type="number"
                  min={1}
                  value={value.nights ?? 1}
                  onChange={(event) =>
                    onChange({ ...value, nights: Math.max(1, Math.floor(Number(event.target.value) || 1)) })
                  }
                />
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {isHotel ? "Rooms" : "Suites"}
              {showPassengerSplit && expectedTotals ? (
                <span className={splitMatches ? "ml-2 font-normal" : "ml-2 font-normal text-destructive"}>
                  {splitSummed.adultCount}/{expectedTotals.adultCount} adults,{" "}
                  {splitSummed.childCount}/{expectedTotals.childCount} children,{" "}
                  {splitSummed.infantCount}/{expectedTotals.infantCount} infants
                </span>
              ) : null}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onChange({ ...value, units: [...value.units, createDraftUnit()] })}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add {isHotel ? "room" : "suite"}
            </Button>
          </div>

          {value.units.map((unit, index) => {
            const selectedSuiteType = leg.suiteTypes.find((suiteType) => suiteType.id === unit.suiteTypeId)
            const bedroomTypeIds = selectedSuiteType?.bedroomTypeIds ?? []
            const bedroomTypeNames = selectedSuiteType?.bedroomTypes ?? []
            const bedroomLayoutIds = selectedSuiteType?.bedroomLayoutIds ?? []
            const bedroomLayoutNames = selectedSuiteType?.bedroomLayouts ?? []
            const bathroomTypeIds = selectedSuiteType?.bathroomTypeIds ?? []
            const bathroomTypeNames = selectedSuiteType?.bathroomTypes ?? []

            return (
              <div key={unit.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>{isHotel ? "Room type" : "Suite type"}</Label>
                  <Select
                    value={unit.suiteTypeId ?? NONE_VALUE}
                    onValueChange={(next) => updateUnit(unit.id, { suiteTypeId: next === NONE_VALUE ? null : next })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>Not set</SelectItem>
                      {activeSuiteTypes.map((suiteType) => (
                        <SelectItem key={suiteType.id} value={suiteType.id}>
                          {suiteType.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {bedroomTypeIds.length > 0 ? (
                  <div className="space-y-1.5">
                    <Label>Bed configuration</Label>
                    <Select
                      value={unit.bedroomTypeId ?? NONE_VALUE}
                      onValueChange={(next) => updateUnit(unit.id, { bedroomTypeId: next === NONE_VALUE ? null : next })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select bed configuration" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>Not set</SelectItem>
                        {bedroomTypeIds.map((id, idx) => (
                          <SelectItem key={id} value={id}>
                            {bedroomTypeNames[idx] ?? id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {bedroomLayoutIds.length > 0 ? (
                  <div className="space-y-1.5">
                    <Label>Bedroom layout</Label>
                    <Select
                      value={unit.bedroomLayoutId ?? NONE_VALUE}
                      onValueChange={(next) => updateUnit(unit.id, { bedroomLayoutId: next === NONE_VALUE ? null : next })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select layout" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>Not set</SelectItem>
                        {bedroomLayoutIds.map((id, idx) => (
                          <SelectItem key={id} value={id}>
                            {bedroomLayoutNames[idx] ?? id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {bathroomTypeIds.length > 0 ? (
                  <div className="space-y-1.5">
                    <Label>Bathroom type</Label>
                    <Select
                      value={unit.bathroomTypeId ?? NONE_VALUE}
                      onValueChange={(next) => updateUnit(unit.id, { bathroomTypeId: next === NONE_VALUE ? null : next })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select bathroom type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>Not set</SelectItem>
                        {bathroomTypeIds.map((id, idx) => (
                          <SelectItem key={id} value={id}>
                            {bathroomTypeNames[idx] ?? id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {showPassengerSplit ? (
                  <div className="flex items-end gap-3 md:col-span-2 xl:col-span-3">
                    <div className="space-y-1.5">
                      <Label>Adults</Label>
                      <NumericInput
                        min="0"
                        step="1"
                        className="h-8 w-14 text-center"
                        value={unit.adultCount}
                        onValueChange={(next) => updateUnit(unit.id, { adultCount: next ?? 0 })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Children</Label>
                      <NumericInput
                        min="0"
                        step="1"
                        className="h-8 w-14 text-center"
                        value={unit.childCount}
                        onValueChange={(next) => updateUnit(unit.id, { childCount: next ?? 0 })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Infants</Label>
                      <NumericInput
                        min="0"
                        step="1"
                        className="h-8 w-14 text-center"
                        value={unit.infantCount}
                        onValueChange={(next) => updateUnit(unit.id, { infantCount: next ?? 0 })}
                      />
                    </div>
                  </div>
                ) : null}

                {value.units.length > 1 ? (
                  <div className="flex items-end justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Remove ${isHotel ? "room" : "suite"} ${index + 1}`}
                      onClick={() =>
                        onChange({ ...value, units: value.units.filter((item) => item.id !== unit.id) })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
            )
          })}

          <div className="space-y-1.5">
            <Label>Special requests / allergies</Label>
            <Textarea
              value={value.notes ?? ""}
              onChange={(event) => onChange({ ...value, notes: event.target.value || null })}
            />
          </div>
        </>
      ) : null}
    </div>
  )
}
