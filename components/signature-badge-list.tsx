"use client"

import { useRef, useState } from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { SignatureBadge } from "@/lib/email/signature-brands"

interface SignatureBadgeListProps {
  brandId: string
  badges: SignatureBadge[]
  onChange: (badges: SignatureBadge[]) => void
  canEdit: boolean
}

const MAX_BADGES = 6

/** Repeatable badge (IATA/ASATA-style) upload list for one signature brand. */
export function SignatureBadgeList({ brandId, badges, onChange, canEdit }: SignatureBadgeListProps) {
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(file: File) {
    if (file.type !== "image/png") {
      toast.error("Badges must be PNG images.")
      return
    }
    setUploading(true)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = await fetch(`/api/settings/signature-brands/${brandId}/badges`, { method: "POST", body })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        toast.error(detail?.error ?? "Failed to upload badge")
        return
      }
      const payload = (await res.json()) as { badges: SignatureBadge[] }
      onChange(payload.badges)
    } catch {
      toast.error("Failed to upload badge")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleDelete(url: string) {
    try {
      const res = await fetch(
        `/api/settings/signature-brands/${brandId}/badges?url=${encodeURIComponent(url)}`,
        { method: "DELETE" },
      )
      if (!res.ok) {
        toast.error("Failed to remove badge")
        return
      }
      const payload = (await res.json()) as { badges: SignatureBadge[] }
      onChange(payload.badges)
    } catch {
      toast.error("Failed to remove badge")
    }
  }

  async function handleHrefChange(url: string, href: string) {
    const next = badges.map((badge) => (badge.url === url ? { ...badge, href: href || null } : badge))
    onChange(next)
    try {
      const res = await fetch(`/api/settings/signature-brands/${brandId}/badges`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ badges: next }),
      })
      if (!res.ok) toast.error("Failed to save badge link")
    } catch {
      toast.error("Failed to save badge link")
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {badges.map((badge) => (
          <div key={badge.url} className="flex flex-col gap-1 rounded-md border p-2 w-40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={badge.url} alt={badge.alt} className="h-10 w-full object-contain" />
            {canEdit && (
              <>
                <Input
                  value={badge.href ?? ""}
                  placeholder="Link URL (optional)"
                  className="h-7 text-xs"
                  onChange={(e) => handleHrefChange(badge.url, e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-destructive"
                  onClick={() => handleDelete(badge.url)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        ))}
      </div>
      {canEdit && badges.length < MAX_BADGES && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleUpload(file)
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? "Uploading…" : "Add badge"}
          </Button>
        </>
      )}
    </div>
  )
}
