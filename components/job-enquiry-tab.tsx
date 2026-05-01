"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Enquiry, Itinerary, Traveller } from "@/lib/types"
import { formatDisplayDate } from "@/lib/date-format"

export function JobEnquiryTab({ enquiry, itineraries }: { enquiry: Enquiry | null; itineraries: Itinerary[] }) {
  if (!enquiry) {
    return <div className="text-center py-8 text-sm text-muted-foreground">No enquiry data</div>
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
