"use client"

import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BufferedInput } from "@/components/ui/buffered-input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Location } from "@/lib/types"

/** One editable station row. `id` is the persisted row id, or a fresh uuid for an unsaved row. */
export interface EditableStationAddress {
  id: string
  locationId: string
  stationName: string
  streetAddress: string
  notes: string
}

const REMOVE_ICON_BUTTON_CLASS =
  "border-muted-foreground/25 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"

export function createEmptyStationAddress(): EditableStationAddress {
  return {
    id: crypto.randomUUID(),
    locationId: "",
    stationName: "",
    streetAddress: "",
    notes: "",
  }
}

interface SupplierStationAddressEditorProps {
  stations: EditableStationAddress[]
  /** Cities to choose from — sub-areas are filtered out, a station belongs to a city. */
  locations: Location[]
  onChange: (next: EditableStationAddress[]) => void
  idPrefix: string
}

/**
 * A train boards guests at a different station in every city it serves, so its boarding address
 * can't live on the supplier record the way a hotel's does. One row per city; the voucher picks
 * the row matching a leg's route origin (or its destination, on a reversed leg).
 */
export function SupplierStationAddressEditor({
  stations,
  locations,
  onChange,
  idPrefix,
}: SupplierStationAddressEditorProps) {
  const cityOptions = locations.filter((location) => !location.parentLocationId)
  const usedLocationIds = new Set(stations.map((station) => station.locationId).filter(Boolean))

  const addStation = () => {
    onChange([...stations, createEmptyStationAddress()])
  }

  const removeStation = (stationIndex: number) => {
    onChange(stations.filter((_, index) => index !== stationIndex))
  }

  const updateStation = (
    stationIndex: number,
    field: keyof Omit<EditableStationAddress, "id">,
    value: string,
  ) => {
    onChange(
      stations.map((entry, index) => (index === stationIndex ? { ...entry, [field]: value } : entry)),
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Station addresses</Label>
        <p className="text-xs text-muted-foreground">
          Where guests board and disembark in each city. The voucher shows the station matching the
          leg&apos;s route direction.
        </p>
      </div>

      {stations.length > 0 ? (
        <div className="space-y-2">
          <div className="hidden items-center gap-3 px-1 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[180px_1fr_1fr_auto]">
            <span>City</span>
            <span>Station name</span>
            <span>Street address</span>
            <span className="sr-only">Actions</span>
          </div>

          {stations.map((entry, index) => (
            <div key={entry.id} className="grid items-end gap-3 md:grid-cols-[180px_1fr_1fr_auto]">
              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-city-${entry.id}`} className="md:sr-only">
                  City
                </Label>
                <Select
                  value={entry.locationId || "none"}
                  onValueChange={(value) =>
                    updateStation(index, "locationId", value === "none" ? "" : value)
                  }
                >
                  <SelectTrigger id={`${idPrefix}-city-${entry.id}`}>
                    <SelectValue placeholder="Select city" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Select city —</SelectItem>
                    {cityOptions.map((location) => (
                      <SelectItem
                        key={location.id}
                        value={location.id}
                        // One station per city, so a city already claimed by another row is not
                        // offered again — the DB enforces the same rule with a unique index.
                        disabled={location.id !== entry.locationId && usedLocationIds.has(location.id)}
                      >
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-name-${entry.id}`} className="md:sr-only">
                  Station name
                </Label>
                <BufferedInput
                  id={`${idPrefix}-name-${entry.id}`}
                  value={entry.stationName}
                  onValueChange={(value) => updateStation(index, "stationName", value)}
                  placeholder="e.g. Rovos Rail Station"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-address-${entry.id}`} className="md:sr-only">
                  Street address
                </Label>
                <BufferedInput
                  id={`${idPrefix}-address-${entry.id}`}
                  value={entry.streetAddress}
                  onValueChange={(value) => updateStation(index, "streetAddress", value)}
                  placeholder="e.g. Capital Park, Pretoria"
                />
              </div>

              <Button
                type="button"
                size="icon"
                variant="outline"
                className={REMOVE_ICON_BUTTON_CLASS}
                aria-label="Remove station address"
                onClick={() => removeStation(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No station addresses added yet.
        </div>
      )}

      <div className="flex justify-end">
        <Button type="button" size="sm" variant="outline" onClick={addStation}>
          <Plus className="mr-2 h-4 w-4" />
          Add station
        </Button>
      </div>
    </div>
  )
}
