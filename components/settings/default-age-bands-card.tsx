"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function DefaultAgeBandsCard({ canEdit }: { canEdit: boolean }) {
  const [infantMax, setInfantMax] = useState("2")
  const [childMax, setChildMax] = useState("12")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetch("/api/settings/age-bands")
      .then(async (response) => {
        if (!response.ok) throw new Error("load failed")
        return response.json()
      })
      .then((data: { infantMaxAge?: number; childMaxAge?: number }) => {
        if (cancelled) return
        if (typeof data.infantMaxAge === "number") setInfantMax(String(data.infantMaxAge))
        if (typeof data.childMaxAge === "number") setChildMax(String(data.childMaxAge))
      })
      .catch(() => {
        toast.error("Failed to load default age bands")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const infantValue = Number(infantMax)
  const childValue = Number(childMax)
  const isValid =
    Number.isInteger(infantValue) &&
    Number.isInteger(childValue) &&
    infantValue >= 0 &&
    infantValue <= 17 &&
    childValue >= 0 &&
    childValue <= 17 &&
    infantValue <= childValue

  const handleSave = async () => {
    if (!isValid) return
    setSaving(true)
    try {
      const res = await fetch("/api/settings/age-bands", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ infantMaxAge: infantValue, childMaxAge: childValue }),
      })
      if (!res.ok) throw new Error()
      const data = (await res.json()) as { infantMaxAge: number; childMaxAge: number }
      setInfantMax(String(data.infantMaxAge))
      setChildMax(String(data.childMaxAge))
      toast.success("Default age bands saved")
    } catch {
      toast.error("Failed to save default age bands")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className={!canEdit ? "opacity-80" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Passenger Age Bands</CardTitle>
        <CardDescription className="text-xs">
          Defaults used to classify passengers as infant, child or adult. Suppliers can override
          these on their own profile.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:max-w-md sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="default-infant-max" className="text-xs font-medium text-muted-foreground">
              Infant max age
            </Label>
            <Input
              id="default-infant-max"
              type="number"
              min={0}
              max={17}
              step={1}
              inputMode="numeric"
              value={infantMax}
              onChange={(event) => setInfantMax(event.target.value)}
              readOnly={!canEdit}
              disabled={loading}
              aria-invalid={!isValid}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="default-child-max" className="text-xs font-medium text-muted-foreground">
              Child max age
            </Label>
            <Input
              id="default-child-max"
              type="number"
              min={0}
              max={17}
              step={1}
              inputMode="numeric"
              value={childMax}
              onChange={(event) => setChildMax(event.target.value)}
              readOnly={!canEdit}
              disabled={loading}
              aria-invalid={!isValid}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Resolves to: Infant <span className="tabular-nums">0–{Number.isFinite(infantValue) ? infantValue : "?"}</span>,
          Child <span className="tabular-nums">{Number.isFinite(infantValue) ? infantValue + 1 : "?"}–{Number.isFinite(childValue) ? childValue : "?"}</span>,
          Adult <span className="tabular-nums">{Number.isFinite(childValue) ? childValue + 1 : "?"}+</span>
        </p>
        {canEdit && (
          <div>
            <Button size="sm" onClick={handleSave} disabled={loading || saving || !isValid}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
        {!canEdit && (
          <p className="text-xs text-muted-foreground">Only admins can change these defaults.</p>
        )}
        {!isValid && (
          <p className="text-xs text-destructive">
            Infant max must be ≤ child max, and both must be between 0 and 17.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
