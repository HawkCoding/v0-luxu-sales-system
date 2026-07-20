"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  EMAIL_APPEARANCE_DEFAULTS,
  EMAIL_FONT_FAMILY_LABELS,
  EMAIL_FONT_FAMILY_OPTIONS,
  EMAIL_FONT_SIZE_OPTIONS,
} from "@/lib/email/appearance"
import { useEmailAppearanceSettings } from "@/lib/use-data"

interface EmailAppearanceSettingsEditorProps {
  canEdit: boolean
}

export function EmailAppearanceSettingsEditor({ canEdit }: EmailAppearanceSettingsEditorProps) {
  const { data, isLoading, error, mutate } = useEmailAppearanceSettings()
  const [fontFamily, setFontFamily] = useState<string>(EMAIL_APPEARANCE_DEFAULTS.email_font_family)
  const [fontSize, setFontSize] = useState<string>(EMAIL_APPEARANCE_DEFAULTS.email_font_size)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!data) return
    setFontFamily(data.email_font_family)
    setFontSize(data.email_font_size)
  }, [data])

  const dirty =
    !!data && (data.email_font_family !== fontFamily || data.email_font_size !== fontSize)

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/settings/email-appearance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_font_family: fontFamily, email_font_size: fontSize }),
      })
      if (!res.ok) throw new Error()
      toast.success("Email font saved")
      mutate()
    } catch {
      toast.error("Failed to save email font")
    } finally {
      setSaving(false)
    }
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Couldn’t load email appearance settings. Refresh to try again.
      </p>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="animate-pulse space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-10 bg-secondary rounded" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="email-font-family">Font</Label>
          <Select value={fontFamily} onValueChange={setFontFamily} disabled={!canEdit}>
            <SelectTrigger id="email-font-family" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMAIL_FONT_FAMILY_OPTIONS.map((option) => (
                <SelectItem key={option} value={option} style={{ fontFamily: option }}>
                  {EMAIL_FONT_FAMILY_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full space-y-1.5 sm:w-32">
          <Label htmlFor="email-font-size">Size</Label>
          <Select value={fontSize} onValueChange={setFontSize} disabled={!canEdit}>
            <SelectTrigger id="email-font-size" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMAIL_FONT_SIZE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option.replace("px", " px")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border bg-muted/30 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Preview
        </p>
        <p className="mt-2 text-foreground" style={{ fontFamily, fontSize, lineHeight: 1.5 }}>
          Thank you for your enquiry. We are pleased to share your Luxus Travel &amp; Tours quote for
          review.
        </p>
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </div>
  )
}
