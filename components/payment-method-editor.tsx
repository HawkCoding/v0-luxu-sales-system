"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export interface AdminPaymentMethod {
  id: string
  name: string
  enabled: boolean
  isDefault: boolean
  sortOrder: number
  bankName: string | null
  bankAccountName: string | null
  bankAccountNumber: string | null
  bankBranchCode: string | null
  bankSwiftCode: string | null
  companyAddress: string | null
  companyRegNumber: string | null
  companyVatNumber: string | null
  companyTel: string | null
  companyCell: string | null
  companyFax: string | null
  companyEmail: string | null
  companyWebsite: string | null
}

interface PaymentMethodEditorProps {
  method: AdminPaymentMethod
  canEdit: boolean
  onUpdated: (method: AdminPaymentMethod) => void
}

type FieldKey = Exclude<keyof AdminPaymentMethod, "id" | "name" | "enabled" | "isDefault" | "sortOrder">

const FIELDS: Array<{ key: FieldKey; label: string }> = [
  { key: "bankName", label: "Bank" },
  { key: "bankAccountName", label: "Account name" },
  { key: "bankAccountNumber", label: "Account number" },
  { key: "bankBranchCode", label: "Branch code" },
  { key: "bankSwiftCode", label: "SWIFT/BIC" },
  { key: "companyAddress", label: "Company address" },
  { key: "companyRegNumber", label: "Company registration number" },
  { key: "companyVatNumber", label: "VAT number" },
  { key: "companyTel", label: "Telephone" },
  { key: "companyCell", label: "Cell" },
  { key: "companyFax", label: "Fax" },
  { key: "companyEmail", label: "Contact e-mail" },
  { key: "companyWebsite", label: "Website" },
]

const API_KEY_MAP: Record<FieldKey, string> = {
  bankName: "bank_name",
  bankAccountName: "bank_account_name",
  bankAccountNumber: "bank_account_number",
  bankBranchCode: "bank_branch_code",
  bankSwiftCode: "bank_swift_code",
  companyAddress: "company_address",
  companyRegNumber: "company_reg_number",
  companyVatNumber: "company_vat_number",
  companyTel: "company_tel",
  companyCell: "company_cell",
  companyFax: "company_fax",
  companyEmail: "company_email",
  companyWebsite: "company_website",
}

/** Fixed-slot form for one payment method's 13 bank/company fields, saved field-by-field on blur. */
export function PaymentMethodEditor({ method, canEdit, onUpdated }: PaymentMethodEditorProps) {
  const [values, setValues] = useState(method)

  useEffect(() => setValues(method), [method])

  async function saveField(key: FieldKey) {
    const current = values[key] ?? ""
    if (current === (method[key] ?? "")) return
    try {
      const res = await fetch(`/api/settings/payment-methods/${method.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [API_KEY_MAP[key]]: current }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        toast.error(detail?.error ?? "Failed to save")
        return
      }
      onUpdated({ ...method, [key]: current })
    } catch {
      toast.error("Failed to save")
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {FIELDS.map(({ key, label }) => (
        <div key={key} className="space-y-1">
          <Label htmlFor={`payment-method-${key}`} className="text-xs font-medium text-muted-foreground">
            {label}
          </Label>
          <Input
            id={`payment-method-${key}`}
            value={values[key] ?? ""}
            onChange={(event) => setValues((prev) => ({ ...prev, [key]: event.target.value }))}
            onBlur={() => void saveField(key)}
            readOnly={!canEdit}
            disabled={!canEdit}
          />
        </div>
      ))}
    </div>
  )
}
