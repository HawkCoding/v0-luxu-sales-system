"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { QuoteValidityPicker } from "@/components/ui/quote-validity-picker"
import { QUOTE_VALIDITY_ENABLED } from "@/lib/feature-flags"
import { DEFAULT_QUOTE_VALIDITY_DAYS, isoDateDaysFromNow } from "@/lib/quotes/quote-validity"
import { NumericInput } from "@/components/ui/numeric-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useActiveSuppliers, useBookingSupplierSchedules } from "@/lib/use-data"
import { useRole } from "@/lib/role-context"
import { getSupplierVocabulary } from "@/lib/types"
import type {
  BookingScheduleSupplierKind,
  BookingSupplierSchedule,
  BookingTransportRequest,
  Enquiry,
  Itinerary,
  PipelineStage,
  Supplier,
  TransportServiceType,
  Traveller,
} from "@/lib/types"
import type { GateFailure } from "@/lib/pipeline/validate-transition"
import { formatDisplayDate } from "@/lib/date-format"
import { Check, Pencil, Plus, Save, Trash2 } from "lucide-react"
import { EnquiryParsedFieldsEditor } from "@/components/enquiry-parsed-fields-editor"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

type EditableTransportRequest = BookingTransportRequest & {
  isDraft?: boolean
}

type EditableSupplierSchedule = BookingSupplierSchedule & {
  isDraft?: boolean
}

interface JobEnquiryTabProps {
  enquiry: Enquiry | null
  itineraries: Itinerary[]
  stage: PipelineStage
  hasDraftQuotes: boolean
  onQuoteStarted?: () => Promise<void> | void
  onTransportRequestsChange?: () => void
  onFieldsUpdated?: () => void | Promise<void>
}

function createEmptyTransportRequest(sortOrder: number): EditableTransportRequest {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    bookingId: "",
    serviceType: "transfer",
    supplierId: null,
    routeId: null,
    suiteTypeId: null,
    packageLegId: null,
    pickupPoint: "",
    dropoffPoint: "",
    pickupAt: null,
    rentalDetails: null,
    passengerCount: null,
    luggageCount: null,
    flightNumber: null,
    priceOverride: null,
    notes: null,
    supplierReference: null,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  }
}

function createEmptySupplierSchedule(
  supplierKind: BookingScheduleSupplierKind,
  sortOrder: number,
): EditableSupplierSchedule {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    bookingId: "",
    supplierId: null,
    supplierKind,
    label: null,
    dateFrom: "",
    dateTo: "",
    timeStart: null,
    timeEnd: null,
    notes: null,
    sortOrder,
    createdAt: now,
    updatedAt: now,
    isDraft: true,
  }
}

export function JobEnquiryTab({
  enquiry,
  itineraries,
  stage,
  hasDraftQuotes,
  onQuoteStarted,
  onTransportRequestsChange,
  onFieldsUpdated,
}: JobEnquiryTabProps) {
  const { can } = useRole()
  const { data: suppliers = [] } = useActiveSuppliers()
  const {
    data: supplierSchedulesData,
    mutate: mutateSupplierSchedules,
  } = useBookingSupplierSchedules(enquiry?.jobId)
  const initialTransportRequests = useMemo(
    () => enquiry?.transportRequests ?? [],
    [enquiry?.transportRequests],
  )
  const initialSupplierSchedules = useMemo(
    () => supplierSchedulesData ?? [],
    [supplierSchedulesData],
  )
  const [transportRequests, setTransportRequests] = useState<EditableTransportRequest[]>(initialTransportRequests)
  const [editingTransportRequestIds, setEditingTransportRequestIds] = useState<Set<string>>(new Set())
  const [isSavingTransport, setIsSavingTransport] = useState(false)
  const [supplierSchedules, setSupplierSchedules] = useState<EditableSupplierSchedule[]>(initialSupplierSchedules)
  const [editingSupplierScheduleIds, setEditingSupplierScheduleIds] = useState<Set<string>>(new Set())
  const [isSavingSupplierSchedules, setIsSavingSupplierSchedules] = useState(false)
  const [isStartingQuote, setIsStartingQuote] = useState(false)
  const [startQuoteFailures, setStartQuoteFailures] = useState<GateFailure[]>([])
  const [startQuoteDialogOpen, setStartQuoteDialogOpen] = useState(false)
  const [startQuoteValidityUntil, setStartQuoteValidityUntil] = useState<string>(
    isoDateDaysFromNow(DEFAULT_QUOTE_VALIDITY_DAYS),
  )

  useEffect(() => {
    setTransportRequests(initialTransportRequests)
    setEditingTransportRequestIds(new Set())
  }, [initialTransportRequests])

  useEffect(() => {
    setSupplierSchedules(initialSupplierSchedules)
    setEditingSupplierScheduleIds(new Set())
  }, [initialSupplierSchedules])

  if (!enquiry) {
    return <div className="text-center py-8 text-sm text-muted-foreground">No enquiry data</div>
  }

  const canStartQuote = can("edit:quotes") && stage === "enquiry" && !hasDraftQuotes

  const startQuote = async () => {
    setIsStartingQuote(true)
    setStartQuoteFailures([])
    try {
      const response = await fetch(`/api/jobs/${enquiry.jobId}/start-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Validity is hidden: the server stamps the silent org default.
        body: JSON.stringify(
          QUOTE_VALIDITY_ENABLED ? { validityUntil: startQuoteValidityUntil } : {},
        ),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        failures?: GateFailure[]
        error?: string
      }

      if (response.status === 422 && Array.isArray(payload.failures)) {
        setStartQuoteDialogOpen(false)
        setStartQuoteFailures(payload.failures)
        return
      }

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not start quote")
      }

      setStartQuoteDialogOpen(false)
      await onQuoteStarted?.()
      toast.success("Draft quote created")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start quote")
    } finally {
      setIsStartingQuote(false)
    }
  }

  function handleStartQuoteDialogOpenChange(next: boolean) {
    if (next) {
      setStartQuoteValidityUntil(isoDateDaysFromNow(DEFAULT_QUOTE_VALIDITY_DAYS))
    }
    setStartQuoteDialogOpen(next)
  }

  const updateTransportRequest = <K extends keyof EditableTransportRequest>(
    requestId: string,
    key: K,
    value: EditableTransportRequest[K],
  ) => {
    setTransportRequests((current) =>
      current.map((request) =>
        request.id === requestId
          ? {
              ...request,
              [key]: value,
              rentalDetails:
                key === "serviceType" && value === "transfer"
                  ? null
                  : key === "serviceType" && value === "rental" && !request.rentalDetails
                    ? {
                        transportRequestId: request.id,
                        returnAt: null,
                        returnCutoffTime: null,
                        createdAt: request.createdAt,
                        updatedAt: request.updatedAt,
                      }
                    : request.rentalDetails,
            }
          : request,
      ),
    )
  }

  const updateRentalDetails = (
    requestId: string,
    updates: Partial<NonNullable<EditableTransportRequest["rentalDetails"]>>,
  ) => {
    setTransportRequests((current) =>
      current.map((request) =>
        request.id === requestId
          ? {
              ...request,
              rentalDetails: {
                transportRequestId: request.id,
                returnAt: null,
                returnCutoffTime: null,
                createdAt: request.createdAt,
                updatedAt: request.updatedAt,
                ...request.rentalDetails,
                ...updates,
              },
            }
          : request,
      ),
    )
  }

  const updateSupplierSchedule = <K extends keyof EditableSupplierSchedule>(
    scheduleId: string,
    key: K,
    value: EditableSupplierSchedule[K],
  ) => {
    setSupplierSchedules((current) =>
      current.map((schedule) => {
        if (schedule.id !== scheduleId) return schedule
        const updated = { ...schedule, [key]: value }
        if (key === "supplierId" && value) {
          const supplier = suppliers.find((s) => s.id === value)
          if (supplier?.defaultTimeStart && !schedule.timeStart) {
            updated.timeStart = supplier.defaultTimeStart
          }
          if (supplier?.defaultTimeEnd && !schedule.timeEnd) {
            updated.timeEnd = supplier.defaultTimeEnd
          }
        }
        return updated
      }),
    )
  }

  const saveTransportRequests = async () => {
    const incompleteRequest = transportRequests.find(
      (request) => !request.pickupPoint.trim() || !request.dropoffPoint.trim(),
    )
    if (incompleteRequest) {
      toast.error("Complete pickup and drop-off points before saving transport requests.")
      return
    }
    const incompleteRental = transportRequests.find(
      (request) => request.serviceType === "rental" && !request.rentalDetails?.returnAt,
    )
    if (incompleteRental) {
      toast.error("Complete return date/time before saving vehicle rentals.")
      return
    }

    setIsSavingTransport(true)
    try {
      const response = await fetch(`/api/jobs/${enquiry.jobId}/transport-requests`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transportRequests: transportRequests.map((request, index) => ({
            id: request.id,
            serviceType: request.serviceType,
            supplierId: request.supplierId,
            routeId: request.routeId,
            suiteTypeId: request.suiteTypeId,
            packageLegId: request.packageLegId,
            pickupPoint: request.pickupPoint,
            dropoffPoint: request.dropoffPoint,
            pickupAt: request.pickupAt,
            rentalDetails:
              request.serviceType === "rental"
                ? {
                    returnAt: request.rentalDetails?.returnAt ?? null,
                    returnCutoffTime: request.rentalDetails?.returnCutoffTime ?? null,
                  }
                : null,
            passengerCount: request.passengerCount,
            luggageCount: request.luggageCount,
            flightNumber: request.flightNumber,
            priceOverride: request.priceOverride,
            notes: request.notes,
            sortOrder: index,
          })),
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        toast.error(payload.error ?? "Failed to save transport requests")
        return
      }

      setTransportRequests(payload as EditableTransportRequest[])
      setEditingTransportRequestIds(new Set())
      await onTransportRequestsChange?.()
      toast.success("Transport requests saved")
    } catch {
      toast.error("Failed to save transport requests")
    } finally {
      setIsSavingTransport(false)
    }
  }

  const saveSupplierSchedules = async () => {
    if (!enquiry) return

    const incompleteSchedule = supplierSchedules.find((schedule) => !schedule.dateFrom || !schedule.dateTo)
    if (incompleteSchedule) {
      toast.error("Complete dates before saving supplier schedules.")
      return
    }

    const invalidHotelStay = supplierSchedules.find(
      (schedule) => schedule.supplierKind === "hotel_property" && schedule.dateTo <= schedule.dateFrom,
    )
    if (invalidHotelStay) {
      toast.error("Hotel check-out date must be after check-in date.")
      return
    }

    const invalidTrainJourney = supplierSchedules.find(
      (schedule) => schedule.supplierKind === "train_operator" && schedule.dateTo < schedule.dateFrom,
    )
    if (invalidTrainJourney) {
      toast.error("Train arrival date cannot be before departure date.")
      return
    }

    const invalidVehicleRental = supplierSchedules.find(
      (schedule) => schedule.supplierKind === "vehicle_rental" && schedule.dateTo < schedule.dateFrom,
    )
    if (invalidVehicleRental) {
      toast.error("Vehicle rental return date cannot be before pickup date.")
      return
    }

    const invalidSameDayTime = supplierSchedules.find(
      (schedule) =>
        schedule.dateFrom === schedule.dateTo &&
        schedule.timeStart &&
        schedule.timeEnd &&
        schedule.timeEnd < schedule.timeStart,
    )
    if (invalidSameDayTime) {
      toast.error("End time cannot be before start time on the same date.")
      return
    }

    setIsSavingSupplierSchedules(true)
    try {
      const response = await fetch(`/api/jobs/${enquiry.jobId}/supplier-schedules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedules: supplierSchedules.map((schedule, index) => ({
            id: schedule.id,
            supplierId: schedule.supplierId,
            supplierKind: schedule.supplierKind,
            label: schedule.label,
            dateFrom: schedule.dateFrom,
            dateTo: schedule.dateTo,
            timeStart: schedule.timeStart,
            timeEnd: schedule.timeEnd,
            notes: schedule.notes,
            sortOrder: index,
          })),
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        toast.error(payload.error ?? "Failed to save supplier schedules")
        return
      }

      setSupplierSchedules(payload as EditableSupplierSchedule[])
      setEditingSupplierScheduleIds(new Set())
      await mutateSupplierSchedules(payload as BookingSupplierSchedule[], { revalidate: false })
      toast.success("Supplier schedules saved")
    } catch {
      toast.error("Failed to save supplier schedules")
    } finally {
      setIsSavingSupplierSchedules(false)
    }
  }

  return (
    <div className="space-y-4">
      {canStartQuote && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Ready to quote</p>
              <p className="text-sm text-muted-foreground">Create a draft quote once the enquiry details are complete.</p>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={isStartingQuote}
              onClick={() =>
                QUOTE_VALIDITY_ENABLED ? handleStartQuoteDialogOpenChange(true) : startQuote()
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              {!QUOTE_VALIDITY_ENABLED && isStartingQuote ? "Starting…" : "Start Quote"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Only reachable when QUOTE_VALIDITY_ENABLED — the button above skips it otherwise. */}
      <Dialog open={startQuoteDialogOpen} onOpenChange={handleStartQuoteDialogOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Start Quote</DialogTitle>
            <DialogDescription>
              Choose how long this quote should stay valid, then start drafting it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5 py-2">
            <Label htmlFor="start-quote-validity">Valid until</Label>
            <QuoteValidityPicker
              id="start-quote-validity"
              value={startQuoteValidityUntil}
              onChange={value => setStartQuoteValidityUntil(value ?? "")}
            />
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setStartQuoteDialogOpen(false)}
              disabled={isStartingQuote}
            >
              Cancel
            </Button>
            <Button onClick={startQuote} disabled={isStartingQuote}>
              {isStartingQuote ? "Starting…" : "Start Quote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {startQuoteFailures.length > 0 && (
        <Alert>
          <AlertTitle>Quote cannot start yet</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {startQuoteFailures.map((failure) => (
                <li key={failure.gateId}>
                  {failure.message} {failure.fixHint ? <span>{failure.fixHint}</span> : null}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {enquiry.source === "email" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              Email Source <Badge variant="secondary" className="text-[10px]">inbound</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Mailbox" value={enquiry.emailImportMailbox ?? "-"} />
              <Field label="Subject" value={enquiry.emailImportSubject ?? "-"} />
              <Field label="Received" value={enquiry.emailImportReceivedAtDisplay ?? "-"} />
            </div>
            {enquiry.emailImportNeedsReview && (
              <div className="mt-4 rounded-md border border-destructive/40 p-3 text-sm">
                <p className="font-medium text-destructive">Needs Review</p>
                <p className="mt-1 text-muted-foreground">
                  {[...(enquiry.emailImportMissingFields ?? []), ...(enquiry.emailImportWarnings ?? [])].join(", ") || "Review parsed fields."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Raw text if paste or email import */}
      {enquiry.rawText && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              Original Text <Badge variant="secondary" className="text-[10px]">{enquiry.source === "email" ? "email import" : "paste import"}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap bg-secondary/50 rounded-md p-3 leading-relaxed" style={{ fontFamily: "var(--font-inter)" }}>
              {enquiry.rawText}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Journey Details — editable for enquiry stage */}
      <EnquiryParsedFieldsEditor
        bookingId={enquiry.jobId}
        fields={{
          noOfAdults: enquiry.noOfAdults,
          noOfChildren: enquiry.noOfChildren,
          noOfSuites: enquiry.noOfSuites,
          departureDate: enquiry.departureDate ?? null,
          direction: enquiry.direction ?? null,
        }}
        readonly={stage !== "enquiry"}
        onSaved={onFieldsUpdated}
      />
      {/* Purpose and Suite Types are not editable — shown separately */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Trip Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Purpose" value={enquiry.purpose} />
            <Field label="Suite Types" value={enquiry.suiteTypes.join(", ")} />
            {enquiry.childAges && enquiry.childAges.length > 0 && (
              <Field label="Child Ages" value={enquiry.childAges.join(", ")} />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Hotel & Extras */}
      {(enquiry.hotelBooking || enquiry.additionalServices) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Hotel & Additional Services</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {enquiry.hotelBooking && <Field label="Hotel Booking" value={enquiry.hotelBooking} />}
              {enquiry.hotelOption && <Field label="Hotel" value={enquiry.hotelOption} />}
              {enquiry.extendStay && <Field label="Extend Stay" value={enquiry.extendStay} />}
              {enquiry.extraNights !== undefined && enquiry.extraNights > 0 && <Field label="Extra Nights" value={String(enquiry.extraNights)} />}
              {enquiry.additionalServices && <Field label="Additional Services" value={enquiry.additionalServices} />}
              {enquiry.additionalServicesDetails && <Field label="Service Details" value={enquiry.additionalServicesDetails} />}
              {enquiry.promotionCode && <Field label="Promo Code" value={enquiry.promotionCode} />}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm font-medium">Transport Requests</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setTransportRequests((current) => {
                    const request = createEmptyTransportRequest(current.length)
                    setEditingTransportRequestIds((editingIds) => new Set(editingIds).add(request.id))
                    return [...current, request]
                  })
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={saveTransportRequests}
                disabled={isSavingTransport}
              >
                <Save className="mr-2 h-4 w-4" />
                {isSavingTransport ? "Saving" : "Save"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {transportRequests.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No structured transport requests captured yet.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {transportRequests.map((request, index) => {
                const isEditing = request.isDraft || editingTransportRequestIds.has(request.id)

                if (!isEditing) {
                  return (
                    <TransportRequestSummary
                      key={request.id}
                      request={request}
                      index={index}
                      onEdit={() =>
                        setEditingTransportRequestIds((editingIds) => new Set(editingIds).add(request.id))
                      }
                      onRemove={() =>
                        setTransportRequests((current) =>
                          current.filter((item) => item.id !== request.id),
                        )
                      }
                    />
                  )
                }

                return (
                  <div key={request.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label>Service</Label>
                      <Select
                        value={request.serviceType}
                        onValueChange={(value: TransportServiceType) =>
                          updateTransportRequest(request.id, "serviceType", value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="transfer">Transfer</SelectItem>
                          <SelectItem value="rental">Vehicle rental</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>{request.serviceType === "rental" ? "Rental pickup" : "Pickup"}</Label>
                      <Input
                        value={request.pickupPoint}
                        onChange={(event) =>
                          updateTransportRequest(request.id, "pickupPoint", event.target.value)
                        }
                        placeholder="Airport, hotel, address..."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{request.serviceType === "rental" ? "Return point" : "Drop-off"}</Label>
                      <Input
                        value={request.dropoffPoint}
                        onChange={(event) =>
                          updateTransportRequest(request.id, "dropoffPoint", event.target.value)
                        }
                        placeholder="Airport, hotel, address..."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Pickup date/time</Label>
                      <div className="flex gap-2">
                        <DateTimePicker
                          value={request.pickupAt}
                          onChange={(pickupAt) =>
                            updateTransportRequest(request.id, "pickupAt", pickupAt)
                          }
                          aria-label="Pickup date"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label={`Save pickup date and time for transport request ${index + 1}`}
                          disabled={isSavingTransport}
                          onClick={saveTransportRequests}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {request.serviceType === "rental" ? (
                      <div className="space-y-1.5">
                        <Label>Return date/time</Label>
                        <div className="flex gap-2">
                          <DateTimePicker
                            value={request.rentalDetails?.returnAt}
                            onChange={(returnAt) => updateRentalDetails(request.id, { returnAt })}
                            aria-label="Return date"
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={`Save return date and time for transport request ${index + 1}`}
                            disabled={isSavingTransport}
                            onClick={saveTransportRequests}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    {request.serviceType === "rental" ? (
                      <div className="space-y-1.5">
                        <Label>Return by (time)</Label>
                        <Input
                          type="time"
                          value={request.rentalDetails?.returnCutoffTime ?? ""}
                          onChange={(event) =>
                            updateRentalDetails(request.id, {
                              returnCutoffTime: event.target.value || null,
                            })
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Time after which return counts as next day
                        </p>
                      </div>
                    ) : null}
                    <div className="space-y-1.5">
                      <Label>Passengers</Label>
                      <NumericInput
                        min="0"
                        step="1"
                        nullable
                        value={request.passengerCount}
                        onValueChange={(value) =>
                          updateTransportRequest(request.id, "passengerCount", value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Luggage</Label>
                      <NumericInput
                        min="0"
                        step="1"
                        nullable
                        value={request.luggageCount}
                        onValueChange={(value) =>
                          updateTransportRequest(request.id, "luggageCount", value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Flight number</Label>
                      <Input
                        value={request.flightNumber ?? ""}
                        onChange={(event) =>
                          updateTransportRequest(request.id, "flightNumber", event.target.value || null)
                        }
                      />
                    </div>
                    <div className="space-y-1.5 md:col-span-2 xl:col-span-3">
                      <Label>Notes</Label>
                      <Textarea
                        value={request.notes ?? ""}
                        onChange={(event) =>
                          updateTransportRequest(request.id, "notes", event.target.value || null)
                        }
                      />
                    </div>
                    <div className="flex items-end justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={`Remove transport request ${index + 1}`}
                        onClick={() =>
                          setTransportRequests((current) =>
                            current.filter((item) => item.id !== request.id),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <SupplierScheduleSection
        title="Hotel Stays"
        emptyText="No structured hotel stays captured yet."
        supplierKind="hotel_property"
        schedules={supplierSchedules.filter((schedule) => schedule.supplierKind === "hotel_property")}
        suppliers={suppliers}
        editingIds={editingSupplierScheduleIds}
        isSaving={isSavingSupplierSchedules}
        onAdd={() =>
          setSupplierSchedules((current) => {
            const schedule = createEmptySupplierSchedule("hotel_property", current.length)
            setEditingSupplierScheduleIds((editingIds) => new Set(editingIds).add(schedule.id))
            return [...current, schedule]
          })
        }
        onEdit={(scheduleId) =>
          setEditingSupplierScheduleIds((editingIds) => new Set(editingIds).add(scheduleId))
        }
        onRemove={(scheduleId) =>
          setSupplierSchedules((current) => current.filter((schedule) => schedule.id !== scheduleId))
        }
        onSave={saveSupplierSchedules}
        onUpdate={updateSupplierSchedule}
      />

      <SupplierScheduleSection
        title="Train Journeys"
        emptyText="No structured train journeys captured yet."
        supplierKind="train_operator"
        schedules={supplierSchedules.filter((schedule) => schedule.supplierKind === "train_operator")}
        suppliers={suppliers}
        editingIds={editingSupplierScheduleIds}
        isSaving={isSavingSupplierSchedules}
        onAdd={() =>
          setSupplierSchedules((current) => {
            const schedule = createEmptySupplierSchedule("train_operator", current.length)
            setEditingSupplierScheduleIds((editingIds) => new Set(editingIds).add(schedule.id))
            return [...current, schedule]
          })
        }
        onEdit={(scheduleId) =>
          setEditingSupplierScheduleIds((editingIds) => new Set(editingIds).add(scheduleId))
        }
        onRemove={(scheduleId) =>
          setSupplierSchedules((current) => current.filter((schedule) => schedule.id !== scheduleId))
        }
        onSave={saveSupplierSchedules}
        onUpdate={updateSupplierSchedule}
      />

      <SupplierScheduleSection
        title="Vehicle Rentals"
        emptyText="No structured vehicle rentals captured yet."
        supplierKind="vehicle_rental"
        schedules={supplierSchedules.filter((schedule) => schedule.supplierKind === "vehicle_rental")}
        suppliers={suppliers}
        editingIds={editingSupplierScheduleIds}
        isSaving={isSavingSupplierSchedules}
        onAdd={() =>
          setSupplierSchedules((current) => {
            const schedule = createEmptySupplierSchedule("vehicle_rental", current.length)
            setEditingSupplierScheduleIds((editingIds) => new Set(editingIds).add(schedule.id))
            return [...current, schedule]
          })
        }
        onEdit={(scheduleId) =>
          setEditingSupplierScheduleIds((editingIds) => new Set(editingIds).add(scheduleId))
        }
        onRemove={(scheduleId) =>
          setSupplierSchedules((current) => current.filter((schedule) => schedule.id !== scheduleId))
        }
        onSave={saveSupplierSchedules}
        onUpdate={updateSupplierSchedule}
      />

      {/* Travellers */}
      {enquiry.travellers && enquiry.travellers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Adult Travellers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {enquiry.travellers.map((t, i) => (
                <TravellerRow key={i} traveller={t} index={i + 1} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {enquiry.childTravellers && enquiry.childTravellers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Child Travellers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {enquiry.childTravellers.map((t, i) => (
                <TravellerRow key={i} traveller={t} index={i + 1} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Itineraries */}
      {itineraries.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Itineraries</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {itineraries.map(it => (
              <div key={it.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">{it.name}</p>
                  <p className="text-xs text-muted-foreground">{it.notes}</p>
                </div>
                {it.acceptedAt && <Badge className="text-[10px] bg-payment-green/10 text-payment-green border-0">Accepted</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

interface TransportRequestSummaryProps {
  request: EditableTransportRequest
  index: number
  onEdit: () => void
  onRemove: () => void
}

function TransportRequestSummary({ request, index, onEdit, onRemove }: TransportRequestSummaryProps) {
  const serviceLabel = request.serviceType === "rental" ? "Vehicle rental" : "Transfer"
  const pickupLabel = request.serviceType === "rental" ? "Rental pickup" : "Pickup"
  const dropoffLabel = request.serviceType === "rental" ? "Return point" : "Drop-off"

  return (
    <div className="rounded-md border bg-secondary/20 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{serviceLabel}</Badge>
            <p className="text-sm font-medium">
              {request.pickupPoint} to {request.dropoffPoint}
            </p>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
            <Field label={pickupLabel} value={request.pickupPoint} />
            <Field label={dropoffLabel} value={request.dropoffPoint} />
            <Field label="Pickup date/time" value={request.pickupAtDisplay ?? "Not set"} />
            {request.serviceType === "rental" ? (
              <Field label="Return date/time" value={request.rentalDetails?.returnAtDisplay ?? "Not set"} />
            ) : null}
            {request.serviceType === "rental" ? (
              <Field label="Return by" value={request.rentalDetails?.returnCutoffTime ?? "Not set"} />
            ) : null}
            <Field label="Passengers" value={request.passengerCount?.toString() ?? "Not set"} />
            <Field label="Luggage" value={request.luggageCount?.toString() ?? "Not set"} />
            <Field label="Flight number" value={request.flightNumber ?? "Not set"} />
          </div>
          {request.notes ? (
            <p className="text-sm text-muted-foreground">{request.notes}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Edit transport request ${index + 1}`}
            onClick={onEdit}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Remove transport request ${index + 1}`}
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

interface SupplierScheduleSectionProps {
  title: string
  emptyText: string
  supplierKind: BookingScheduleSupplierKind
  schedules: EditableSupplierSchedule[]
  suppliers: Supplier[]
  editingIds: Set<string>
  isSaving: boolean
  onAdd: () => void
  onEdit: (scheduleId: string) => void
  onRemove: (scheduleId: string) => void
  onSave: () => void
  onUpdate: <K extends keyof EditableSupplierSchedule>(
    scheduleId: string,
    key: K,
    value: EditableSupplierSchedule[K],
  ) => void
}

function SupplierScheduleSection({
  title,
  emptyText,
  supplierKind,
  schedules,
  suppliers,
  editingIds,
  isSaving,
  onAdd,
  onEdit,
  onRemove,
  onSave,
  onUpdate,
}: SupplierScheduleSectionProps) {
  const vocabulary = getSupplierVocabulary(supplierKind)
  const fields = vocabulary.scheduleFields
  const supplierOptions = suppliers.filter((supplier) => supplier.kind === supplierKind)
  const supplierNameById = new Map(supplierOptions.map((supplier) => [supplier.id, supplier.name]))

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Button>
            <Button type="button" size="sm" onClick={onSave} disabled={isSaving}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Saving" : "Save"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {schedules.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {schedules.map((schedule, index) => {
              const isEditing = schedule.isDraft || editingIds.has(schedule.id)

              if (!isEditing) {
                return (
                  <SupplierScheduleSummary
                    key={schedule.id}
                    schedule={schedule}
                    index={index}
                    supplierName={schedule.supplierId ? supplierNameById.get(schedule.supplierId) ?? null : null}
                    fields={fields}
                    onEdit={() => onEdit(schedule.id)}
                    onRemove={() => onRemove(schedule.id)}
                  />
                )
              }

              return (
                <div key={schedule.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label>Supplier</Label>
                    <Select
                      value={schedule.supplierId ?? "none"}
                      onValueChange={(value) =>
                        onUpdate(schedule.id, "supplierId", value === "none" ? null : value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No supplier selected</SelectItem>
                        {supplierOptions.map((supplier) => (
                          <SelectItem key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Label</Label>
                    <Input
                      value={schedule.label ?? ""}
                      onChange={(event) => onUpdate(schedule.id, "label", event.target.value || null)}
                      placeholder={supplierKind === "hotel_property" ? "Night 1" : "Outbound leg"}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{fields?.dateFromLabel ?? "Start date"}</Label>
                    <DatePicker
                      value={schedule.dateFrom}
                      onChange={(value) => onUpdate(schedule.id, "dateFrom", value ?? "")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{fields?.dateToLabel ?? "End date"}</Label>
                    <DatePicker
                      value={schedule.dateTo}
                      onChange={(value) => onUpdate(schedule.id, "dateTo", value ?? "")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{fields?.timeStartLabel ?? "Start time"}</Label>
                    <Input
                      type="time"
                      value={schedule.timeStart ?? ""}
                      onChange={(event) => onUpdate(schedule.id, "timeStart", event.target.value || null)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{fields?.timeEndLabel ?? "End time"}</Label>
                    <Input
                      type="time"
                      value={schedule.timeEnd ?? ""}
                      onChange={(event) => onUpdate(schedule.id, "timeEnd", event.target.value || null)}
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={schedule.notes ?? ""}
                      onChange={(event) => onUpdate(schedule.id, "notes", event.target.value || null)}
                    />
                  </div>
                  <div className="flex items-end justify-end xl:col-span-4">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Remove ${title.toLowerCase()} row ${index + 1}`}
                      onClick={() => onRemove(schedule.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface SupplierScheduleSummaryProps {
  schedule: EditableSupplierSchedule
  index: number
  supplierName: string | null
  fields: ReturnType<typeof getSupplierVocabulary>["scheduleFields"]
  onEdit: () => void
  onRemove: () => void
}

function SupplierScheduleSummary({
  schedule,
  index,
  supplierName,
  fields,
  onEdit,
  onRemove,
}: SupplierScheduleSummaryProps) {
  const title = schedule.label || supplierName || "Unlabelled schedule"

  return (
    <div className="rounded-md border bg-secondary/20 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{supplierName ?? "No supplier"}</Badge>
            <p className="text-sm font-medium">{title}</p>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
            <Field label={fields?.dateFromLabel ?? "Start date"} value={schedule.dateFromDisplay ?? formatDisplayDate(schedule.dateFrom)} />
            <Field label={fields?.dateToLabel ?? "End date"} value={schedule.dateToDisplay ?? formatDisplayDate(schedule.dateTo)} />
            <Field label={fields?.timeStartLabel ?? "Start time"} value={schedule.timeStart ?? "Not set"} />
            <Field label={fields?.timeEndLabel ?? "End time"} value={schedule.timeEnd ?? "Not set"} />
          </div>
          {schedule.notes ? (
            <p className="text-sm text-muted-foreground">{schedule.notes}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Edit supplier schedule ${index + 1}`}
            onClick={onEdit}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Remove supplier schedule ${index + 1}`}
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-inter)" }}>{label}</p>
      <p className="text-sm text-foreground mt-0.5">{value}</p>
    </div>
  )
}

function TravellerRow({ traveller, index }: { traveller: Traveller; index: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2 border-b border-border last:border-0">
      <Field label={`Traveller ${index}`} value={`${traveller.prefix} ${traveller.name} ${traveller.surname}`} />
      <Field label="ID/Passport" value={traveller.idPassport} />
      <Field label="Date of Birth" value={formatDisplayDate(traveller.dateOfBirth)} />
    </div>
  )
}
