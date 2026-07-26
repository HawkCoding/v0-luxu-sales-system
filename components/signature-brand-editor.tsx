"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SignatureBadgeList } from "@/components/signature-badge-list"
import type { EmailSignatureSettings } from "@/lib/use-data"
import type { SignatureBadge } from "@/lib/email/signature-brands"

export interface AdminSignatureBrand {
  id: string
  name: string
  sortOrder: number
  enabled: boolean
  bannerUrl: string | null
  bannerWidth: number | null
  bannerHeight: number | null
  badges: SignatureBadge[]
  companyLine: string | null
  registrationLine: string | null
  tradingHours: string | null
  divisionsLine: string | null
  confidentiality: string | null
  officeAddress: string | null
}

interface SignatureBrandEditorProps {
  brand: AdminSignatureBrand
  defaults: EmailSignatureSettings | undefined
  canEdit: boolean
  onUpdated: (brand: AdminSignatureBrand) => void
}

type TextKey =
  | "companyLine"
  | "registrationLine"
  | "tradingHours"
  | "divisionsLine"
  | "confidentiality"
  | "officeAddress"

const TEXT_FIELDS: { key: TextKey; label: string; defaultKey: keyof EmailSignatureSettings; rows?: number }[] = [
  { key: "companyLine", label: "Company line", defaultKey: "signature_company_line", rows: 2 },
  { key: "registrationLine", label: "Registration line", defaultKey: "signature_registration_line" },
  { key: "tradingHours", label: "Trading hours", defaultKey: "signature_trading_hours" },
  { key: "divisionsLine", label: "Divisions line", defaultKey: "signature_divisions_line" },
  { key: "confidentiality", label: "Confidentiality notice", defaultKey: "signature_confidentiality", rows: 3 },
  { key: "officeAddress", label: "Office address", defaultKey: "signature_office_address", rows: 2 },
]

/** Fixed-slot form for one signature brand — name, banner, badges, and the six optional text overrides (blank inherits the shared default shown as placeholder). */
export function SignatureBrandEditor({ brand, defaults, canEdit, onUpdated }: SignatureBrandEditorProps) {
  const [name, setName] = useState(brand.name)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [previewHtml, setPreviewHtml] = useState("")
  const [loadingPreview, setLoadingPreview] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => setName(brand.name), [brand.id, brand.name])

  useEffect(() => {
    let cancelled = false
    setLoadingPreview(true)
    fetch("/api/email-signature/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: brand.id }),
    })
      .then((r) => r.json())
      .then((d: { html?: string }) => {
        if (!cancelled) setPreviewHtml(d.html ?? "")
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingPreview(false)
      })
    return () => {
      cancelled = true
    }
    // Re-render whenever any brand field changes, so the preview stays byte-identical to production.
  }, [brand])

  async function patch(body: Record<string, unknown>, successLabel?: string) {
    try {
      const res = await fetch(`/api/settings/signature-brands/${brand.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        toast.error(detail?.error ?? "Failed to save")
        return
      }
      const updated = (await res.json()) as {
        id: string
        name: string
        sortOrder: number
        enabled: boolean
        bannerUrl: string | null
        companyLine: string | null
        registrationLine: string | null
        tradingHours: string | null
        divisionsLine: string | null
        confidentiality: string | null
        officeAddress: string | null
      }
      onUpdated({ ...brand, ...updated })
      if (successLabel) toast.success(successLabel)
    } catch {
      toast.error("Failed to save")
    }
  }

  async function handleBannerUpload(file: File) {
    if (file.type !== "image/png") {
      toast.error("Banner uploads must be PNG.")
      return
    }
    setUploadingBanner(true)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = await fetch(`/api/settings/signature-brands/${brand.id}/banner`, { method: "POST", body })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        toast.error(detail?.error ?? "Failed to upload banner")
        return
      }
      const payload = (await res.json()) as { bannerUrl: string; bannerWidth: number; bannerHeight: number }
      onUpdated({
        ...brand,
        bannerUrl: payload.bannerUrl,
        bannerWidth: payload.bannerWidth,
        bannerHeight: payload.bannerHeight,
      })
      toast.success("Banner saved")
    } catch {
      toast.error("Failed to upload banner")
    } finally {
      setUploadingBanner(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="brand-name">Name</Label>
          <Input
            id="brand-name"
            value={name}
            disabled={!canEdit}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== brand.name && patch({ name: name.trim() }, "Name saved")}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Banner image</Label>
          <div className="flex items-center gap-3">
            {brand.bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.bannerUrl}
                alt={brand.name}
                className="h-14 max-w-[260px] rounded border object-contain bg-muted/30"
              />
            ) : (
              <div className="h-14 w-[260px] rounded border border-dashed flex items-center justify-center text-xs text-muted-foreground">
                No banner uploaded
              </div>
            )}
            {canEdit && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void handleBannerUpload(file)
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadingBanner}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadingBanner ? "Uploading…" : "Upload"}
                </Button>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Transparent PNG.</p>
        </div>

        <div className="space-y-1.5">
          <Label>Badges</Label>
          <SignatureBadgeList
            brandId={brand.id}
            badges={brand.badges}
            canEdit={canEdit}
            onChange={(badges) => onUpdated({ ...brand, badges })}
          />
        </div>

        {TEXT_FIELDS.map(({ key, label, defaultKey, rows }) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`brand-${key}`}>{label}</Label>
            <Textarea
              id={`brand-${key}`}
              rows={rows ?? 1}
              value={brand[key] ?? ""}
              placeholder={defaults?.[defaultKey] ?? ""}
              disabled={!canEdit}
              onChange={(e) => onUpdated({ ...brand, [key]: e.target.value })}
              onBlur={() => patch({ [key]: brand[key] ?? "" })}
            />
            <p className="text-xs text-muted-foreground">Blank inherits the shared default shown as placeholder.</p>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label>Live preview</Label>
        <div className="h-[420px] overflow-auto rounded-md border bg-white">
          {loadingPreview ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Rendering…
            </div>
          ) : (
            <iframe title="Signature preview" className="h-full w-full" sandbox="" srcDoc={previewHtml} />
          )}
        </div>
      </div>
    </div>
  )
}
