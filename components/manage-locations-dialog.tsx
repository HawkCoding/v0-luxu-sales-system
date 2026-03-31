"use client"

import { useMemo, useState } from "react"
import { useSWRConfig } from "swr"
import { Trash2 } from "lucide-react"
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
  const [isCreating, setIsCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const sortedLocations = useMemo(
    () =>
      [...(locations ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [locations],
  )

  const resetCreateForm = () => {
    setName("")
    setCountry("South Africa")
    setRegionCode("")
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
        }),
      })

      const payload = await parseJson<{ error?: string }>(response)
      if (!response.ok) {
        toast.error(payload?.error ?? "Failed to create location")
        return
      }

      await mutate("/api/locations")
      resetCreateForm()
      toast.success("Location created")
    } catch {
      toast.error("Failed to create location")
    } finally {
      setIsCreating(false)
    }
  }

  const handleDeleteLocation = async (location: Location) => {
    const confirmed = window.confirm(
      `Delete "${location.name}"? This will fail if the location is used by a supplier route.`,
    )
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
            Create and remove destination locations used for supplier routes.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border p-3">
          <p className="mb-3 text-sm font-medium">Add location</p>
          <div className="grid gap-2 md:grid-cols-[1.6fr_1.2fr_0.8fr_auto]">
            <Input
              placeholder="Location name (e.g. Pretoria)"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Input
              placeholder="Country"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
            />
            <Input
              placeholder="Region code"
              value={regionCode}
              onChange={(event) => setRegionCode(event.target.value)}
            />
            <Button onClick={handleCreateLocation} disabled={isCreating}>
              {isCreating ? "Adding..." : "Add"}
            </Button>
          </div>
        </div>

        <div className="import-review-scroll max-h-[45vh] overflow-x-scroll rounded-md border">
          <table className="w-full min-w-[640px] table-fixed caption-bottom text-sm">
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-[48%]">Name</TableHead>
                <TableHead className="w-[32%]">Country</TableHead>
                <TableHead className="w-[88px]">Region code</TableHead>
                <TableHead className="w-[92px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    Loading locations...
                  </TableCell>
                </TableRow>
              ) : sortedLocations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    No locations yet.
                  </TableCell>
                </TableRow>
              ) : (
                sortedLocations.map((location) => (
                  <TableRow key={location.id}>
                    <TableCell className="max-w-0 font-medium">
                      <span className="block truncate">{location.name}</span>
                    </TableCell>
                    <TableCell className="max-w-0">
                      <span className="block truncate">{location.country}</span>
                    </TableCell>
                    <TableCell className="max-w-0">
                      <span className="block truncate">{location.regionCode ?? "—"}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDeleteLocation(location)}
                        disabled={deletingId === location.id}
                        aria-label={`Delete ${location.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
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
