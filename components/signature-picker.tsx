"use client"

import { useEffect, useState } from "react"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { extractSignatureSlot } from "@/lib/templates/signature-slot"
import { useSignatureBrands } from "@/lib/use-data"

interface SignaturePickerProps {
  /** Full composed email HTML, used only to check the signature slot markers exist. */
  bodyHtml: string
  /** Profile whose signature this is — never the logged-in user unless they match. */
  profileId: string | null
  /** Brand id compose originally resolved; the initial dropdown selection. */
  initialBrandId: string | null
  /** Called with a freshly rendered fragment whenever the salesperson switches brands. */
  onSignatureHtmlChange: (html: string) => void
  disabled?: boolean
}

/**
 * Lets the salesperson pick which division's signature goes out — any brand,
 * on any send, never forced by the booking or mailbox. Hidden entirely when
 * there's nothing to pick from: no signature slot in the stored HTML
 * (pre-migration sends), no resolvable sender, or fewer than two brands.
 */
export function SignaturePicker({
  bodyHtml,
  profileId,
  initialBrandId,
  onSignatureHtmlChange,
  disabled,
}: SignaturePickerProps) {
  const { data } = useSignatureBrands()
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(initialBrandId)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setSelectedBrandId(initialBrandId)
  }, [initialBrandId])

  const hasSlot = extractSignatureSlot(bodyHtml) !== null
  const brands = data?.brands ?? []

  if (!hasSlot || !profileId || !data?.enabled || brands.length < 2) return null

  async function handleChange(brandId: string) {
    setSelectedBrandId(brandId)
    setLoading(true)
    try {
      const res = await fetch("/api/email-signature/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, profileId }),
      })
      if (!res.ok) return
      const payload = (await res.json()) as { html: string }
      onSignatureHtmlChange(payload.html)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="signature-brand-picker" className="text-xs text-muted-foreground shrink-0">
        Signature
      </Label>
      <Select
        value={selectedBrandId ?? undefined}
        onValueChange={handleChange}
        disabled={disabled || loading}
      >
        <SelectTrigger id="signature-brand-picker" size="sm" className="w-[220px]">
          <SelectValue placeholder="Choose a signature" />
        </SelectTrigger>
        <SelectContent>
          {brands.map((brand) => (
            <SelectItem key={brand.id} value={brand.id}>
              {brand.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
