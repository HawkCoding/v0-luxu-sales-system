"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface PackageOption {
  id: string
  name: string
  slug: string
  legs: Array<{ id: string; label: string | null; sortOrder: number; supplierName: string; supplierId: string }>
}

interface PackageListResponse {
  packages?: Array<{
    id: string
    name: string
    slug: string
    legs?: Array<{ id: string; label: string | null; sort_order?: number; sortOrder?: number; supplier_id?: string; supplierId?: string; supplierName?: string; supplier?: { name?: string | null } }>
  }>
}

interface SelectionRow {
  id: string
  package_leg_id: string
  selected: boolean
  supplier_id: string | null
  route_id: string | null
  suite_type_id: string | null
  service_date: string | null
  notes: string | null
}

interface PackageStateResponse {
  packageId: string | null
  packageTravelDate: string | null
  selections: SelectionRow[]
}

interface BookingPackageSectionProps {
  jobId: string
}

const NONE_VALUE = "__none"

export function BookingPackageSection({ jobId }: BookingPackageSectionProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [packages, setPackages] = useState<PackageOption[]>([])
  const [packageId, setPackageId] = useState<string | null>(null)
  const [packageTravelDate, setPackageTravelDate] = useState<string>("")
  const [selections, setSelections] = useState<SelectionRow[]>([])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [packagesRes, packageStateRes] = await Promise.all([
        fetch("/api/packages"),
        fetch(`/api/jobs/${jobId}/package`),
      ])
      const packagesJson = (await packagesRes.json()) as PackageListResponse
      const packageState = (await packageStateRes.json()) as PackageStateResponse

      const normalizedPackages: PackageOption[] = (packagesJson.packages ?? []).map((pkg) => ({
        id: pkg.id,
        name: pkg.name,
        slug: pkg.slug,
        legs: (pkg.legs ?? [])
          .map((leg) => ({
            id: leg.id,
            label: leg.label ?? null,
            sortOrder: leg.sortOrder ?? leg.sort_order ?? 0,
            supplierId: leg.supplierId ?? leg.supplier_id ?? "",
            supplierName: leg.supplierName ?? leg.supplier?.name ?? "Supplier",
          }))
          .sort((a, b) => a.sortOrder - b.sortOrder),
      }))

      setPackages(normalizedPackages)
      setPackageId(packageState.packageId ?? null)
      setPackageTravelDate(packageState.packageTravelDate ?? "")
      setSelections(packageState.selections ?? [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load package data")
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const activePackage = useMemo(() => packages.find((pkg) => pkg.id === packageId) ?? null, [packageId, packages])

  async function applyPackage(nextPackageId: string | null) {
    setSaving(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/package`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: nextPackageId,
          packageTravelDate: packageTravelDate || null,
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
              void applyPackage(next)
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
          <Label htmlFor="booking-package-date">Travel date</Label>
          <Input
            id="booking-package-date"
            type="date"
            value={packageTravelDate}
            disabled={!packageId || saving}
            onChange={(event) => setPackageTravelDate(event.target.value)}
            onBlur={() => packageId && applyPackage(packageId)}
          />
        </div>
      </div>

      {activePackage && selections.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Selections</h3>
          <ul className="divide-y rounded-md border">
            {selections
              .slice()
              .sort((a, b) => {
                const legA = activePackage.legs.find((leg) => leg.id === a.package_leg_id)
                const legB = activePackage.legs.find((leg) => leg.id === b.package_leg_id)
                return (legA?.sortOrder ?? 0) - (legB?.sortOrder ?? 0)
              })
              .map((selection) => {
                const leg = activePackage.legs.find((l) => l.id === selection.package_leg_id)
                return (
                  <li key={selection.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                    <div className="flex-1 min-w-[160px]">
                      <div className="font-medium">{leg?.label ?? leg?.supplierName ?? "Leg"}</div>
                      <div className="text-xs text-muted-foreground">{leg?.supplierName ?? ""}</div>
                    </div>
                    <Input
                      type="date"
                      value={selection.service_date ?? ""}
                      onChange={(event) => persistSelection(selection.package_leg_id, { service_date: event.target.value || null })}
                      className="h-8 w-40"
                      aria-label={`Service date for ${leg?.label ?? "leg"}`}
                    />
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={selection.selected}
                        onChange={(event) => persistSelection(selection.package_leg_id, { selected: event.target.checked })}
                      />
                      Include in voucher
                    </label>
                  </li>
                )
              })}
          </ul>
        </div>
      ) : null}

      {!activePackage ? (
        <p className="text-sm text-muted-foreground">
          Assign a package to populate the voucher service blocks. Each leg becomes a service block on the voucher.
        </p>
      ) : null}
    </section>
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
