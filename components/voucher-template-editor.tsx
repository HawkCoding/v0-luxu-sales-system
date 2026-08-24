"use client"

import { useState, useCallback, useMemo } from "react"
import { useSWRConfig } from "swr"
import { toast } from "sonner"
import { Eye, EyeOff, GripVertical, Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  generateVoucherHTML,
  type VoucherData,
  type VoucherPreviewBrand,
} from "@/lib/generate-voucher"
import type { VoucherTemplate, VoucherSectionKey } from "@/lib/types"
import { VOUCHER_TEMPLATE_DEFAULTS } from "@/lib/types"
import { VOUCHER_FONT_OPTIONS } from "@/lib/voucher/voucher-fonts"
import { useDocumentBrandSettings } from "@/lib/use-data"

const SECTION_LABELS: Record<VoucherSectionKey, string> = {
  guest_info: "Guest Information",
  service_provider: "Service Provider",
  footer: "Footer & Contact",
}

const PREVIEW_DATA: VoucherData = {
  voucherNumber: "180226-01",
  guestNames: "Mr & Mrs Sample Guest",
  consultantName: "Carmen de Jongh",
  supplierName: "Rovos Rail",
  route: "Cape Town to Pretoria",
  departure: "10 March 2026 at 11h00",
  arrival: "13 March 2026 at 16h00",
  suiteType: "Double Deluxe Suite",
  passengerTotals: { adultCount: 2, childCount: 1, infantCount: 1 },
  specialRequests: "Anniversary celebration",
  customerEmail: "guest@example.com",
  customerPhone: "+27 82 000 0000",
  consultant: "CDJ",
  enquiry: {
    id: "preview",
    jobId: "preview",
    source: "email",
    purpose: "reservation",
    title: "Mr",
    name: "Sample",
    surname: "Guest",
    contactNumber: "+27 82 000 0000",
    email: "guest@example.com",
    country: "South Africa",
    direction: "Cape Town to Pretoria",
    departureDate: "2026-03-10",
    noOfSuites: 1,
    noOfAdults: 2,
    noOfChildren: 0,
    suiteTypes: ["Double Deluxe Suite"],
    termsAccepted: true,
    createdAt: new Date().toISOString(),
  },
}

interface SectionRowProps {
  sectionKey: VoucherSectionKey
  hidden: boolean
  onToggleHidden: () => void
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: () => void
  dragging: boolean
}

function SectionRow({ sectionKey, hidden, onToggleHidden, onDragStart, onDragOver, onDrop, dragging }: SectionRowProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e) }}
      onDrop={onDrop}
      className={cn(
        "flex items-center gap-3 rounded-md border bg-card px-3 py-2 select-none transition-opacity",
        dragging ? "opacity-40" : "opacity-100",
        "cursor-grab active:cursor-grabbing"
      )}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className={cn("flex-1 text-sm", hidden && "line-through text-muted-foreground")}>
        {SECTION_LABELS[sectionKey]}
      </span>
      <button
        type="button"
        onClick={onToggleHidden}
        className="text-muted-foreground hover:text-foreground transition-colors"
        title={hidden ? "Show section" : "Hide section"}
      >
        {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

interface Props {
  initial: VoucherTemplate
  canEdit: boolean
}

export function VoucherTemplateEditor({ initial, canEdit }: Props) {
  const { mutate } = useSWRConfig()
  const { data: brandSettings } = useDocumentBrandSettings()
  const [draft, setDraft] = useState<VoucherTemplate>({ ...VOUCHER_TEMPLATE_DEFAULTS, ...initial })
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [draggingKey, setDraggingKey] = useState<VoucherSectionKey | null>(null)

  const previewBrand: VoucherPreviewBrand = useMemo(
    () => ({
      heading: brandSettings?.brand_block_heading ?? "",
      subheading: brandSettings?.brand_block_subheading ?? "",
      logoUrl: brandSettings?.brand_block_logo_url || null,
    }),
    [brandSettings],
  )

  const set = useCallback(<K extends keyof VoucherTemplate>(key: K, value: VoucherTemplate[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch("/api/voucher-template", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accent_colour: draft.accent_colour,
          section_bg: draft.section_bg,
          font_family: draft.font_family,
          section_order: draft.section_order,
          hidden_sections: draft.hidden_sections,
          footer_phone: draft.footer_phone,
          footer_email: draft.footer_email,
          guidance_text: draft.guidance_text,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      await mutate("/api/voucher-template")
      toast.success("Voucher template saved")
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : "Unknown error"}`)
    } finally {
      setSaving(false)
    }
  }

  function handleDragOver(overKey: VoucherSectionKey) {
    if (!draggingKey || draggingKey === overKey) return
    const order = [...draft.section_order]
    const fromIdx = order.indexOf(draggingKey)
    const toIdx = order.indexOf(overKey)
    if (fromIdx === -1 || toIdx === -1) return
    order.splice(fromIdx, 1)
    order.splice(toIdx, 0, draggingKey)
    set("section_order", order)
  }

  const previewHtml = generateVoucherHTML(PREVIEW_DATA, draft, previewBrand)

  return (
    <div className="flex flex-col gap-6">
      {/* The voucher masthead — logo, heading and sub-heading — is set once on the Branding
          tab (brand block), which feeds every document (voucher, itinerary, quote, invoice). */}
      <p className="text-xs text-muted-foreground">
        The voucher masthead — logo, heading and sub-heading — is set on the{" "}
        <span className="font-medium">Branding</span> tab (brand block) so it stays
        consistent across quotes, invoices, vouchers and itineraries.
      </p>

      <Separator />

      {/* ── Brand & Typography ── */}
      <section>
        <h3 className="text-sm font-semibold mb-3">Brand & Typography</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accent_colour">Accent colour</Label>
            <div className="flex items-center gap-2">
              <input
                id="accent_colour"
                type="color"
                value={draft.accent_colour}
                onChange={(e) => set("accent_colour", e.target.value)}
                disabled={!canEdit}
                className="h-9 w-9 rounded border cursor-pointer disabled:cursor-not-allowed"
              />
              <Input
                value={draft.accent_colour}
                onChange={(e) => set("accent_colour", e.target.value)}
                disabled={!canEdit}
                className="font-mono uppercase"
                maxLength={7}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="section_bg">Section header colour</Label>
            <div className="flex items-center gap-2">
              <input
                id="section_bg"
                type="color"
                value={draft.section_bg}
                onChange={(e) => set("section_bg", e.target.value)}
                disabled={!canEdit}
                className="h-9 w-9 rounded border cursor-pointer disabled:cursor-not-allowed"
              />
              <Input
                value={draft.section_bg}
                onChange={(e) => set("section_bg", e.target.value)}
                disabled={!canEdit}
                className="font-mono uppercase"
                maxLength={7}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="font_family">Font family</Label>
            <Select
              value={draft.font_family}
              onValueChange={(v) => set("font_family", v)}
              disabled={!canEdit}
            >
              <SelectTrigger id="font_family">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOUCHER_FONT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Guidance Text ── */}
      <section>
        <h3 className="text-sm font-semibold mb-3">Guidance Text</h3>
        <Textarea
          value={draft.guidance_text}
          onChange={(e) => set("guidance_text", e.target.value)}
          disabled={!canEdit}
          rows={3}
          placeholder="Please hand to your service provider…"
        />
      </section>

      <Separator />

      {/* ── Sections ── */}
      <section>
        <h3 className="text-sm font-semibold mb-1">Sections</h3>
        <p className="text-xs text-muted-foreground mb-3">Drag to reorder. Click the eye icon to show or hide a section.</p>
        <div className="flex flex-col gap-2">
          {draft.section_order.map((key) => (
            <SectionRow
              key={key}
              sectionKey={key}
              hidden={draft.hidden_sections.includes(key)}
              dragging={draggingKey === key}
              onDragStart={() => setDraggingKey(key)}
              onDragOver={() => handleDragOver(key)}
              onDrop={() => setDraggingKey(null)}
              onToggleHidden={() => {
                const hidden = draft.hidden_sections.includes(key)
                  ? draft.hidden_sections.filter((s) => s !== key)
                  : [...draft.hidden_sections, key]
                set("hidden_sections", hidden)
              }}
            />
          ))}
        </div>
      </section>

      <Separator />

      {/* ── Footer Details ── */}
      <section>
        <h3 className="text-sm font-semibold mb-3">Footer Contact Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="footer_phone">Phone</Label>
            <Input
              id="footer_phone"
              value={draft.footer_phone}
              onChange={(e) => set("footer_phone", e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="footer_email">Email</Label>
            <Input
              id="footer_email"
              type="email"
              value={draft.footer_email}
              onChange={(e) => set("footer_email", e.target.value)}
              disabled={!canEdit}
            />
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Live Preview ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Preview</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const w = window.open("", "_blank")
              if (w) { w.document.write(previewHtml); w.document.close() }
            }}
          >
            Open full preview
          </Button>
        </div>
        <div
          className={cn(
            "border rounded-lg overflow-hidden bg-white transition-all",
            showPreview ? "block" : "hidden sm:block"
          )}
          style={{ height: 480 }}
        >
          <iframe
            srcDoc={previewHtml}
            title="Voucher preview"
            className="w-full h-full"
            style={{ transform: "scale(1)", transformOrigin: "top left" }}
            sandbox="allow-same-origin"
          />
        </div>
        <button
          className="sm:hidden text-xs text-primary mt-2"
          onClick={() => setShowPreview((v) => !v)}
        >
          {showPreview ? "Hide preview" : "Show preview"}
        </button>
      </section>

      {/* ── Save bar ── */}
      {canEdit && (
        <div className="sticky bottom-0 -mx-6 px-6 py-3 bg-background/95 backdrop-blur border-t flex justify-end gap-3 z-10">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Changes
          </Button>
        </div>
      )}
    </div>
  )
}
