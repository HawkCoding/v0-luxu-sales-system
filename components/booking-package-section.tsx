"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import type { BookingTransportRequest, Package, PackageDetail, PackageLeg } from "@/lib/types"

interface SelectionUnitRow {
  id: string
  suite_type_id: string | null
  bedroom_type_id: string | null
  bedroom_layout_id: string | null
  bathroom_type_id: string | null
  adult_count: number
  child_count: number
  infant_count: number
  sort_order: number
}

interface SelectionRow {
  id: string
  package_leg_id: string
  selected: boolean
  supplier_id: string | null
  route_id: string | null
  suite_type_id: string | null
  service_date: string | null
  nights: number | null
  notes: string | null
  units: SelectionUnitRow[]
}

interface PackageStateResponse {
  packageId: string | null
  tripStartDate: string | null
  tripEndDate: string | null
  selections: SelectionRow[]
}

interface BookingPackageSectionProps {
  jobId: string
}

const NONE_VALUE = "__none"

const TRANSPORT_SUPPLIER_KINDS = new Set<PackageLeg["supplierKind"]>(["transfers", "vehicle_rental"])
const PASSENGER_SPLIT_SUPPLIER_KINDS = new Set<PackageLeg["supplierKind"]>(["train_operator", "tour_operator", "airline"])

let unitDraftCounter = 0
function createDraftUnit(): SelectionUnitRow {
  unitDraftCounter += 1
  return {
    id: `draft-${unitDraftCounter}`,
    suite_type_id: null,
    bedroom_type_id: null,
    bedroom_layout_id: null,
    bathroom_type_id: null,
    adult_count: 0,
    child_count: 0,
    infant_count: 0,
    sort_order: 0,
  }
}

function toDateTimeLocalValue(value: string | null | undefined): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function fromDateTimeLocalValue(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function createDraftTransportRequest(leg: PackageLeg): BookingTransportRequest {
  const now = new Date().toISOString()
  const isRental = leg.supplierKind === "vehicle_rental"
  return {
    id: crypto.randomUUID(),
    bookingId: "",
    serviceType: isRental ? "rental" : "transfer",
    supplierId: leg.supplierId,
    routeId: null,
    suiteTypeId: null,
    packageLegId: leg.id,
    pickupPoint: "",
    dropoffPoint: "",
    pickupAt: null,
    rentalDetails: isRental
      ? { transportRequestId: "", returnAt: null, returnCutoffTime: null, createdAt: now, updatedAt: now }
      : null,
    passengerCount: null,
    luggageCount: null,
    flightNumber: null,
    notes: null,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  }
}

export function BookingPackageSection({ jobId }: BookingPackageSectionProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [packages, setPackages] = useState<Package[]>([])
  const [packageId, setPackageId] = useState<string | null>(null)
  const [packageDetail, setPackageDetail] = useState<PackageDetail | null>(null)
  const [tripStartDate, setTripStartDate] = useState<string>("")
  const [tripEndDate, setTripEndDate] = useState<string>("")
  const [selections, setSelections] = useState<SelectionRow[]>([])
  const [transportRequests, setTransportRequests] = useState<BookingTransportRequest[]>([])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [packagesRes, packageStateRes, transportRes] = await Promise.all([
        fetch("/api/packages"),
        fetch(`/api/jobs/${jobId}/package`),
        fetch(`/api/jobs/${jobId}/transport-requests`),
      ])
      const packagesJson = (await packagesRes.json()) as Package[]
      const packageState = (await packageStateRes.json()) as PackageStateResponse
      const transportJson = (await transportRes.json()) as BookingTransportRequest[]

      setPackages(packagesJson ?? [])
      setPackageId(packageState.packageId ?? null)
      setTripStartDate(packageState.tripStartDate ?? "")
      setTripEndDate(packageState.tripEndDate ?? "")
      setSelections(packageState.selections ?? [])
      setTransportRequests(transportJson ?? [])

      const activeSlug = packageState.packageId
        ? (packagesJson ?? []).find((pkg) => pkg.id === packageState.packageId)?.slug ?? null
        : null

      if (activeSlug) {
        const detailRes = await fetch(`/api/packages/${activeSlug}`)
        setPackageDetail(detailRes.ok ? ((await detailRes.json()) as PackageDetail) : null)
      } else {
        setPackageDetail(null)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load package data")
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const legs = useMemo(
    () => (packageDetail?.legs ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [packageDetail],
  )

  const tripDatesValid = Boolean(tripStartDate) && Boolean(tripEndDate) && tripEndDate >= tripStartDate

  async function applyPackage(nextPackageId: string | null) {
    setSaving(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/package`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: nextPackageId,
          tripStartDate: nextPackageId ? tripStartDate || null : null,
          tripEndDate: nextPackageId ? tripEndDate || null : null,
        }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? "Failed to update package assignment")
      }
      toast.success(nextPackageId ? "Package applied to booking" : "Package cleared")
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update package")
    } finally {
      setSaving(false)
    }
  }

  async function persistSelection(legId: string, patch: Partial<Pick<SelectionRow, "selected" | "service_date" | "notes">>) {
    setSelections((prev) => prev.map((row) => (row.package_leg_id === legId ? { ...row, ...patch } : row)))
    setSaving(true)
    try {
      const body = {
        selections: [
          {
            packageLegId: legId,
            ...(patch.selected !== undefined ? { selected: patch.selected } : {}),
            ...(patch.service_date !== undefined ? { serviceDate: patch.service_date } : {}),
            ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
          },
        ],
      }
      const response = await fetch(`/api/jobs/${jobId}/package-selections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}))
        throw new Error(errBody.error ?? "Failed to update selection")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save selection")
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  async function saveUnitsForLeg(legId: string, units: SelectionUnitRow[], nights: number | null) {
    setSaving(true)
    try {
      const body = {
        selections: [
          {
            packageLegId: legId,
            nights,
            units: units.map((unit) => ({
              id: unit.id.startsWith("draft-") ? undefined : unit.id,
              suiteTypeId: unit.suite_type_id,
              bedroomTypeId: unit.bedroom_type_id,
              bedroomLayoutId: unit.bedroom_layout_id,
              bathroomTypeId: unit.bathroom_type_id,
              adultCount: unit.adult_count,
              childCount: unit.child_count,
              infantCount: unit.infant_count,
            })),
          },
        ],
      }
      const response = await fetch(`/api/jobs/${jobId}/package-selections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save selection")
      }
      const updated = ((payload.selections ?? []) as SelectionRow[]).find((row) => row.package_leg_id === legId)
      if (updated) {
        setSelections((prev) => prev.map((row) => (row.package_leg_id === legId ? updated : row)))
      }
      toast.success("Selection saved")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save selection")
    } finally {
      setSaving(false)
    }
  }

  async function saveTransportRequestsForLeg(legId: string, legRequests: BookingTransportRequest[]) {
    setSaving(true)
    try {
      const otherRequests = transportRequests.filter((request) => request.packageLegId !== legId)
      const combined = [...otherRequests, ...legRequests]
      const response = await fetch(`/api/jobs/${jobId}/transport-requests`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transportRequests: combined.map((request, index) => ({
            id: request.id,
            serviceType: request.serviceType,
            supplierId: request.supplierId,
            routeId: request.routeId,
            suiteTypeId: request.suiteTypeId,
            packageLegId: request.packageLegId,
            pickupPoint: request.pickupPoint,
            dropoffPoint: request.dropoffPoint,
            pickupAt: request.pickupAt,
            rentalDetails:
              request.serviceType === "rental"
                ? {
                    returnAt: request.rentalDetails?.returnAt ?? null,
                    returnCutoffTime: request.rentalDetails?.returnCutoffTime ?? null,
                  }
                : null,
            passengerCount: request.passengerCount,
            luggageCount: request.luggageCount,
            flightNumber: request.flightNumber,
            notes: request.notes,
            sortOrder: index,
          })),
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save transport requests")
      }
      setTransportRequests(payload as BookingTransportRequest[])
      toast.success("Transport details saved")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save transport requests")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading package…
      </div>
    )
  }

  return (
    <section className="space-y-4 rounded-md border bg-card p-4" aria-label="Booking package">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <Label htmlFor="booking-package-select">Package</Label>
          <Select
            value={packageId ?? NONE_VALUE}
            onValueChange={(value) => {
              const next = value === NONE_VALUE ? null : value
              setPackageId(next)
              if (!next) {
                void applyPackage(null)
                return
              }
              if (tripStartDate && tripEndDate && tripEndDate >= tripStartDate) {
                void applyPackage(next)
              }
            }}
            disabled={saving}
          >
            <SelectTrigger id="booking-package-select" size="sm" className="min-w-[240px]">
              <SelectValue placeholder="Choose a package" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>No package</SelectItem>
              {packages.map((pkg) => (
                <SelectItem key={pkg.id} value={pkg.id}>
                  {pkg.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="booking-package-start-date">Trip start date</Label>
          <Input
            id="booking-package-start-date"
            type="date"
            value={tripStartDate}
            disabled={!packageId || saving}
            onChange={(event) => setTripStartDate(event.target.value)}
            onBlur={() => packageId && tripDatesValid && applyPackage(packageId)}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="booking-package-end-date">Trip end date</Label>
          <Input
            id="booking-package-end-date"
            type="date"
            value={tripEndDate}
            disabled={!packageId || saving}
            onChange={(event) => setTripEndDate(event.target.value)}
            onBlur={() => packageId && tripDatesValid && applyPackage(packageId)}
          />
        </div>
      </div>

      {packageId && !tripDatesValid ? (
        <p className="text-sm text-destructive">
          Trip start and end dates are required to apply this package{tripStartDate && tripEndDate ? " (end date must be on or after the start date)" : ""}.
        </p>
      ) : null}

      {packageDetail && legs.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Selections</h3>
          {legs.map((leg) => {
            const selection = selections.find((row) => row.package_leg_id === leg.id)
            if (!selection) return null

            if (TRANSPORT_SUPPLIER_KINDS.has(leg.supplierKind)) {
              return (
                <TransportLegUnits
                  key={leg.id}
                  leg={leg}
                  requests={transportRequests.filter((request) => request.packageLegId === leg.id)}
                  saving={saving}
                  onSave={(legRequests) => saveTransportRequestsForLeg(leg.id, legRequests)}
                />
              )
            }

            return (
              <TrainHotelLegUnits
                key={leg.id}
                leg={leg}
                selection={selection}
                saving={saving}
                onSaveUnits={(units, nights) => saveUnitsForLeg(leg.id, units, nights)}
                onServiceDateChange={(value) => persistSelection(leg.id, { service_date: value })}
                onSelectedChange={(value) => persistSelection(leg.id, { selected: value })}
                onNotesChange={(value) => persistSelection(leg.id, { notes: value })}
              />
            )
          })}
        </div>
      ) : null}

      {!packageDetail ? (
        <p className="text-sm text-muted-foreground">
          Assign a package to populate the voucher service blocks. Each leg becomes a service block on the voucher.
        </p>
      ) : null}
    </section>
  )
}

interface TransportLegUnitsProps {
  leg: PackageLeg
  requests: BookingTransportRequest[]
  saving: boolean
  onSave: (requests: BookingTransportRequest[]) => Promise<void> | void
}

function TransportLegUnits({ leg, requests, saving, onSave }: TransportLegUnitsProps) {
  const isRental = leg.supplierKind === "vehicle_rental"
  const [units, setUnits] = useState<BookingTransportRequest[]>(
    requests.length > 0 ? requests : [createDraftTransportRequest(leg)],
  )

  useEffect(() => {
    setUnits(requests.length > 0 ? requests : [createDraftTransportRequest(leg)])
  }, [requests, leg])

  function updateUnit(id: string, patch: Partial<BookingTransportRequest>) {
    setUnits((prev) => prev.map((unit) => (unit.id === id ? { ...unit, ...patch } : unit)))
  }

  function updateRentalDetails(id: string, patch: Partial<NonNullable<BookingTransportRequest["rentalDetails"]>>) {
    setUnits((prev) =>
      prev.map((unit) =>
        unit.id === id
          ? {
              ...unit,
              rentalDetails: {
                transportRequestId: unit.id,
                returnAt: null,
                returnCutoffTime: null,
                createdAt: unit.createdAt,
                updatedAt: unit.updatedAt,
                ...unit.rentalDetails,
                ...patch,
              },
            }
          : unit,
      ),
    )
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{leg.label ?? leg.supplierName}</div>
          <div className="text-xs text-muted-foreground">
            {leg.supplierName} — {isRental ? "Vehicle rental" : "Transfer"}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setUnits((prev) => [...prev, createDraftTransportRequest(leg)])}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add {isRental ? "vehicle" : "transfer"}
          </Button>
          <Button type="button" size="sm" disabled={saving} onClick={() => onSave(units)}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {units.map((unit, index) => (
        <div key={unit.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5">
            <Label>{isRental ? "Pickup point" : "Pickup"}</Label>
            <Input
              value={unit.pickupPoint}
              onChange={(event) => updateUnit(unit.id, { pickupPoint: event.target.value })}
              placeholder="Airport, hotel, address..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>{isRental ? "Return point" : "Drop-off"}</Label>
            <Input
              value={unit.dropoffPoint}
              onChange={(event) => updateUnit(unit.id, { dropoffPoint: event.target.value })}
              placeholder="Airport, hotel, address..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Pickup date/time</Label>
            <Input
              type="datetime-local"
              value={toDateTimeLocalValue(unit.pickupAt)}
              onChange={(event) => updateUnit(unit.id, { pickupAt: fromDateTimeLocalValue(event.target.value) })}
            />
          </div>
          {isRental ? (
            <div className="space-y-1.5">
              <Label>Return date/time</Label>
              <Input
                type="datetime-local"
                value={toDateTimeLocalValue(unit.rentalDetails?.returnAt)}
                onChange={(event) => updateRentalDetails(unit.id, { returnAt: fromDateTimeLocalValue(event.target.value) })}
              />
            </div>
          ) : null}
          {leg.suiteTypes.length > 0 ? (
            <div className="space-y-1.5">
              <Label>Vehicle category</Label>
              <Select
                value={unit.suiteTypeId ?? NONE_VALUE}
                onValueChange={(value) => updateUnit(unit.id, { suiteTypeId: value === NONE_VALUE ? null : value })}
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
          ) : null}
          <div className="space-y-1.5">
            <Label>Passengers</Label>
            <NumericInput
              min="0"
              step="1"
              nullable
              value={unit.passengerCount}
              onValueChange={(value) => updateUnit(unit.id, { passengerCount: value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Luggage</Label>
            <NumericInput
              min="0"
              step="1"
              nullable
              value={unit.luggageCount}
              onValueChange={(value) => updateUnit(unit.id, { luggageCount: value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Flight number</Label>
            <Input
              value={unit.flightNumber ?? ""}
              onChange={(event) => updateUnit(unit.id, { flightNumber: event.target.value || null })}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2 xl:col-span-3">
            <Label>Special requests / allergies</Label>
            <Textarea
              value={unit.notes ?? ""}
              onChange={(event) => updateUnit(unit.id, { notes: event.target.value || null })}
            />
          </div>
          {units.length > 1 ? (
            <div className="flex items-end justify-end">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Remove ${isRental ? "vehicle" : "transfer"} ${index + 1}`}
                onClick={() => setUnits((prev) => prev.filter((item) => item.id !== unit.id))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

interface TrainHotelLegUnitsProps {
  leg: PackageLeg
  selection: SelectionRow
  saving: boolean
  onSaveUnits: (units: SelectionUnitRow[], nights: number | null) => Promise<void> | void
  onServiceDateChange: (value: string | null) => void
  onSelectedChange: (value: boolean) => void
  onNotesChange: (value: string | null) => void
}

function TrainHotelLegUnits({
  leg,
  selection,
  saving,
  onSaveUnits,
  onServiceDateChange,
  onSelectedChange,
  onNotesChange,
}: TrainHotelLegUnitsProps) {
  const isHotel = leg.supplierKind === "hotel_property"
  const showPassengerSplit = PASSENGER_SPLIT_SUPPLIER_KINDS.has(leg.supplierKind)

  const [units, setUnits] = useState<SelectionUnitRow[]>(
    selection.units.length > 0 ? selection.units : [createDraftUnit()],
  )
  const [nights, setNights] = useState<string>(selection.nights ? String(selection.nights) : "")

  useEffect(() => {
    setUnits(selection.units.length > 0 ? selection.units : [createDraftUnit()])
    setNights(selection.nights ? String(selection.nights) : "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.units, selection.nights])

  function updateUnit(id: string, patch: Partial<SelectionUnitRow>) {
    setUnits((prev) =>
      prev.map((unit) =>
        unit.id === id
          ? {
              ...unit,
              ...patch,
              // Bed/layout/bathroom choices only make sense for the currently selected suite type.
              ...(patch.suite_type_id !== undefined
                ? { bedroom_type_id: null, bedroom_layout_id: null, bathroom_type_id: null }
                : {}),
            }
          : unit,
      ),
    )
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1 min-w-[160px]">
          <div className="text-sm font-medium">{leg.label ?? leg.supplierName}</div>
          <div className="text-xs text-muted-foreground">{leg.supplierName}</div>
        </div>
        <Input
          type="date"
          value={selection.service_date ?? ""}
          onChange={(event) => onServiceDateChange(event.target.value || null)}
          className="h-8 w-40"
          aria-label={`Service date for ${leg.label ?? "leg"}`}
        />
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={selection.selected}
            onChange={(event) => onSelectedChange(event.target.checked)}
          />
          Include in voucher
        </label>
      </div>

      {isHotel ? (
        <div className="space-y-1.5 max-w-[160px]">
          <Label>Nights</Label>
          <Input
            type="number"
            min={1}
            value={nights}
            onChange={(event) => setNights(event.target.value)}
          />
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {isHotel ? "Rooms" : "Suites"}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setUnits((prev) => [...prev, createDraftUnit()])}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add {isHotel ? "room" : "suite"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={() => onSaveUnits(units, isHotel ? Math.max(1, Number(nights) || 1) : null)}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {units.map((unit, index) => {
        const selectedSuiteType = leg.suiteTypes.find((suiteType) => suiteType.id === unit.suite_type_id)
        const bedroomTypeIds = selectedSuiteType?.bedroomTypeIds ?? []
        const bedroomTypeNames = selectedSuiteType?.bedroomTypes ?? []
        const bedroomLayoutIds = selectedSuiteType?.bedroomLayoutIds ?? []
        const bedroomLayoutNames = selectedSuiteType?.bedroomLayouts ?? []
        const bathroomTypeIds = selectedSuiteType?.bathroomTypeIds ?? []
        const bathroomTypeNames = selectedSuiteType?.bathroomTypes ?? []

        return (
          <div key={unit.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label>{isHotel ? "Room type" : "Suite type"}</Label>
              <Select
                value={unit.suite_type_id ?? NONE_VALUE}
                onValueChange={(value) => updateUnit(unit.id, { suite_type_id: value === NONE_VALUE ? null : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
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

            {bedroomTypeIds.length > 0 ? (
              <div className="space-y-1.5">
                <Label>Bed configuration</Label>
                <Select
                  value={unit.bedroom_type_id ?? NONE_VALUE}
                  onValueChange={(value) => updateUnit(unit.id, { bedroom_type_id: value === NONE_VALUE ? null : value })}
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
                  value={unit.bedroom_layout_id ?? NONE_VALUE}
                  onValueChange={(value) => updateUnit(unit.id, { bedroom_layout_id: value === NONE_VALUE ? null : value })}
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
                  value={unit.bathroom_type_id ?? NONE_VALUE}
                  onValueChange={(value) => updateUnit(unit.id, { bathroom_type_id: value === NONE_VALUE ? null : value })}
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
              <>
                <div className="space-y-1.5">
                  <Label>Adults</Label>
                  <NumericInput
                    min="0"
                    step="1"
                    value={unit.adult_count}
                    onValueChange={(value) => updateUnit(unit.id, { adult_count: value ?? 0 })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Children</Label>
                  <NumericInput
                    min="0"
                    step="1"
                    value={unit.child_count}
                    onValueChange={(value) => updateUnit(unit.id, { child_count: value ?? 0 })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Infants</Label>
                  <NumericInput
                    min="0"
                    step="1"
                    value={unit.infant_count}
                    onValueChange={(value) => updateUnit(unit.id, { infant_count: value ?? 0 })}
                  />
                </div>
              </>
            ) : null}

            {units.length > 1 ? (
              <div className="flex items-end justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`Remove ${isHotel ? "room" : "suite"} ${index + 1}`}
                  onClick={() => setUnits((prev) => prev.filter((item) => item.id !== unit.id))}
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
          value={selection.notes ?? ""}
          onChange={(event) => onNotesChange(event.target.value || null)}
        />
      </div>
    </div>
  )
}

interface SendVoucherButtonProps {
  voucherId: string | null
  bookingNumber: string
  disabled?: boolean
  onSent?: () => Promise<void> | void
}

export function SendVoucherButton({ voucherId, bookingNumber, disabled, onSent }: SendVoucherButtonProps) {
  const [sending, setSending] = useState(false)

  async function handleSend() {
    if (!voucherId) {
      toast.error("Generate the voucher PDF before sending")
      return
    }
    setSending(true)
    try {
      const response = await fetch(`/api/vouchers/${voucherId}/send`, { method: "POST" })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body.error ?? "Voucher could not be sent")
      }
      toast.success(`Voucher ${bookingNumber} sent`)
      await onSent?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Voucher could not be sent")
    } finally {
      setSending(false)
    }
  }

  return (
    <Button size="sm" variant="default" disabled={disabled || sending || !voucherId} onClick={handleSend}>
      {sending ? "Sending…" : "Send Voucher"}
    </Button>
  )
}
