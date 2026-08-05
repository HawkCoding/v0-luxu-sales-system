"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import { Pencil, Save, TriangleAlert, X } from "lucide-react"
import { toast } from "sonner"
import { formatDisplayDate } from "@/lib/date-format"
import { TravellerCountsEditor } from "@/components/bookings/traveller-counts-editor"

export interface ParsedFields {
  noOfAdults: number
  noOfChildren: number
  childAges: number[]
  noOfSuites: number
  departureDate: string | null
  direction: string | null
}

interface EnquiryParsedFieldsEditorProps {
  bookingId: string
  fields: ParsedFields
  /** Traveller counts as first captured from the enquiry, kept for reference once a salesperson edits the current ones. */
  originalNoOfAdults?: number
  originalNoOfChildren?: number
  /** False when `fields.direction` is the customer's raw wording, not a route the system resolved. */
  directionResolved?: boolean
  readonly?: boolean
  onSaved?: () => void | Promise<void>
}

export function EnquiryParsedFieldsEditor({
  bookingId,
  fields,
  originalNoOfAdults,
  originalNoOfChildren,
  directionResolved = true,
  readonly = false,
  onSaved,
}: EnquiryParsedFieldsEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [draft, setDraft] = useState<ParsedFields>(fields)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const res = await fetch(`/api/jobs/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parsedFieldEdits: {
            noOfAdults: draft.noOfAdults,
            noOfChildren: draft.noOfChildren,
            childAges: draft.childAges.length > 0 ? draft.childAges : null,
            noOfSuites: draft.noOfSuites,
            departureDate: draft.departureDate ?? null,
          },
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? "Failed to save")
      }
      setIsEditing(false)
      await onSaved?.()
      toast.success("Enquiry fields updated")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setDraft(fields)
    setIsEditing(false)
  }

  const adultsChanged = originalNoOfAdults !== undefined && originalNoOfAdults !== fields.noOfAdults
  const childrenChanged = originalNoOfChildren !== undefined && originalNoOfChildren !== fields.noOfChildren
  const originalMismatch = adultsChanged || childrenChanged

  const readFields = [
    { label: "Direction", value: fields.direction, unresolved: Boolean(fields.direction) && !directionResolved },
    { label: "Departure Date", value: formatDisplayDate(fields.departureDate) },
    { label: "Adults", value: String(fields.noOfAdults) },
    { label: "Children", value: String(fields.noOfChildren) },
    ...(fields.childAges.length > 0 ? [{ label: "Child ages", value: fields.childAges.join(", ") }] : []),
    { label: "No. of Suites", value: String(fields.noOfSuites) },
  ]

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium">Journey Details</CardTitle>
          {!readonly && !isEditing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(true)}
              aria-label="Edit journey details"
            >
              <Pencil className="w-3.5 h-3.5 mr-1.5" />
              Edit
            </Button>
          )}
          {!readonly && isEditing && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleCancel}
                disabled={isSaving}
                aria-label="Cancel editing"
              >
                <X className="w-3.5 h-3.5 mr-1.5" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving} aria-label="Save journey details">
                <Save className="w-3.5 h-3.5 mr-1.5" />
                {isSaving ? "Saving…" : "Save"}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {originalMismatch && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            <TriangleAlert className="mt-0.5 w-4 h-4 shrink-0" />
            <p>
              Originally requested: {originalNoOfAdults} adult{originalNoOfAdults === 1 ? "" : "s"},{" "}
              {originalNoOfChildren} child{originalNoOfChildren === 1 ? "" : "ren"}. If a quote is already
              built, the Build Booking dialog will flag any suite split that needs updating to match.
            </p>
          </div>
        )}
        {isEditing ? (
          <div className="space-y-4">
            <TravellerCountsEditor
              value={{ noOfAdults: draft.noOfAdults, noOfChildren: draft.noOfChildren, childAges: draft.childAges }}
              onChange={(next) => setDraft((d) => ({ ...d, ...next }))}
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label htmlFor="pfe-suites" className="text-xs text-muted-foreground">
                  No. of Suites
                </Label>
                <Input
                  id="pfe-suites"
                  type="number"
                  min={1}
                  value={draft.noOfSuites}
                  onChange={(e) => setDraft((d) => ({ ...d, noOfSuites: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pfe-departure" className="text-xs text-muted-foreground">
                  Departure Date
                </Label>
                <DatePicker
                  id="pfe-departure"
                  value={draft.departureDate ?? ""}
                  onChange={(value) => setDraft((d) => ({ ...d, departureDate: value || null }))}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {readFields.map(({ label, value, unresolved }) => (
              <div key={label} className="space-y-1">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-medium flex items-center gap-1.5">
                  {value || "—"}
                  {unresolved && (
                    <span
                      className="inline-flex items-center text-amber-600 dark:text-amber-500"
                      title="Not matched to a database route -- shown as the customer wrote it"
                    >
                      <TriangleAlert className="w-3.5 h-3.5" aria-hidden="true" />
                      <span className="sr-only">Unresolved</span>
                    </span>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
