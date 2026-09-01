"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { CommissionKind } from "@/lib/types"

export function DefaultCommissionSettingsCard({ canEdit }: { canEdit: boolean }) {
  const [commissionType, setCommissionType] = useState<CommissionKind>("percent")
  const [commissionValue, setCommissionValue] = useState("0")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetch("/api/settings/commission")
      .then((response) => response.json())
      .then((data: { defaultCommission?: { type: CommissionKind; value: number } }) => {
        if (cancelled || !data.defaultCommission) return
        setCommissionType(data.defaultCommission.type)
        setCommissionValue(String(data.defaultCommission.value))
      })
      .catch(() => {
        toast.error("Failed to load commission settings")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const numericValue = Number(commissionValue)
  const maxValue = commissionType === "percent" ? 100 : 1_000_000
  const isValidValue =
    commissionValue.trim() !== "" &&
    Number.isFinite(numericValue) &&
    numericValue >= 0 &&
    numericValue <= maxValue

  const handleSave = async () => {
    if (!isValidValue) return

    setSaving(true)
    try {
      const res = await fetch("/api/settings/commission", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: commissionType, value: numericValue }),
      })
      if (!res.ok) throw new Error()

      const data = (await res.json()) as { defaultCommission: { type: CommissionKind; value: number } }
      setCommissionType(data.defaultCommission.type)
      setCommissionValue(String(data.defaultCommission.value))
      toast.success("Default commission saved")
    } catch {
      toast.error("Failed to save default commission")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className={!canEdit ? "opacity-80" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Default Commission</CardTitle>
        <CardDescription className="text-xs">
          Applied to the draft quote created with every new enquiry, and pre-filled in Build Booking.
          Leave at 0 for no commission. Salespeople can still override it per booking.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid gap-2 sm:max-w-md">
          <Label htmlFor="default-commission-value" className="text-xs font-medium text-muted-foreground">
            Default Commission
          </Label>
          <div className="flex gap-2">
            <Select
              value={commissionType}
              onValueChange={(value) => setCommissionType(value as CommissionKind)}
              disabled={loading || !canEdit}
            >
              <SelectTrigger id="default-commission-type" className="w-40" aria-label="Commission type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">% Markup</SelectItem>
                <SelectItem value="per_person">Per Person</SelectItem>
                <SelectItem value="fixed">Fixed Total</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Input
                id="default-commission-value"
                type="number"
                min={0}
                max={maxValue}
                step={commissionType === "per_person" ? 1 : 0.01}
                inputMode="decimal"
                value={commissionValue}
                onChange={(event) => setCommissionValue(event.target.value)}
                readOnly={!canEdit}
                disabled={loading}
                aria-invalid={!isValidValue}
                className="pr-14"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                {commissionType === "percent" ? "%" : commissionType === "fixed" ? "total" : "/ pax"}
              </span>
            </div>
            {canEdit && (
              <Button size="sm" onClick={handleSave} disabled={loading || saving || !isValidValue}>
                {saving ? "Saving..." : "Save"}
              </Button>
            )}
          </div>
          {!canEdit && (
            <p className="text-xs text-muted-foreground">
              Salespeople can view this default; managers and admins can change it.
            </p>
          )}
          {!isValidValue && (
            <p className="text-xs text-destructive">Enter a value between 0 and {maxValue}.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
