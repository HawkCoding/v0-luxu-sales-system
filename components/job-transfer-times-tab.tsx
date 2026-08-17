"use client"

import { useEffect, useState } from "react"
import { AlertCircle, Plane, Car } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { WallClockTimeInput } from "@/components/ui/wall-clock-time-input"
import { formatDisplayDate } from "@/lib/date-format"
import { joinLocalDateTime } from "@/lib/date-time-field"
import { useJobMovementTimes, type JobMovementTimeRow } from "@/lib/use-data"

interface JobTransferTimesTabProps {
  bookingId: string
}

interface RowDraft {
  departureDate: string
  departureTime: string
  arrivalDate: string
  arrivalTime: string
  flightNumber: string
  departureAirportCode: string
  arrivalAirportCode: string
}

function draftFromRow(row: JobMovementTimeRow): RowDraft {
  return {
    departureDate: row.departureDate ?? "",
    departureTime: row.departureTime ?? "",
    arrivalDate: row.arrivalDate ?? "",
    arrivalTime: row.arrivalTime ?? "",
    flightNumber: row.flightNumber ?? "",
    departureAirportCode: row.departureAirportCode ?? "",
    arrivalAirportCode: row.arrivalAirportCode ?? "",
  }
}

function isDirty(draft: RowDraft, row: JobMovementTimeRow): boolean {
  const saved = draftFromRow(row)
  return (Object.keys(saved) as Array<keyof RowDraft>).some((field) => draft[field] !== saved[field])
}

/** The same two rules the server enforces, so an impossible schedule is caught under the fields
 * rather than arriving as a 400 the consultant has to trace back to a box. */
function scheduleError(draft: RowDraft): string | null {
  if (!draft.arrivalDate || !draft.departureDate) return null
  if (draft.arrivalDate < draft.departureDate) return "Cannot arrive before it departs."
  if (
    draft.arrivalDate === draft.departureDate &&
    draft.arrivalTime &&
    draft.departureTime &&
    draft.arrivalTime <= draft.departureTime
  ) {
    return "Arriving on the departure day means arriving after it departs."
  }
  return null
}

export function JobTransferTimesTab({ bookingId }: JobTransferTimesTabProps) {
  const { data, error, isLoading, mutate } = useJobMovementTimes(bookingId)
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

  async function saveRow(row: JobMovementTimeRow) {
    const draft = drafts[row.key]
    if (!draft) return

    const problem = scheduleError(draft)
    if (problem) {
      toast.error(problem)
      return
    }

    // A flight's schedule is wall-clock date + time columns; a transfer's pickup is a real instant,
    // so it is recombined into an ISO timestamp exactly as the transport leg editor does.
    const update =
      row.kind === "service"
        ? {
            kind: "service" as const,
            id: row.id,
            departureDate: draft.departureDate || null,
            departureTime: draft.departureTime || null,
            arrivalDate: draft.arrivalDate || null,
            arrivalTime: draft.arrivalTime || null,
            flightNumber: draft.flightNumber.trim() || null,
            departureAirportCode: draft.departureAirportCode.trim() || null,
            arrivalAirportCode: draft.arrivalAirportCode.trim() || null,
          }
        : {
            kind: "transport_request" as const,
            id: row.id,
            pickupAt: draft.departureDate
              ? joinLocalDateTime(draft.departureDate, draft.departureTime)
              : null,
            ...(row.hasArrival
              ? {
                  returnAt: draft.arrivalDate
                    ? joinLocalDateTime(draft.arrivalDate, draft.arrivalTime)
                    : null,
                }
              : {}),
          }

    setSavingKey(row.key)
    try {
      const response = await fetch(`/api/jobs/${bookingId}/movement-times`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: [update] }),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Could not save these times")
      await mutate()
      toast.success("Times saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save these times")
    } finally {
      setSavingKey(null)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Transfer Times</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertTitle>Could not load movement times</AlertTitle>
        <AlertDescription>Reload the page and try again.</AlertDescription>
      </Alert>
    )
  }

  const rows = data?.rows ?? []
  const flights = rows.filter((row) => row.movementType === "flight")
  const transfers = rows.filter((row) => row.movementType !== "flight")
  const voucher = data?.voucher

  function renderRow(row: JobMovementTimeRow) {
    const draft = drafts[row.key] ?? draftFromRow(row)
    const dirty = isDirty(draft, row)
    const problem = scheduleError(draft)
    const landsNextDay =
      draft.arrivalDate && draft.departureDate && draft.arrivalDate > draft.departureDate

    return (
      <div key={row.key} className="space-y-3 rounded-md border p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              {row.movementType === "flight" ? (
                <Plane className="size-4 text-muted-foreground" aria-hidden />
              ) : (
                <Car className="size-4 text-muted-foreground" aria-hidden />
              )}
              <span className="text-sm font-medium">{row.label}</span>
            </div>
            {row.supplierName ? (
              <p className="text-xs text-muted-foreground">{row.supplierName}</p>
            ) : null}
          </div>
          <Button
            size="sm"
            onClick={() => saveRow(row)}
            disabled={!dirty || Boolean(problem) || savingKey === row.key}
          >
            {savingKey === row.key ? "Saving…" : "Save"}
          </Button>
        </div>

        {row.hasFlightIdentity ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor={`flight-number-${row.key}`}>Flight number</Label>
              <Input
                id={`flight-number-${row.key}`}
                value={draft.flightNumber}
                onChange={(event) => updateDraft(row.key, { flightNumber: event.target.value })}
                placeholder="FA212"
                maxLength={20}
                className="h-10 w-28"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor={`from-airport-${row.key}`}>From</Label>
              <Input
                id={`from-airport-${row.key}`}
                value={draft.departureAirportCode}
                onChange={(event) =>
                  updateDraft(row.key, { departureAirportCode: event.target.value.toUpperCase() })
                }
                placeholder="HLA"
                maxLength={4}
                aria-label="Departure airport code"
                className="h-10 w-20 text-center uppercase"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor={`to-airport-${row.key}`}>To</Label>
              <Input
                id={`to-airport-${row.key}`}
                value={draft.arrivalAirportCode}
                onChange={(event) =>
                  updateDraft(row.key, { arrivalAirportCode: event.target.value.toUpperCase() })
                }
                placeholder="CPT"
                maxLength={4}
                aria-label="Arrival airport code"
                className="h-10 w-20 text-center uppercase"
              />
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs" htmlFor={`departure-date-${row.key}`}>
              {row.movementType === "flight" ? "Departs on" : "Pick up on"}
            </Label>
            <DatePicker
              id={`departure-date-${row.key}`}
              value={draft.departureDate}
              onChange={(date) =>
                updateDraft(row.key, {
                  departureDate: date ?? "",
                  // An unset arrival follows the departure day; an overnight movement is then one
                  // deliberate edit rather than two fields every time.
                  ...(date && row.hasArrival && !draft.arrivalDate ? { arrivalDate: date } : {}),
                })
              }
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor={`departure-time-${row.key}`}>at</Label>
            <WallClockTimeInput
              id={`departure-time-${row.key}`}
              value={draft.departureTime}
              onChange={(time) => updateDraft(row.key, { departureTime: time ?? "" })}
              aria-label={row.movementType === "flight" ? "Departure time" : "Pick-up time"}
            />
          </div>

          {row.hasArrival ? (
            <>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor={`arrival-date-${row.key}`}>
                  {row.movementType === "flight" ? "Arrives on" : "Returns on"}
                </Label>
                <DatePicker
                  id={`arrival-date-${row.key}`}
                  value={draft.arrivalDate}
                  onChange={(date) => updateDraft(row.key, { arrivalDate: date ?? "" })}
                  className="w-40"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor={`arrival-time-${row.key}`}>at</Label>
                <WallClockTimeInput
                  id={`arrival-time-${row.key}`}
                  value={draft.arrivalTime}
                  onChange={(time) => updateDraft(row.key, { arrivalTime: time ?? "" })}
                  aria-label={row.movementType === "flight" ? "Arrival time" : "Return time"}
                />
              </div>
            </>
          ) : null}
        </div>

        {problem ? (
          <p className="text-xs text-destructive">{problem}</p>
        ) : landsNextDay ? (
          <p className="text-xs text-muted-foreground">
            {row.movementType === "flight" ? "Arrives" : "Returns"} the following day.
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transfer Times</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Update a flight or transfer that has been rescheduled. Changing a time here does not
          create a new quote version — the quote already sent stays as it was sent.
        </p>

        {voucher?.stale ? (
          <Alert variant={voucher.sentAt ? "destructive" : "default"}>
            <AlertCircle className="size-4" />
            <AlertTitle>
              The voucher on file does not include these times
            </AlertTitle>
            <AlertDescription>
              {voucher.sentAt
                ? `A voucher was sent to the client on ${formatDisplayDate(voucher.sentAt)} with the previous times. Regenerate it from the Documents tab and send the new one.`
                : `A voucher was generated on ${formatDisplayDate(voucher.generatedAt)} with the previous times. Regenerate it from the Documents tab.`}
            </AlertDescription>
          </Alert>
        ) : null}

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No flights or transfers are booked on this job yet — they appear here once the booking
            is built.
          </p>
        ) : null}

        {flights.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Flights</h3>
            {flights.map(renderRow)}
          </div>
        ) : null}

        {transfers.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Transfers &amp; vehicle rentals
            </h3>
            {transfers.map(renderRow)}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
