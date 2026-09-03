"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function TrainChildPriceRatioCard({ canEdit }: { canEdit: boolean }) {
  const [percent, setPercent] = useState("50")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetch("/api/settings/train-child-price-ratio")
      .then(async (response) => {
        if (!response.ok) throw new Error("load failed")
        return response.json()
      })
      .then((data: { ratio?: number }) => {
        if (!cancelled && typeof data.ratio === "number") {
          setPercent(String(Math.round(data.ratio * 10000) / 100))
        }
      })
      .catch(() => {
        toast.error("Failed to load train child price ratio")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const numericValue = Number(percent)
  const isValid =
    percent.trim() !== "" &&
    Number.isFinite(numericValue) &&
    numericValue >= 0 &&
    numericValue <= 100

  const handleSave = async () => {
    if (!isValid) return

    setSaving(true)
    try {
      const res = await fetch("/api/settings/train-child-price-ratio", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratio: numericValue / 100 }),
      })
      if (!res.ok) throw new Error()

      const data = (await res.json()) as { ratio: number }
      setPercent(String(Math.round(data.ratio * 10000) / 100))
      toast.success("Train child price ratio saved")
    } catch {
      toast.error("Failed to save train child price ratio")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className={!canEdit ? "opacity-80" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Train Pricing Defaults</CardTitle>
        <CardDescription className="text-xs">
          When entering Adult prices on train rate cards, Child prices auto-fill to this
          percentage of Adult. Manual edits are preserved.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid gap-2 sm:max-w-xs">
          <Label
            htmlFor="train-child-price-ratio"
            className="text-xs font-medium text-muted-foreground"
          >
            Child price as % of Adult
          </Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="train-child-price-ratio"
                type="number"
                min={0}
                max={100}
                step={0.01}
                inputMode="decimal"
                value={percent}
                onChange={(event) => setPercent(event.target.value)}
                readOnly={!canEdit}
                disabled={loading}
                aria-invalid={!isValid}
                className="pr-8"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                %
              </span>
            </div>
            {canEdit && (
              <Button size="sm" onClick={handleSave} disabled={loading || saving || !isValid}>
                {saving ? "Saving..." : "Save"}
              </Button>
            )}
          </div>
          {!canEdit && (
            <p className="text-xs text-muted-foreground">
              Only admins can change this default.
            </p>
          )}
          {!isValid && (
            <p className="text-xs text-destructive">Enter a value between 0 and 100.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
