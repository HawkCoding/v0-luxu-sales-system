"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useDocumentTextSettings, type DocumentTextSettings } from "@/lib/use-data"
import { SUPPLIER_VOCABULARY, type SupplierKind } from "@/lib/types"

interface DocumentTextSettingsEditorProps {
  canEdit: boolean
  /** Restrict rendered fields to these `group` values; defaults to all groups. */
  groups?: string[]
}

interface FieldConfig {
  key: keyof DocumentTextSettings
  label: string
  group: string
  multiline: boolean
  /** Saving an empty value is allowed (clears the text). Always true on a per-kind tab, where
   *  empty means "remove the override", not "blank the document". */
  allowEmpty?: boolean
}

const FIELDS: FieldConfig[] = [
  { key: "quote_doc_title", label: "Quote PDF title", group: "Quote document", multiline: false },
  { key: "quote_doc_footer_text", label: "Quote PDF footer (supports {{currency}})", group: "Quote document", multiline: true },
  { key: "quote_doc_includes_heading", label: "Quote itinerary heading", group: "Quote document", multiline: false },
  { key: "quote_doc_excludes_heading", label: "Quote exclusions heading", group: "Quote document", multiline: false },
  { key: "quote_doc_excludes_default", label: "Standing exclusion, added to every quote (leave empty to omit)", group: "Quote document", multiline: true, allowEmpty: true },
  { key: "voucher_doc_title", label: "Voucher PDF title", group: "Voucher document", multiline: false },
  { key: "invoice_doc_footer_text", label: "Invoice PDF footer", group: "Invoice document", multiline: true },
  { key: "invoice_doc_payment_note", label: "Invoice payment note (leave empty to omit)", group: "Invoice document", multiline: true, allowEmpty: true },
  { key: "invoice_doc_bank_charges_note", label: "Invoice bank-charges note (leave empty to omit)", group: "Invoice document", multiline: true, allowEmpty: true },
  { key: "itinerary_doc_journey_heading", label: "Itinerary journey heading", group: "Itinerary document", multiline: false },
  { key: "itinerary_doc_intro_text", label: "Itinerary intro paragraph (leave empty to omit)", group: "Itinerary document", multiline: true, allowEmpty: true },
]

const SUPPLIER_KINDS = Object.keys(SUPPLIER_VOCABULARY) as SupplierKind[]

export function DocumentTextSettingsEditor({ canEdit, groups: groupsFilter }: DocumentTextSettingsEditorProps) {
  const [selectedKind, setSelectedKind] = useState<SupplierKind | null>(null)
  const global = useDocumentTextSettings()
  // Reuses the "All products" SWR cache entry when no kind is selected (same key), so this never
  // doubles the request -- it's a distinct fetch only once a kind tab is actually opened.
  const overlay = useDocumentTextSettings(selectedKind)
  const { data, isLoading, error } = selectedKind ? overlay : global
  const [values, setValues] = useState<Partial<DocumentTextSettings>>({})
  const [savingField, setSavingField] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    if (!selectedKind) {
      setValues(data)
      return
    }
    // A per-kind tab shows blank (with the global value as placeholder) for anything this kind
    // hasn't overridden, so blank visibly reads as "same as All products". A value that differs
    // from the global one is this kind's own override and shows filled in.
    const globalValues = global.data
    setValues(
      Object.fromEntries(
        FIELDS.map((f) => [f.key, globalValues && data[f.key] === globalValues[f.key] ? "" : data[f.key]]),
      ),
    )
  }, [data, selectedKind, global.data])

  const handleSave = async (field: FieldConfig) => {
    const { key, label } = field
    const value = values[key]?.trim() ?? ""
    // Off the per-kind tab, an empty save is only meaningful for fields that allow clearing the
    // document text outright. On a per-kind tab it always means "remove this kind's override".
    if (!value && !field.allowEmpty && !selectedKind) return
    setSavingField(key)
    try {
      const res = await fetch("/api/settings/document-text", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selectedKind ? { kind: selectedKind, [key]: value } : { [key]: value }),
      })
      if (!res.ok) throw new Error()
      toast.success(`${label} saved`)
      global.mutate()
      if (selectedKind) overlay.mutate()
    } catch {
      toast.error(`Failed to save ${label.toLowerCase()}`)
    } finally {
      setSavingField(null)
    }
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Couldn’t load document text settings. Refresh to try again.
      </p>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="animate-pulse space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 bg-secondary rounded" />
        ))}
      </div>
    )
  }

  const groups = Array.from(new Set(FIELDS.map((f) => f.group))).filter(
    (g) => !groupsFilter || groupsFilter.includes(g),
  )

  return (
    <div className="space-y-6">
      <Tabs
        value={selectedKind ?? "all"}
        onValueChange={(v) => setSelectedKind(v === "all" ? null : (v as SupplierKind))}
      >
        <TabsList>
          <TabsTrigger value="all">All products</TabsTrigger>
          {SUPPLIER_KINDS.map((kind) => (
            <TabsTrigger key={kind} value={kind}>
              {SUPPLIER_VOCABULARY[kind].primaryProduct.bookingNoun}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {selectedKind && (
        <p className="text-xs text-muted-foreground">
          Overrides for {SUPPLIER_VOCABULARY[selectedKind].primaryProduct.bookingNoun.toLowerCase()} bookings.
          A blank field falls back to the All products value shown as its placeholder.
        </p>
      )}
      {groups.map((group) => (
        <div key={group} className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</h3>
          {FIELDS.filter((f) => f.group === group).map((field) => (
            <div key={field.key}>
              <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
              <div className="flex gap-2 mt-1 items-start">
                {field.multiline ? (
                  <Textarea
                    value={values[field.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                    readOnly={!canEdit}
                    placeholder={selectedKind ? global.data?.[field.key] : undefined}
                    rows={2}
                    className="text-sm"
                  />
                ) : (
                  <Input
                    value={values[field.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                    readOnly={!canEdit}
                    placeholder={selectedKind ? global.data?.[field.key] : undefined}
                    className="text-sm"
                  />
                )}
                {canEdit && (
                  <Button
                    size="sm"
                    onClick={() => handleSave(field)}
                    disabled={
                      savingField === field.key ||
                      (!selectedKind && !field.allowEmpty && !values[field.key]?.trim())
                    }
                  >
                    {savingField === field.key ? "Saving…" : "Save"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
