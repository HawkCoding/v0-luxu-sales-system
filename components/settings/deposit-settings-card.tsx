"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export function DepositSettingsCard({ canEdit }: { canEdit: boolean }) {
  const [defaultDepositPercentage, setDefaultDepositPercentage] = useState("25")
  const [depositRefundable, setDepositRefundable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetch("/api/settings/deposit")
      .then((response) => response.json())
      .then((data: { defaultDepositPercentage?: number; depositRefundable?: boolean }) => {
        if (cancelled) return
        if (typeof data.defaultDepositPercentage === "number") {
          setDefaultDepositPercentage(String(data.defaultDepositPercentage))
        }
        if (typeof data.depositRefundable === "boolean") {
          setDepositRefundable(data.depositRefundable)
        }
      })
      .catch(() => {
        toast.error("Failed to load deposit settings")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const numericValue = Number(defaultDepositPercentage)
  const isValidPercentage =
    defaultDepositPercentage.trim() !== "" &&
    Number.isFinite(numericValue) &&
    numericValue >= 0 &&
    numericValue <= 100

  const handleSave = async () => {
    if (!isValidPercentage) return

    setSaving(true)
    try {
      const res = await fetch("/api/settings/deposit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultDepositPercentage: numericValue, depositRefundable }),
      })
      if (!res.ok) throw new Error()

      const data = (await res.json()) as {
        defaultDepositPercentage: number
        depositRefundable: boolean
      }
      setDefaultDepositPercentage(String(data.defaultDepositPercentage))
      setDepositRefundable(data.depositRefundable)
      toast.success("Deposit settings saved")
    } catch {
      toast.error("Failed to save deposit settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className={!canEdit ? "opacity-80" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Quote & Invoice Defaults</CardTitle>
        <CardDescription className="text-xs">
          Deposit invoice generation uses this percentage unless a job-specific override is entered.
          Refundability decides what happens to a paid deposit when a booking is cancelled.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid gap-2 sm:max-w-xs">
          <Label htmlFor="default-deposit-percentage" className="text-xs font-medium text-muted-foreground">
            Default Deposit Percentage
          </Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="default-deposit-percentage"
                type="number"
                min={0}
                max={100}
                step={0.01}
                inputMode="decimal"
                value={defaultDepositPercentage}
                onChange={(event) => setDefaultDepositPercentage(event.target.value)}
                readOnly={!canEdit}
                disabled={loading}
                aria-invalid={!isValidPercentage}
                className="pr-8"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                %
              </span>
            </div>
            {canEdit && (
              <Button size="sm" onClick={handleSave} disabled={loading || saving || !isValidPercentage}>
                {saving ? "Saving..." : "Save"}
              </Button>
            )}
          </div>
          {!canEdit && (
            <p className="text-xs text-muted-foreground">
              Salespeople can view this default; managers and admins can change it.
            </p>
          )}
          {!isValidPercentage && (
            <p className="text-xs text-destructive">Enter a value between 0 and 100.</p>
          )}
        </div>

        <div className="space-y-1 pt-2">
          <div className="flex items-center gap-3">
            <Switch
              id="deposit-refundable"
              checked={depositRefundable}
              onCheckedChange={setDepositRefundable}
              disabled={!canEdit || loading}
              aria-label="Deposit is refundable on cancellation"
            />
            <Label htmlFor="deposit-refundable" className="text-sm">
              {depositRefundable ? "Deposit is refundable" : "Deposit is non-refundable"}
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            When off, a cancelled booking keeps the paid deposit as the cancellation fee and only
            the balance above it is refunded.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
