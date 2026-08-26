"use client"

import { useEffect, useState } from "react"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { hasBankingBlock } from "@/lib/templates/banking-block-slot"
import { usePaymentMethods } from "@/lib/use-data"

interface PaymentMethodPickerProps {
  /** Editable email content (not the full branded wrapper) — checked for a banking-details block. */
  contentHtml: string
  /** Payment method compose originally resolved (from the invoice, or the account default); the initial dropdown selection. */
  initialPaymentMethodId: string | null
  /** Called with the freshly rendered block HTML whenever the salesperson switches methods. */
  onBlockHtmlChange: (html: string) => void
  invoiceNumber?: string
  customerSurname?: string
  disabled?: boolean
}

/**
 * Lets the salesperson pick which payment method's bank details go out on
 * this send — independent of which method the attached invoice PDF was
 * generated with. Hidden entirely when there's nothing to pick from: no
 * banking-details block in the content (most templates don't carry one), or
 * fewer than two enabled methods.
 */
export function PaymentMethodPicker({
  contentHtml,
  initialPaymentMethodId,
  onBlockHtmlChange,
  invoiceNumber,
  customerSurname,
  disabled,
}: PaymentMethodPickerProps) {
  const { data } = usePaymentMethods()
  const [selectedId, setSelectedId] = useState<string | null>(initialPaymentMethodId)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setSelectedId(initialPaymentMethodId)
  }, [initialPaymentMethodId])

  const methods = data?.methods ?? []

  if (!hasBankingBlock(contentHtml) || methods.length < 2) return null

  async function handleChange(paymentMethodId: string) {
    setSelectedId(paymentMethodId)
    setLoading(true)
    try {
      const res = await fetch("/api/payment-methods/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethodId,
          invoiceNumber: invoiceNumber ?? "",
          customerSurname: customerSurname ?? "",
        }),
      })
      if (!res.ok) return
      const payload = (await res.json()) as { html: string }
      onBlockHtmlChange(payload.html)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Label htmlFor="payment-method-picker" className="text-xs text-muted-foreground shrink-0">
          Payment method
        </Label>
        <Select
          value={selectedId ?? undefined}
          onValueChange={handleChange}
          disabled={disabled || loading}
        >
          <SelectTrigger id="payment-method-picker" size="sm" className="w-[220px]">
            <SelectValue placeholder="Choose a payment method" />
          </SelectTrigger>
          <SelectContent>
            {methods.map((method) => (
              <SelectItem key={method.id} value={method.id}>
                {method.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        Changes this email only. The attached PDF keeps the method chosen when the invoice was generated.
      </p>
    </div>
  )
}
