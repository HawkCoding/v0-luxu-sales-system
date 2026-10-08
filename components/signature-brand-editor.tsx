"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Loader2, RotateCcw, Save } from "lucide-react"
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
import { isEquivalentEditorHtml } from "@/lib/templates/rich-text/equivalent-html"
import { cn } from "@/lib/utils"

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
  /** The saved copy of the brand. Never changed by typing — only by a successful save or upload. */
  brand: AdminSignatureBrand
  defaults: EmailSignatureSettings | undefined
  canEdit: boolean
  /** Merge saved fields into the parent's copy of brand `id` (functional merge — never a stale whole-brand replace). */
  onUpdated: (id: string, patch: Partial<AdminSignatureBrand>) => void
  /** Reports whether the editor holds unsaved changes, so the page can guard brand switches and navigation. */
  onDirtyChange?: (dirty: boolean) => void
}

type TextKey =
  | "companyLine"
  | "registrationLine"
  | "tradingHours"
  | "divisionsLine"
  | "confidentiality"
  | "officeAddress"

type DraftKey = "name" | "senderLayout" | TextKey

type BrandDraft = Record<DraftKey, string>

const TEXT_FIELDS: { key: TextKey; label: string; defaultKey: keyof EmailSignatureSettings }[] = [
  { key: "companyLine", label: "Company line", defaultKey: "signature_company_line" },
  { key: "registrationLine", label: "Registration line", defaultKey: "signature_registration_line" },
  { key: "tradingHours", label: "Trading hours", defaultKey: "signature_trading_hours" },
  { key: "divisionsLine", label: "Divisions line", defaultKey: "signature_divisions_line" },
  { key: "confidentiality", label: "Confidentiality notice", defaultKey: "signature_confidentiality" },
  { key: "officeAddress", label: "Office address", defaultKey: "signature_office_address" },
]

const DRAFT_KEYS: DraftKey[] = ["name", "senderLayout", ...TEXT_FIELDS.map((field) => field.key)]

/** Rich-text fields sent to the preview as draft overrides (the brand name never renders). */
const PREVIEW_KEYS: Exclude<DraftKey, "name">[] = ["senderLayout", ...TEXT_FIELDS.map((field) => field.key)]

const INSERT_TOKENS = SENDER_LAYOUT_TOKENS

// Preview renders the draft; debounce so a fast typist doesn't fire a request per character.
const PREVIEW_DEBOUNCE_MS = 500

/** Strips tags down to plain text for the "inherits ..." helper line — the placeholder itself is never rendered as HTML. */
function toPlainText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

function draftFromBrand(brand: AdminSignatureBrand): BrandDraft {
  return {
    name: brand.name,
    senderLayout: brand.senderLayout ?? "",
    companyLine: brand.companyLine ?? "",
    registrationLine: brand.registrationLine ?? "",
    tradingHours: brand.tradingHours ?? "",
    divisionsLine: brand.divisionsLine ?? "",
    confidentiality: brand.confidentiality ?? "",
    officeAddress: brand.officeAddress ?? "",
  }
}

/**
 * Rich-text fields compare as the editor renders them: every blank form is equal, and the editor's
 * own normalisation of stored HTML (`color:rgb(…)` re-serialised as `color: rgb(…);`, a <p>
 * wrapper) is not a change.
 */
function sameValue(key: DraftKey, a: string, b: string): boolean {
  if (a === b) return true
  if (key === "name") return false
  return isEquivalentEditorHtml(a, b)
}

interface SavedBrandFields {
  name: string
  senderLayout: string | null
  companyLine: string | null
  registrationLine: string | null
  tradingHours: string | null
  divisionsLine: string | null
  confidentiality: string | null
  officeAddress: string | null
}

/** Fixed-slot form for one signature brand — name, banner, badges, the sender name/contact layout, and six optional text overrides (blank inherits the shared default). Text edits are held in a local draft until "Save changes". */
export function SignatureBrandEditor({ brand, defaults, canEdit, onUpdated, onDirtyChange }: SignatureBrandEditorProps) {
  const saved = useMemo(() => draftFromBrand(brand), [brand])
  const [draft, setDraft] = useState<BrandDraft>(saved)
  const [saving, setSaving] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [previewFailed, setPreviewFailed] = useState(false)
  const [previewProfileId, setPreviewProfileId] = useState<string | undefined>(undefined)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: assignable } = useAssignableUsers()
  const users = assignable?.users ?? []
  const { data: emailAppearance } = useEmailAppearanceSettings()
  // Coerced through the allowlist: the family is interpolated into the preview's <style>.
  const previewFontFamily = toEmailFontFamily(emailAppearance?.email_font_family)
  const bannerSize = signatureBannerSize(brand.bannerWidth, brand.bannerHeight)

  const dirtyKeys = DRAFT_KEYS.filter((key) => !sameValue(key, draft[key], saved[key]))
  const isDirty = dirtyKeys.length > 0
  const nameInvalid = draft.name.trim() === ""

  // When the parent's saved copy changes underneath us (a reload after a
  // toggle/reorder, another tab's save), untouched fields follow it; fields
  // the user has edited keep their draft.
  const previousSaved = useRef(saved)
  useEffect(() => {
    const previous = previousSaved.current
    previousSaved.current = saved
    if (previous === saved) return
    setDraft((current) => {
      let changed = false
      const next = { ...current }
      for (const key of DRAFT_KEYS) {
        if (sameValue(key, current[key], previous[key]) && saved[key] !== previous[key]) {
          next[key] = saved[key]
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [saved])

  const onDirtyChangeRef = useRef(onDirtyChange)
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange
  }, [onDirtyChange])
  useEffect(() => {
    onDirtyChangeRef.current?.(isDirty)
  }, [isDirty])
  useEffect(() => () => onDirtyChangeRef.current?.(false), [])

  // Stable key for the preview effect: only the rendered draft fields, the
  // saved chrome (banner/badges) and the previewed salesperson matter.
  const previewDraftJson = JSON.stringify(Object.fromEntries(PREVIEW_KEYS.map((key) => [key, draft[key]])))
  const badgesJson = JSON.stringify(brand.badges)

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoadingPreview(true)
      fetch("/api/email-signature/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: brand.id,
          profileId: previewProfileId ?? null,
          draft: JSON.parse(previewDraftJson) as Record<string, string>,
        }),
        signal: controller.signal,
      })
        .then(async (r) => {
          if (!r.ok) throw new Error("preview failed")
          return (await r.json()) as { html?: string }
        })
        .then((d) => {
          if (controller.signal.aborted) return
          setPreviewHtml(d.html ?? "")
          setPreviewFailed(false)
        })
        .catch(() => {
          if (!controller.signal.aborted) setPreviewFailed(true)
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingPreview(false)
        })
    }, PREVIEW_DEBOUNCE_MS)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [brand.id, brand.bannerUrl, badgesJson, previewDraftJson, previewProfileId])

  function setField(key: DraftKey, value: string) {
    setDraft((current) => (current[key] === value ? current : { ...current, [key]: value }))
  }

  function handleDiscard() {
    setDraft(saved)
  }

  async function handleSave() {
    if (!isDirty || saving || nameInvalid) return
    const keys = dirtyKeys
    // What was sent, per field — a response only replaces fields the user hasn't touched since.
    const snapshot: Partial<BrandDraft> = {}
    const body: Record<string, string> = {}
    for (const key of keys) {
      snapshot[key] = draft[key]
      body[key] = key === "name" ? draft.name.trim() : draft[key]
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/settings/signature-brands/${brand.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const detail = (await res.json().catch(() => null)) as { error?: string } | null
        toast.error(detail?.error ?? "Failed to save")
        return
      }
      const updated = (await res.json()) as SavedBrandFields
      const serverValues: Partial<BrandDraft> = {}
      const patch: Partial<AdminSignatureBrand> = {}
      for (const key of keys) {
        if (key === "name") {
          serverValues.name = updated.name
          patch.name = updated.name
        } else {
          serverValues[key] = updated[key] ?? ""
          patch[key] = updated[key]
        }
      }
      setDraft((current) => {
        const next = { ...current }
        for (const key of keys) {
          const serverValue = serverValues[key]
          if (serverValue !== undefined && current[key] === snapshot[key]) next[key] = serverValue
        }
        return next
      })
      onUpdated(brand.id, patch)
      toast.success("Brand saved")
    } catch {
      toast.error("Failed to save")
    } finally {
      setSaving(false)
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
        const detail = (await res.json().catch(() => null)) as { error?: string } | null
        toast.error(detail?.error ?? "Failed to upload banner")
        return
      }
      const payload = (await res.json()) as { bannerUrl: string; bannerWidth: number; bannerHeight: number }
      onUpdated(brand.id, {
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
    // Fields get the width. Beside them the preview squeezed the fields to ~250px at 1280 (toolbars
    // wrapping to three rows), so it only sits alongside on very wide screens and below otherwise.
    // A flex column (not a one-column grid) below 2xl: the save bar is then a flex item of the whole
    // editor, so its sticky bottom holds for the full length of the form — in a grid it would be
    // pinned inside its own one-row cell. scroll-mb on every descendant: tabbing scrolls the focused
    // control clear of the pinned save bar instead of underneath it (WCAG 2.4.11).
    <div className="flex flex-col gap-6 [&_*]:scroll-mb-28 2xl:grid 2xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="brand-name">Name</Label>
          <Input
            id="brand-name"
            value={draft.name}
            disabled={!canEdit}
            maxLength={120}
            aria-invalid={nameInvalid || undefined}
            aria-describedby={nameInvalid ? "brand-name-error" : undefined}
            onChange={(e) => setField("name", e.target.value)}
          />
          {nameInvalid && (
            <p id="brand-name-error" className="text-xs text-destructive">
              Name is required.
            </p>
          )}
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
          <p className="text-xs text-muted-foreground">Transparent PNG. Uploads save straight away.</p>
        </div>

        <div className="space-y-1.5">
          <Label>Badges</Label>
          <SignatureBadgeList
            brandId={brand.id}
            badges={brand.badges}
            canEdit={canEdit}
            onChange={(badges) => onUpdated(brand.id, { badges })}
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
            value={draft.senderLayout}
            insertTokens={INSERT_TOKENS}
            disabled={!canEdit}
            onChange={(html) => setField("senderLayout", html)}
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
              value={draft[key]}
              disabled={!canEdit}
              onChange={(html) => setField(key, html)}
            />
            <p className="text-xs text-muted-foreground">
              Blank inherits the shared default
              {defaults?.[defaultKey]
                ? `: “${toPlainText(defaults[defaultKey])}”`
                : defaults
                  ? ", which is blank — so the line is left out."
                  : "."}
            </p>
          </div>
        ))}
      </div>

      {/* From 2xl this column is one sticky block — preview, "Preview as" and the save bar stay in
          view while the long form scrolls beside it. Below 2xl it is `contents`, so its children join
          the editor's flex column: the preview follows the fields and the save bar pins to the
          bottom of the viewport the whole way down, landing under the preview at the end. */}
      <div className="contents 2xl:sticky 2xl:top-4 2xl:block 2xl:min-w-0 2xl:space-y-3 2xl:self-start">
        <div className="min-w-0 space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>Live preview</Label>
              {loadingPreview && previewHtml !== null ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground" role="status">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  Updating preview…
                </span>
              ) : previewFailed ? (
                <span className="text-xs text-destructive" role="status">
                  Preview couldn&apos;t update
                </span>
              ) : isDirty ? (
                <span className="text-xs text-muted-foreground">Showing unsaved changes</span>
              ) : null}
            </div>
            {/* Angora background + email font, matching the container the signature sits in when sent.
                Beside the fields (2xl) it gives up height on a short screen, so the sticky column —
                save bar included — always fits in the viewport. */}
            <div className="h-[420px] max-w-2xl overflow-auto rounded-md border bg-[#e8e5df] 2xl:h-[min(420px,calc(100svh_-_20rem))] 2xl:min-h-[200px] 2xl:max-w-none">
              {previewHtml === null ? (
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

        {canEdit && (
          <div
            className={cn(
              // Pinned to the bottom of the viewport. Below 2xl that holds the whole way down the form;
              // from 2xl it holds inside the sticky column, overlaying the preview's foot when the
              // column starts low on a short screen rather than sitting below the fold.
              "sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 shadow-md",
              isDirty ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950" : "bg-card",
            )}
          >
            <p className={cn("text-sm", isDirty && "font-medium")} role="status" aria-live="polite">
              {saving ? "Saving changes…" : isDirty ? "Unsaved changes" : "All changes saved"}
            </p>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDiscard}
                disabled={!isDirty || saving}
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden />
                Discard
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleSave()}
                disabled={!isDirty || saving || nameInvalid}
              >
                {saving ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Save className="mr-1 h-3.5 w-3.5" aria-hidden />
                )}
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
