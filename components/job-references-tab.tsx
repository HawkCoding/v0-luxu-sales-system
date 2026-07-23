"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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

export function JobReferencesTab({ bookingId }: JobReferencesTabProps) {
  const { data, error, isLoading, mutate } = useJobLegReferences(bookingId)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    setDrafts((prev) => {
      const next = { ...prev }
      for (const row of data.rows) {
        if (!(row.key in next)) next[row.key] = row.supplierReference ?? ""
      }
      return next
    })
  }, [data])

  async function saveRow(row: JobLegReferenceRow) {
    setSavingKey(row.key)
    try {
      const response = await fetch(`/api/jobs/${bookingId}/leg-references`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: [{ kind: row.kind, id: row.id, supplierReference: drafts[row.key]?.trim() || null }],
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Could not save reference number")
      await mutate()
      toast.success("Reference saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save reference number")
    } finally {
      setSavingKey(null)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Voucher References</CardTitle>
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
        <AlertTitle>Could not load voucher references</AlertTitle>
        <AlertDescription>Reload the page and try again.</AlertDescription>
      </Alert>
    )
  }

  const rows = data?.rows ?? []
  const missingCount = rows.filter((row) => !row.supplierReference?.trim()).length

  return (
    <Card>
      <CardHeader>
        <CardTitle>Voucher References</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No package legs or transport trips are booked on this job yet — reference numbers will
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
            const draft = drafts[row.key] ?? ""
            const dirty = draft !== (row.supplierReference ?? "")
            const missing = !row.supplierReference?.trim()
            return (
              <div key={row.key} className="flex flex-wrap items-end gap-3 rounded-md border p-3">
                <div className="min-w-[200px] flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{row.label}</span>
                    {missing ? <Badge variant="destructive">Required</Badge> : null}
                  </div>
                  {row.supplierName ? (
                    <p className="text-xs text-muted-foreground">{row.supplierName}</p>
                  ) : null}
                </div>
                <div className="flex items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor={`ref-${row.key}`} className="sr-only">
                      Reference number for {row.label}
                    </Label>
                    <Input
                      id={`ref-${row.key}`}
                      value={draft}
                      onChange={(event) =>
                        setDrafts((prev) => ({ ...prev, [row.key]: event.target.value }))
                      }
                      placeholder="Supplier reference number"
                      className="w-56"
                    />
                  </div>
                  <Button size="sm" onClick={() => saveRow(row)} disabled={!dirty || savingKey === row.key}>
                    {savingKey === row.key ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
