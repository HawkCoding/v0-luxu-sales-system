"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { useJobLegReferences, type JobLegReferenceRow } from "@/lib/use-data"

interface JobReferencesTabProps {
  bookingId: string
}

interface RowDraft {
  reference: string
  contactName: string
  flightNumber: string
  footnote: string
}

function draftFromRow(row: JobLegReferenceRow): RowDraft {
  return {
    reference: row.supplierReference ?? "",
    contactName: row.supplierContactName ?? "",
    flightNumber: row.flightNumber ?? "",
    footnote: row.voucherFootnote ?? "",
  }
}

function isDirty(draft: RowDraft, row: JobLegReferenceRow): boolean {
  return (
    draft.reference !== (row.supplierReference ?? "") ||
    draft.contactName !== (row.supplierContactName ?? "") ||
    draft.flightNumber !== (row.flightNumber ?? "") ||
    draft.footnote !== (row.voucherFootnote ?? "")
  )
}

export function JobReferencesTab({ bookingId }: JobReferencesTabProps) {
  const { data, error, isLoading, mutate } = useJobLegReferences(bookingId)
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    setDrafts((prev) => {
      const next = { ...prev }
      for (const row of data.rows) {
        if (!(row.key in next)) next[row.key] = draftFromRow(row)
      }
      return next
    })
  }, [data])

  function updateDraft(key: string, patch: Partial<RowDraft>) {
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  async function saveRow(row: JobLegReferenceRow) {
    const draft = drafts[row.key]
    if (!draft) return
    setSavingKey(row.key)
    try {
      const response = await fetch(`/api/jobs/${bookingId}/leg-references`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: [
            {
              kind: row.kind,
              id: row.id,
              supplierReference: draft.reference.trim() || null,
              // Airline rows edit Flight number instead of Contact name — send only the field
              // this row's second box actually is, so saving one never blanks the other.
              ...(row.isAirline
                ? { flightNumber: draft.flightNumber.trim() || null }
                : { supplierContactName: draft.contactName.trim() || null }),
              voucherFootnote: draft.footnote.trim() || null,
            },
          ],
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Could not save voucher details")
      await mutate()
      toast.success("Voucher details saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save voucher details")
    } finally {
      setSavingKey(null)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Voucher Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertTitle>Could not load voucher details</AlertTitle>
        <AlertDescription>Reload the page and try again.</AlertDescription>
      </Alert>
    )
  }

  const rows = data?.rows ?? []
  const missingCount = rows.filter((row) => !row.supplierReference?.trim()).length

  return (
    <Card>
      <CardHeader>
        <CardTitle>Voucher Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No package legs or transport trips are booked on this job yet — voucher details will
            appear here once suppliers are selected.
          </p>
        ) : missingCount > 0 ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>
              {missingCount} {missingCount === 1 ? "leg is" : "legs are"} missing a reference number
            </AlertTitle>
            <AlertDescription>
              A voucher cannot be generated until every leg below has a supplier reference number.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>All legs have reference numbers</AlertTitle>
          </Alert>
        )}

        <div className="space-y-3">
          {rows.map((row) => {
            const draft = drafts[row.key] ?? draftFromRow(row)
            const dirty = isDirty(draft, row)
            const missing = !row.supplierReference?.trim()
            return (
              <div key={row.key} className="space-y-3 rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{row.label}</span>
                      {missing ? <Badge variant="destructive">Required</Badge> : null}
                    </div>
                    {row.supplierName ? (
                      <p className="text-xs text-muted-foreground">{row.supplierName}</p>
                    ) : null}
                  </div>
                  <Button size="sm" onClick={() => saveRow(row)} disabled={!dirty || savingKey === row.key}>
                    {savingKey === row.key ? "Saving…" : "Save"}
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`ref-${row.key}`}>{row.isAirline ? "Booking number" : "Reference number"}</Label>
                    <Input
                      id={`ref-${row.key}`}
                      value={draft.reference}
                      onChange={(event) => updateDraft(row.key, { reference: event.target.value })}
                      placeholder={row.isAirline ? "Airline booking reference" : "Supplier reference number"}
                    />
                  </div>
                  {row.isAirline ? (
                    <div className="space-y-1">
                      <Label htmlFor={`flight-${row.key}`}>Flight number</Label>
                      <Input
                        id={`flight-${row.key}`}
                        value={draft.flightNumber}
                        onChange={(event) => updateDraft(row.key, { flightNumber: event.target.value })}
                        placeholder="FA212"
                      />
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Label htmlFor={`contact-${row.key}`}>Contact name</Label>
                      <Input
                        id={`contact-${row.key}`}
                        value={draft.contactName}
                        onChange={(event) => updateDraft(row.key, { contactName: event.target.value })}
                        placeholder="e.g. Carla"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor={`footnote-${row.key}`}>
                    {row.isAirline ? "Special note for this flight" : "Special note for this leg"}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Anything the guest needs to know that isn&apos;t already shown above. It prints on
                    the voucher, under this {row.isAirline ? "flight" : "supplier"}&apos;s details.
                    <br />
                    {row.isAirline
                      ? "Example: “Check in 3 hours before departure — international counters, Terminal A”"
                      : "Example: “Check in at Irene Country Lodge 2 hours before departure”"}
                  </p>
                  <Textarea
                    id={`footnote-${row.key}`}
                    rows={2}
                    value={draft.footnote}
                    onChange={(event) => updateDraft(row.key, { footnote: event.target.value })}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
