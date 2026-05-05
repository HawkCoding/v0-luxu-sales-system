"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumericInput } from "@/components/ui/numeric-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type {
  BookingTransportRequest,
  Enquiry,
  Itinerary,
  TransportServiceType,
  Traveller,
} from "@/lib/types"
import { formatDisplayDate } from "@/lib/date-format"
import { Check, Pencil, Plus, Save, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

type EditableTransportRequest = BookingTransportRequest & {
  isDraft?: boolean
}

interface JobEnquiryTabProps {
  enquiry: Enquiry | null
  itineraries: Itinerary[]
  onTransportRequestsChange?: () => void
}

function toDateTimeLocalValue(value: string | null | undefined): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function fromDateTimeLocalValue(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
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
    pickupPoint: "",
    dropoffPoint: "",
    pickupAt: null,
    returnAt: null,
    passengerCount: null,
    luggageCount: null,
    flightNumber: null,
    notes: null,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  }
}

export function JobEnquiryTab({ enquiry, itineraries, onTransportRequestsChange }: JobEnquiryTabProps) {
  const initialTransportRequests = useMemo(
    () => enquiry?.transportRequests ?? [],
    [enquiry?.transportRequests],
  )
  const [transportRequests, setTransportRequests] = useState<EditableTransportRequest[]>(initialTransportRequests)
  const [editingTransportRequestIds, setEditingTransportRequestIds] = useState<Set<string>>(new Set())
  const [isSavingTransport, setIsSavingTransport] = useState(false)

  useEffect(() => {
    setTransportRequests(initialTransportRequests)
    setEditingTransportRequestIds(new Set())
  }, [initialTransportRequests])

  if (!enquiry) {
    return <div className="text-center py-8 text-sm text-muted-foreground">No enquiry data</div>
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
              returnAt: key === "serviceType" && value === "transfer" ? null : request.returnAt,
            }
          : request,
      ),
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
            pickupPoint: request.pickupPoint,
            dropoffPoint: request.dropoffPoint,
            pickupAt: request.pickupAt,
            returnAt: request.serviceType === "rental" ? request.returnAt : null,
            passengerCount: request.passengerCount,
            luggageCount: request.luggageCount,
            flightNumber: request.flightNumber,
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

  return (
    <div className="space-y-4">
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

      {/* Journey Details */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Journey Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Direction" value={enquiry.direction} />
            <Field label="Departure Date" value={formatDisplayDate(enquiry.departureDate)} />
            <Field label="Purpose" value={enquiry.purpose} />
            <Field label="No. of Suites" value={String(enquiry.noOfSuites)} />
            <Field label="Adults" value={String(enquiry.noOfAdults)} />
            <Field label="Children" value={String(enquiry.noOfChildren)} />
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
                        <Input
                          type="datetime-local"
                          value={toDateTimeLocalValue(request.pickupAt)}
                          onChange={(event) =>
                            updateTransportRequest(
                              request.id,
                              "pickupAt",
                              fromDateTimeLocalValue(event.target.value),
                            )
                          }
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
                          <Input
                            type="datetime-local"
                            value={toDateTimeLocalValue(request.returnAt)}
                            onChange={(event) =>
                              updateTransportRequest(
                                request.id,
                                "returnAt",
                                fromDateTimeLocalValue(event.target.value),
                              )
                            }
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
              <Field label="Return date/time" value={request.returnAtDisplay ?? "Not set"} />
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
      <Field label="Date of Birth" value={traveller.dateOfBirth} />
    </div>
  )
}
