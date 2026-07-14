"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import Cropper, { type Area } from "react-easy-crop"
import { useSWRConfig } from "swr"
import { toast } from "sonner"
import {
  Eye,
  EyeOff,
  GripVertical,
  ImagePlus,
  Loader2,
  Save,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { MAX_IMAGE_BYTES, MAX_IMAGE_MB } from "@/lib/upload-limits"
import {
  createCroppedVoucherAsset,
  getVoucherCropOutput,
  type VoucherImageKind,
} from "@/lib/voucher-image-crop"
import {
  generateVoucherHTML,
  type VoucherData,
} from "@/lib/generate-voucher"
import type { VoucherTemplate, VoucherSectionKey } from "@/lib/types"
import { VOUCHER_TEMPLATE_DEFAULTS } from "@/lib/types"

const FONT_OPTIONS = [
  { value: "Georgia, serif", label: "Georgia (Serif)" },
  { value: "'Playfair Display', Georgia, serif", label: "Playfair Display (Elegant Serif)" },
  { value: "Arial, sans-serif", label: "Arial (Sans-serif)" },
  { value: "'Montserrat', Arial, sans-serif", label: "Montserrat (Modern)" },
]

const SECTION_LABELS: Record<VoucherSectionKey, string> = {
  guest_info: "Guest Information",
  service_provider: "Service Provider",
  footer: "Footer & Contact",
}

const RASTER_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const

const PREVIEW_DATA: VoucherData = {
  voucherNumber: "180226-01",
  guestNames: "Mr & Mrs Sample Guest",
  consultantName: "Carmen de Jongh",
  supplierName: "Rovos Rail",
  route: "Cape Town to Pretoria",
  departure: "10 March 2026 at 11h00",
  arrival: "13 March 2026 at 16h00",
  suiteType: "Double Deluxe Suite",
  numberOfGuests: 2,
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

interface ImageUploadZoneProps {
  label: string
  kind: VoucherImageKind
  currentUrl: string | null
  onUploaded: (url: string) => void
  disabled?: boolean
}

function ImageUploadZone({ label, kind, currentUrl, onUploaded, disabled }: ImageUploadZoneProps) {
  const [uploading, setUploading] = useState(false)
  const [cropDialogOpen, setCropDialogOpen] = useState(false)
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const output = getVoucherCropOutput(kind)
  const isBanner = kind === "banner"
  const aspect = output.width / output.height

  useEffect(() => {
    return () => {
      if (pendingImageUrl) URL.revokeObjectURL(pendingImageUrl)
    }
  }, [pendingImageUrl])

  const uploadFile = useCallback(
    async (file: File): Promise<boolean> => {
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(`Image too large. Maximum size is ${MAX_IMAGE_MB} MB.`)
        return false
      }

      setUploading(true)
      try {
        const fd = new FormData()
        fd.append("file", file)
        fd.append("kind", kind)
        const res = await fetch("/api/voucher-template/upload", { method: "POST", body: fd })
        if (!res.ok) throw new Error(await res.text())
        const { url } = await res.json()
        onUploaded(url)
        toast.success(`${label} uploaded`)
        return true
      } catch (err) {
        toast.error(`Upload failed: ${err instanceof Error ? err.message : "Unknown error"}`)
        return false
      } finally {
        setUploading(false)
      }
    },
    [kind, label, onUploaded]
  )

  const handleFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(`Image too large. Maximum size is ${MAX_IMAGE_MB} MB.`)
        return
      }

      if (!RASTER_IMAGE_TYPES.includes(file.type as (typeof RASTER_IMAGE_TYPES)[number])) {
        toast.error("Please upload a PNG, JPG, or WebP image.")
        return
      }

      if (pendingImageUrl) URL.revokeObjectURL(pendingImageUrl)
      setPendingImageUrl(URL.createObjectURL(file))
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setCroppedAreaPixels(null)
      setCropDialogOpen(true)
    },
    [pendingImageUrl, uploadFile]
  )

  const closeCropDialog = useCallback(() => {
    setCropDialogOpen(false)
    if (pendingImageUrl) URL.revokeObjectURL(pendingImageUrl)
    setPendingImageUrl(null)
    setCroppedAreaPixels(null)
  }, [pendingImageUrl])

  const uploadCroppedImage = useCallback(async () => {
    if (!pendingImageUrl || !croppedAreaPixels) {
      toast.error("Please choose the image area first.")
      return
    }

    try {
      const croppedFile = await createCroppedVoucherAsset(pendingImageUrl, croppedAreaPixels, kind)
      const uploaded = await uploadFile(croppedFile)
      if (uploaded) closeCropDialog()
    } catch (err) {
      toast.error(`Crop failed: ${err instanceof Error ? err.message : "Unknown error"}`)
    }
  }, [closeCropDialog, croppedAreaPixels, kind, pendingImageUrl, uploadFile])

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div
        className={cn(
          "relative border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors",
          kind === "logo" ? "h-28 w-28" : "h-28 flex-1",
          disabled ? "opacity-50 cursor-not-allowed" : "hover:border-primary hover:bg-muted/30"
        )}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const file = e.dataTransfer.files[0]
          if (file && !disabled) handleFile(file)
        }}
      >
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentUrl}
            alt={label}
            className={cn("object-contain rounded", kind === "logo" ? "max-h-20 max-w-20" : "max-h-20 w-full")}
          />
        ) : (
          <>
            <ImagePlus className="h-6 w-6 text-muted-foreground" />
            <span className="text-xs text-muted-foreground text-center px-2">
              {uploading ? "Uploading…" : `Click or drag ${label.toLowerCase()} here`}
            </span>
          </>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 rounded-lg">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          disabled={disabled || uploading}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = ""
          }}
        />
      </div>
      {currentUrl && (
        <button
          type="button"
          className="text-xs text-destructive hover:underline self-start"
          onClick={() => onUploaded("")}
          disabled={disabled}
        >
          Remove
        </button>
      )}
      <Dialog open={cropDialogOpen} onOpenChange={(open) => !open && closeCropDialog()}>
        <DialogContent className="sm:max-w-3xl data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 data-[state=open]:duration-0 data-[state=closed]:duration-0">
          <DialogHeader>
            <DialogTitle>Crop {label}</DialogTitle>
            <DialogDescription>
              {isBanner
                ? "Drag the image to choose the banner area. The saved banner will be 1200 x 300 pixels."
                : "Drag the image to choose the logo area."}
            </DialogDescription>
          </DialogHeader>
          <div
            className={cn(
              "relative overflow-hidden rounded-md border bg-muted",
              isBanner ? "aspect-[4/1]" : "aspect-square max-h-[56vh]",
            )}
          >
            {pendingImageUrl && (
              <Cropper
                image={pendingImageUrl}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
                restrictPosition
                showGrid={false}
              />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={`${kind}-zoom`} className="text-xs text-muted-foreground">
                Zoom
              </Label>
              <span className="text-xs tabular-nums text-muted-foreground">{zoom.toFixed(1)}x</span>
            </div>
            <Slider
              id={`${kind}-zoom`}
              min={1}
              max={4}
              step={0.1}
              value={[zoom]}
              onValueChange={(value) => setZoom(value[0] ?? 1)}
              disabled={uploading}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCropDialog} disabled={uploading}>
              Cancel
            </Button>
            <Button onClick={uploadCroppedImage} disabled={uploading || !croppedAreaPixels}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Use Image
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
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
  const [draft, setDraft] = useState<VoucherTemplate>({ ...VOUCHER_TEMPLATE_DEFAULTS, ...initial })
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [draggingKey, setDraggingKey] = useState<VoucherSectionKey | null>(null)

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
          logo_url: draft.logo_url,
          banner_url: draft.banner_url,
          header_text: draft.header_text,
          product_line: draft.product_line,
          accent_colour: draft.accent_colour,
          section_bg: draft.section_bg,
          font_family: draft.font_family,
          section_order: draft.section_order,
          hidden_sections: draft.hidden_sections,
          footer_company: draft.footer_company,
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

  const previewHtml = generateVoucherHTML(PREVIEW_DATA, draft)

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header Images ── */}
      <section>
        <h3 className="text-sm font-semibold mb-3">Header Images</h3>
        <div className="flex gap-4 items-start">
          <ImageUploadZone
            label="Logo"
            kind="logo"
            currentUrl={draft.logo_url}
            onUploaded={(url) => set("logo_url", url || null)}
            disabled={!canEdit}
          />
          <div className="flex-1">
            <ImageUploadZone
              label="Banner Image"
              kind="banner"
              currentUrl={draft.banner_url}
              onUploaded={(url) => set("banner_url", url || null)}
              disabled={!canEdit}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Logo appears left; banner fills the right side of the header. PNG, JPG or WebP, max 5 MB.
        </p>
      </section>

      <Separator />

      {/* ── Header Text ── */}
      <section>
        <h3 className="text-sm font-semibold mb-3">Header Text</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product_line">Product line</Label>
            <Input
              id="product_line"
              value={draft.product_line}
              onChange={(e) => set("product_line", e.target.value)}
              disabled={!canEdit}
              placeholder="THE BLUE TRAIN • ROVOS RAIL"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="header_text">Sub-heading</Label>
            <Input
              id="header_text"
              value={draft.header_text}
              onChange={(e) => set("header_text", e.target.value)}
              disabled={!canEdit}
              placeholder="A division of Luxus Travel & Tours"
            />
          </div>
        </div>
      </section>

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
                {FONT_OPTIONS.map((o) => (
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="footer_company">Company name</Label>
            <Input
              id="footer_company"
              value={draft.footer_company}
              onChange={(e) => set("footer_company", e.target.value)}
              disabled={!canEdit}
            />
          </div>
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
