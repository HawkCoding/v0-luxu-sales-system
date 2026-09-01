"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function QuoteValidityCard({ canEdit }: { canEdit: boolean }) {
  const [quoteValidityDays, setQuoteValidityDays] = useState("14")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetch("/api/settings/quote-validity")
      .then((response) => response.json())
      .then((data: { quoteValidityDays?: number }) => {
        if (!cancelled && typeof data.quoteValidityDays === "number") {
          setQuoteValidityDays(String(data.quoteValidityDays))
        }
      })
      .catch(() => {
        toast.error("Failed to load quote validity setting")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const numericValue = Number(quoteValidityDays)
  const isValidDays =
    quoteValidityDays.trim() !== "" &&
    Number.isInteger(numericValue) &&
    numericValue >= 1 &&
    numericValue <= 365

  const handleSave = async () => {
    if (!isValidDays) return

    setSaving(true)
    try {
      const res = await fetch("/api/settings/quote-validity", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteValidityDays: numericValue }),
      })
      if (!res.ok) throw new Error()

      const data = (await res.json()) as { quoteValidityDays: number }
      setQuoteValidityDays(String(data.quoteValidityDays))
      toast.success("Quote validity saved")
    } catch {
      toast.error("Failed to save quote validity")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className={!canEdit ? "opacity-80" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Quote Validity</CardTitle>
        <CardDescription className="text-xs">
          New quotes are valid for this many days from the day they are created.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid gap-2 sm:max-w-xs">
          <Label htmlFor="quote-validity-days" className="text-xs font-medium text-muted-foreground">
            Quote Validity (days)
          </Label>
          <div className="flex gap-2">
            <Input
              id="quote-validity-days"
              type="number"
              min={1}
              max={365}
              step={1}
              inputMode="numeric"
              value={quoteValidityDays}
              onChange={(event) => setQuoteValidityDays(event.target.value)}
              readOnly={!canEdit}
              disabled={loading}
              aria-invalid={!isValidDays}
              className="flex-1"
            />
            {canEdit && (
              <Button size="sm" onClick={handleSave} disabled={loading || saving || !isValidDays}>
                {saving ? "Saving..." : "Save"}
              </Button>
            )}
          </div>
          {!canEdit && (
            <p className="text-xs text-muted-foreground">
              Salespeople can view this default; managers and admins can change it.
            </p>
          )}
          {!isValidDays && (
            <p className="text-xs text-destructive">Enter a whole number of days between 1 and 365.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
