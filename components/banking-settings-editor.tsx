"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface BankingSettingsEditorProps {
  canEdit: boolean
}

type BankingValues = Record<string, string>

const FIELDS: Array<{ key: string; label: string }> = [
  { key: "bank_name", label: "Bank" },
  { key: "bank_account_name", label: "Account name" },
  { key: "bank_account_number", label: "Account number" },
  { key: "bank_branch_code", label: "Branch code" },
  { key: "bank_swift_code", label: "SWIFT/BIC" },
  { key: "payment_reference_hint", label: "Payment reference (e.g. booking number)" },
  { key: "company_address", label: "Company address" },
  { key: "company_reg_number", label: "Company registration number" },
  { key: "company_vat_number", label: "VAT number" },
  { key: "company_tel", label: "Telephone" },
  { key: "company_cell", label: "Cell" },
  { key: "company_fax", label: "Fax" },
  { key: "company_email", label: "Contact e-mail" },
  { key: "company_website", label: "Website" },
]

export function BankingSettingsEditor({ canEdit }: BankingSettingsEditorProps) {
  const [values, setValues] = useState<BankingValues>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/settings/banking")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: BankingValues) => {
        if (!cancelled) setValues(d)
      })
      .catch(() => toast.error("Failed to load banking settings"))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/settings/banking", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })
      if (!res.ok) throw new Error()
      toast.success("Banking settings saved")
    } catch {
      toast.error("Failed to save banking settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={`banking-${key}`} className="text-xs font-medium text-muted-foreground">
              {label}
            </Label>
            <Input
              id={`banking-${key}`}
              value={values[key] ?? ""}
              onChange={(event) => setValues((prev) => ({ ...prev, [key]: event.target.value }))}
              readOnly={!canEdit}
              disabled={loading}
            />
          </div>
        ))}
      </div>
      {canEdit ? (
        <Button size="sm" onClick={handleSave} disabled={loading || saving}>
          {saving ? "Saving..." : "Save banking details"}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          Only managers and admins can change banking settings.
        </p>
      )}
    </div>
  )
}
