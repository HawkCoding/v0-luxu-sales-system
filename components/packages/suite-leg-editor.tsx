"use client"

import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
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
import type { HotelDateAnchor, PackageLeg } from "@/lib/types"
import { getSupplierVocabulary, isOptionalPackageLegKind } from "@/lib/types"
import { cn } from "@/lib/utils"
import { formatDisplayDate } from "@/lib/date-format"
import type { PassengerTotals } from "@/lib/packages/passenger-totals"
import { resolveHotelStayDates } from "@/lib/packages/hotel-dates"
import {
  createDraftUnit,
  PASSENGER_SPLIT_SUPPLIER_KINDS,
  type SuiteLegState,
  type SuiteUnitState,
} from "@/lib/packages/apply-dialog-state"

const NONE_VALUE = "__none"

/** The train leg this hotel's dates hang off, as resolved by the dialog. */
export interface HotelAnchorContext {
  trainLabel: string
  departureDate: string | null
  durationDays: number | null
}

interface SuiteLegEditorProps {
  leg: PackageLeg
  value: SuiteLegState
  onChange: (next: SuiteLegState) => void
  /** Booking totals for this leg's supplier â€” shown as the target for per-unit passenger splits. */
  expectedTotals?: PassengerTotals | null
  /** Hotel legs only â€” absent when the package has no train leg to anchor to. */
  anchorContext?: HotelAnchorContext | null
}

const ANCHOR_OPTIONS: { value: HotelDateAnchor; label: string; hint: string }[] = [
  { value: "pre", label: "Pre-train", hint: "Night(s) before the train departs" },
  { value: "post", label: "Post-train", hint: "From the day the train arrives" },
  { value: "custom", label: "Custom date", hint: "Pick the check-in date manually" },
]

export function SuiteLegEditor({
  leg,
  value,
  onChange,
  expectedTotals,
  anchorContext,
}: SuiteLegEditorProps) {
  const isHotel = leg.supplierKind === "hotel_property"
  const vocab = getSupplierVocabulary(leg.supplierKind)
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

  const nights = Math.max(1, value.nights ?? 1)
  const anchored = value.dateAnchor === "pre" || value.dateAnchor === "post"
  const stayDates = anchorContext
    ? resolveHotelStayDates(value.dateAnchor, nights, {
        departureDate: anchorContext.departureDate,
        durationDays: anchorContext.durationDays,
      })
    : null
  // Post-stay dates are counted off the train's arrival, which we can only work out from the
  // route's length â€” without it we'd silently check the guest in on the departure day.
  const missingTrainDuration =
    value.dateAnchor === "post" && anchorContext != null && anchorContext.durationDays == null

  function setAnchor(next: HotelDateAnchor) {
    onChange({ ...value, dateAnchor: next })
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-[160px] flex-1">
          <div className="text-sm font-medium">{leg.label ?? leg.supplierName}</div>
          <div className="text-xs text-muted-foreground">{leg.supplierName}</div>
        </div>
        {isHotel ? null : (
          <div className="space-y-1">
            <Label className="text-xs" htmlFor={`service-date-${leg.id}`}>Service date</Label>
            <DatePicker
              id={`service-date-${leg.id}`}
              value={value.serviceDate ?? ""}
              onChange={(date) => onChange({ ...value, serviceDate: date || null })}
              className="w-40"
              buttonClassName="h-8"
            />
          </div>
        )}
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
          {isHotel ? (
            <div className="space-y-2 rounded-md border bg-muted/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-xs">Stay dates</Label>
                <div className="flex flex-wrap gap-1">
                  {ANCHOR_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant={value.dateAnchor === option.value ? "default" : "outline"}
                      className="h-7 px-2 text-xs"
                      aria-pressed={value.dateAnchor === option.value}
                      title={option.hint}
                      disabled={option.value !== "custom" && !anchorContext}
                      onClick={() => setAnchor(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              {anchored ? (
                <p className={cn("text-xs", stayDates ? "text-muted-foreground" : "text-destructive")}>
                  {stayDates ? (
                    <>
                      Check-in <span className="font-medium text-foreground">{formatDisplayDate(stayDates.checkIn)}</span>{" "}
                      &rarr; check-out{" "}
                      <span className="font-medium text-foreground">{formatDisplayDate(stayDates.checkOut)}</span> (
                      {nights} {nights === 1 ? "night" : "nights"}
                      {anchorContext ? `, ${value.dateAnchor === "pre" ? "before" : "after"} ${anchorContext.trainLabel}` : ""})
                    </>
                  ) : (
                    "Set the train leg's service date to work out this hotel's check-in."
                  )}
                </p>
              ) : (
                <DatePicker
                  id={`service-date-${leg.id}`}
                  aria-label="Check-in date"
                  value={value.serviceDate ?? ""}
                  onChange={(date) => onChange({ ...value, serviceDate: date || null })}
                  className="w-40"
                  buttonClassName="h-8"
                />
              )}

              {missingTrainDuration ? (
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  {anchorContext?.trainLabel} has no journey length set, so the check-in falls on the departure
                  day. Set the route&apos;s duration in Suppliers, or pick a custom date.
                </p>
              ) : null}

              {!anchorContext ? (
                <p className="text-xs text-muted-foreground">
                  This package has no train leg to anchor to â€” pick the check-in date manually.
                </p>
              ) : null}
            </div>
          ) : null}

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
                  <Label>{vocab.suiteType}</Label>
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
