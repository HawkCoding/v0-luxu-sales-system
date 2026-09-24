"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { HtmlBodyEditor } from "@/components/ui/html-body-editor"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SignatureBadgeList } from "@/components/signature-badge-list"
import { useAssignableUsers, useEmailAppearanceSettings, type EmailSignatureSettings } from "@/lib/use-data"
import { toEmailFontFamily } from "@/lib/email/appearance"
import {
  buildSignaturePreviewDocument,
  SIGNATURE_BANNER_MAX_WIDTH,
  signatureBannerSize,
} from "@/lib/email/email-chrome"
import type { SignatureBadge } from "@/lib/email/signature-brands"
import { SENDER_LAYOUT_TOKENS } from "@/lib/email/sender-layout"

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
  senderLayout: string | null
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

const TEXT_FIELDS: { key: TextKey; label: string; defaultKey: keyof EmailSignatureSettings }[] = [
  { key: "companyLine", label: "Company line", defaultKey: "signature_company_line" },
  { key: "registrationLine", label: "Registration line", defaultKey: "signature_registration_line" },
  { key: "tradingHours", label: "Trading hours", defaultKey: "signature_trading_hours" },
  { key: "divisionsLine", label: "Divisions line", defaultKey: "signature_divisions_line" },
  { key: "confidentiality", label: "Confidentiality notice", defaultKey: "signature_confidentiality" },
  { key: "officeAddress", label: "Office address", defaultKey: "signature_office_address" },
]

const INSERT_TOKENS = SENDER_LAYOUT_TOKENS

// Preview re-renders on every keystroke in a rich-text field; debounce so a
// fast typist doesn't fire a request per character.
const PREVIEW_DEBOUNCE_MS = 400

/** Strips tags down to plain text for the "inherits ..." helper line — the placeholder itself is never rendered as HTML. */
function toPlainText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

/** Fixed-slot form for one signature brand — name, banner, badges, the sender name/contact layout, and six optional text overrides (blank inherits the shared default). */
export function SignatureBrandEditor({ brand, defaults, canEdit, onUpdated }: SignatureBrandEditorProps) {
  const [name, setName] = useState(brand.name)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [previewHtml, setPreviewHtml] = useState("")
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [previewProfileId, setPreviewProfileId] = useState<string | undefined>(undefined)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: assignable } = useAssignableUsers()
  const users = assignable?.users ?? []
  const { data: emailAppearance } = useEmailAppearanceSettings()
  // Coerced through the allowlist: the family is interpolated into the preview's <style>.
  const previewFontFamily = toEmailFontFamily(emailAppearance?.email_font_family)
  const bannerSize = signatureBannerSize(brand.bannerWidth, brand.bannerHeight)

  useEffect(() => setName(brand.name), [brand.id, brand.name])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      setLoadingPreview(true)
      fetch("/api/email-signature/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: brand.id, profileId: previewProfileId ?? null }),
      })
        .then((r) => r.json())
        .then((d: { html?: string }) => {
          if (!cancelled) setPreviewHtml(d.html ?? "")
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoadingPreview(false)
        })
      // Re-render whenever any brand field or the previewed salesperson changes, so the preview stays byte-identical to production.
    }, PREVIEW_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [brand, previewProfileId])

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
        senderLayout: string | null
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
          <div className="flex flex-wrap items-center gap-3">
            {brand.bannerUrl ? (
              // Same 320px cap the sent email uses (SIGNATURE_BANNER_MAX_WIDTH), so what you see here is what clients get.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.bannerUrl}
                alt={brand.name}
                width={bannerSize.width}
                height={bannerSize.height}
                className="block h-auto w-full rounded border"
                style={{ maxWidth: SIGNATURE_BANNER_MAX_WIDTH }}
              />
            ) : (
              <div
                className="h-14 w-full rounded border border-dashed flex items-center justify-center text-xs text-muted-foreground"
                style={{ maxWidth: SIGNATURE_BANNER_MAX_WIDTH }}
              >
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

        <div className="space-y-1.5 border-t pt-5">
          <Label htmlFor="brand-sender-layout">Name &amp; contact layout</Label>
          <p className="text-xs text-muted-foreground">
            Formats the sender block at the top of the signature — insert a field, then style it. Every
            salesperson&apos;s own name, title and phone numbers drop in wherever you place them; those are set per
            person in{" "}
            <Link href="/app/settings" className="underline">
              Settings › Email Accounts
            </Link>
            .
          </p>
          <HtmlBodyEditor
            id="brand-sender-layout"
            variant="compact"
            value={brand.senderLayout ?? ""}
            insertTokens={INSERT_TOKENS}
            disabled={!canEdit}
            onChange={(html) => onUpdated({ ...brand, senderLayout: html })}
            onBlur={() => patch({ senderLayout: brand.senderLayout ?? "" })}
          />
          <p className="text-xs text-muted-foreground">
            Blank inherits the shared default
            {defaults?.signature_sender_layout ? `: “${toPlainText(defaults.signature_sender_layout)}”` : "."}
          </p>
        </div>

        {TEXT_FIELDS.map(({ key, label, defaultKey }) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`brand-${key}`}>{label}</Label>
            <HtmlBodyEditor
              id={`brand-${key}`}
              variant="compact"
              value={brand[key] ?? ""}
              disabled={!canEdit}
              onChange={(html) => onUpdated({ ...brand, [key]: html })}
              onBlur={() => patch({ [key]: brand[key] ?? "" })}
            />
            <p className="text-xs text-muted-foreground">
              Blank inherits the shared default
              {defaults?.[defaultKey] ? `: “${toPlainText(defaults[defaultKey])}”` : "."}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Live preview</Label>
          {/* Angora background + email font, matching the container the signature sits in when sent. */}
          <div className="h-[420px] overflow-auto rounded-md border bg-[#e8e5df]">
            {loadingPreview ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Rendering…
              </div>
            ) : (
              <iframe
                title="Signature preview"
                className="h-full w-full"
                sandbox=""
                srcDoc={buildSignaturePreviewDocument(previewHtml, previewFontFamily)}
              />
            )}
          </div>
        </div>
        {users.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="preview-salesperson">Preview as</Label>
            <Select
              value={previewProfileId ?? "__self__"}
              onValueChange={(value) => setPreviewProfileId(value === "__self__" ? undefined : value)}
            >
              <SelectTrigger id="preview-salesperson" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__self__">Me</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.userId} value={u.userId}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  )
}
