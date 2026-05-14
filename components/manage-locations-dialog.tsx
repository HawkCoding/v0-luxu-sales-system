"use client"

import { useMemo, useState } from "react"
import { useSWRConfig } from "swr"
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useLocations } from "@/lib/use-data"
import type { Location } from "@/lib/types"

interface ManageLocationsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

async function parseJson<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.includes("application/json")) return null
  return (await response.json()) as T
}

export function ManageLocationsDialog({ open, onOpenChange }: ManageLocationsDialogProps) {
  const { data: locations, isLoading } = useLocations()
  const { mutate } = useSWRConfig()
  const [name, setName] = useState("")
  const [country, setCountry] = useState("South Africa")
  const [regionCode, setRegionCode] = useState("")
  const [parentLocationId, setParentLocationId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expandedCityIds, setExpandedCityIds] = useState<Set<string>>(new Set())

  const cityLocations = useMemo(
    () =>
      [...(locations ?? [])]
        .filter((loc) => loc.parentLocationId === null)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [locations],
  )

  const areaLocationsByParent = useMemo(() => {
    const map = new Map<string, Location[]>()
    for (const loc of locations ?? []) {
      if (loc.parentLocationId) {
        const existing = map.get(loc.parentLocationId) ?? []
        existing.push(loc)
        map.set(loc.parentLocationId, existing)
      }
    }
    for (const areas of map.values()) {
      areas.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    }
    return map
  }, [locations])

  const resetCreateForm = () => {
    setName("")
    setCountry("South Africa")
    setRegionCode("")
    setParentLocationId(null)
  }

  const toggleCity = (cityId: string) => {
    setExpandedCityIds((prev) => {
      const next = new Set(prev)
      if (next.has(cityId)) {
        next.delete(cityId)
      } else {
        next.add(cityId)
      }
      return next
    })
  }

  const handleCreateLocation = async () => {
    const normalizedName = name.trim()
    if (normalizedName.length < 2) {
      toast.error("Location name must be at least 2 characters")
      return
    }

    setIsCreating(true)
    try {
      const response = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: normalizedName,
          country: country.trim() || "South Africa",
          regionCode: regionCode.trim() || null,
          parentLocationId: parentLocationId ?? null,
        }),
      })

      const payload = await parseJson<{ error?: string }>(response)
      if (!response.ok) {
        toast.error(payload?.error ?? "Failed to create location")
        return
      }

      await mutate("/api/locations")
      resetCreateForm()
      toast.success(parentLocationId ? "Sub-area created" : "City created")
    } catch {
      toast.error("Failed to create location")
    } finally {
      setIsCreating(false)
    }
  }

  const handleDeleteLocation = async (location: Location) => {
    const hasAreas = (areaLocationsByParent.get(location.id) ?? []).length > 0
    const label = location.parentLocationId ? `sub-area "${location.name}"` : `city "${location.name}"`
    const warning = hasAreas ? ` This city has sub-areas — they will also be deleted.` : ""
    const confirmed = window.confirm(`Delete ${label}?${warning}`)
    if (!confirmed) return

    setDeletingId(location.id)
    try {
      const response = await fetch("/api/locations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: location.id }),
      })

      const payload = await parseJson<{ error?: string }>(response)
      if (!response.ok) {
        toast.error(payload?.error ?? "Failed to delete location")
        return
      }

      await mutate("/api/locations")
      toast.success("Location deleted")
    } catch {
      toast.error("Failed to delete location")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Manage Locations</DialogTitle>
          <DialogDescription>
            Create cities and sub-areas used to classify suppliers.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border p-3">
          <p className="mb-3 text-sm font-medium">Add location</p>
          <div className="mb-2 grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="loc-parent">Type</Label>
              <Select
                value={parentLocationId ?? "top"}
                onValueChange={(value) => setParentLocationId(value === "top" ? null : value)}
              >
                <SelectTrigger id="loc-parent">
                  <SelectValue placeholder="Top-level city" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="top">Top-level city</SelectItem>
                  {cityLocations.map((city) => (
                    <SelectItem key={city.id} value={city.id}>
                      Sub-area of {city.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="loc-name">Name</Label>
              <Input
                id="loc-name"
                placeholder={parentLocationId ? "e.g. CBD" : "e.g. Cape Town"}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
          </div>
          {!parentLocationId && (
            <div className="mb-2 grid gap-2 sm:grid-cols-[1fr_120px]">
              <div className="space-y-1">
                <Label htmlFor="loc-country">Country</Label>
                <Input
                  id="loc-country"
                  placeholder="Country"
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="loc-region">Region code</Label>
                <Input
                  id="loc-region"
                  placeholder="e.g. ZA-WC"
                  value={regionCode}
                  onChange={(event) => setRegionCode(event.target.value)}
                />
              </div>
            </div>
          )}
          <Button onClick={handleCreateLocation} disabled={isCreating} size="sm">
            {isCreating ? "Adding..." : "Add"}
          </Button>
        </div>

        <div className="import-review-scroll max-h-[45vh] overflow-x-scroll rounded-md border">
          <table className="w-full min-w-[540px] table-fixed caption-bottom text-sm">
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-[50%]">Name</TableHead>
                <TableHead className="w-[28%]">Country</TableHead>
                <TableHead className="w-[80px]">Region</TableHead>
                <TableHead className="w-[80px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    Loading locations...
                  </TableCell>
                </TableRow>
              ) : cityLocations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    No locations yet.
                  </TableCell>
                </TableRow>
              ) : (
                cityLocations.map((city) => {
                  const areas = areaLocationsByParent.get(city.id) ?? []
                  const isExpanded = expandedCityIds.has(city.id)
                  return (
                    <>
                      <TableRow key={city.id}>
                        <TableCell className="max-w-0 font-medium">
                          <button
                            type="button"
                            className="flex items-center gap-1 truncate text-left"
                            onClick={() => areas.length > 0 && toggleCity(city.id)}
                            aria-expanded={isExpanded}
                          >
                            {areas.length > 0 ? (
                              isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              )
                            ) : (
                              <span className="w-3.5 shrink-0" />
                            )}
                            <span className="truncate">{city.name}</span>
                            {areas.length > 0 && (
                              <span className="ml-1 shrink-0 text-xs text-muted-foreground">
                                ({areas.length})
                              </span>
                            )}
                          </button>
                        </TableCell>
                        <TableCell className="max-w-0">
                          <span className="block truncate">{city.country}</span>
                        </TableCell>
                        <TableCell className="max-w-0">
                          <span className="block truncate">{city.regionCode ?? "—"}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteLocation(city)}
                            disabled={deletingId === city.id}
                            aria-label={`Delete ${city.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isExpanded &&
                        areas.map((area) => (
                          <TableRow key={area.id} className="bg-muted/30">
                            <TableCell className="max-w-0 pl-8">
                              <span className="block truncate text-muted-foreground">
                                {area.name}
                              </span>
                            </TableCell>
                            <TableCell />
                            <TableCell />
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleDeleteLocation(area)}
                                disabled={deletingId === area.id}
                                aria-label={`Delete ${area.name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                    </>
                  )
                })
              )}
            </TableBody>
          </table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
