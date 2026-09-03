"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function HotelDefaultTimesCard({ canEdit }: { canEdit: boolean }) {
  const [checkInTime, setCheckInTime] = useState("14:00")
  const [checkOutTime, setCheckOutTime] = useState("11:00")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetch("/api/settings/hotel-defaults")
      .then((response) => response.json())
      .then((data: { checkInTime?: string; checkOutTime?: string }) => {
        if (cancelled) return
        if (typeof data.checkInTime === "string") setCheckInTime(data.checkInTime)
        if (typeof data.checkOutTime === "string") setCheckOutTime(data.checkOutTime)
      })
      .catch(() => {
        toast.error("Failed to load hotel default times")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const isValid = checkInTime.trim() !== "" && checkOutTime.trim() !== ""

  const handleSave = async () => {
    if (!isValid) return

    setSaving(true)
    try {
      const res = await fetch("/api/settings/hotel-defaults", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkInTime, checkOutTime }),
      })
      if (!res.ok) throw new Error()

      const data = (await res.json()) as { checkInTime: string; checkOutTime: string }
      setCheckInTime(data.checkInTime)
      setCheckOutTime(data.checkOutTime)
      toast.success("Hotel default times saved")
    } catch {
      toast.error("Failed to save hotel default times")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className={!canEdit ? "opacity-80" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Hotel Defaults</CardTitle>
        <CardDescription className="text-xs">
          New hotel suppliers start with these check-in and check-out times; each hotel can override them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-2">
            <Label htmlFor="hotel-default-check-in" className="text-xs font-medium text-muted-foreground">
              Check-in time
            </Label>
            <Input
              id="hotel-default-check-in"
              type="time"
              value={checkInTime}
              onChange={(event) => setCheckInTime(event.target.value)}
              readOnly={!canEdit}
              disabled={loading}
              className="w-32"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="hotel-default-check-out" className="text-xs font-medium text-muted-foreground">
              Check-out time
            </Label>
            <Input
              id="hotel-default-check-out"
              type="time"
              value={checkOutTime}
              onChange={(event) => setCheckOutTime(event.target.value)}
              readOnly={!canEdit}
              disabled={loading}
              className="w-32"
            />
          </div>
          {canEdit && (
            <Button size="sm" onClick={handleSave} disabled={loading || saving || !isValid}>
              {saving ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
        {!canEdit && (
          <p className="text-xs text-muted-foreground">
            Salespeople can view these defaults; managers and admins can change them.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
