"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export interface ServiceAdminDatesValue {
  bookingDate: string | null
  confirmationDate: string | null
  paymentMadeDate: string | null
  paidWith: string | null
}

interface ServiceAdminDatesProps {
  value: ServiceAdminDatesValue
  onChange: (next: ServiceAdminDatesValue) => void
}

/**
 * Internal supplier-booking record for a service: when it was placed, confirmed and paid with the
 * supplier. Feeds the booking worksheet's service-lines grid — never shown to the customer, so
 * this stays collapsed unless something is already recorded, keeping it out of the way of the
 * pricing fields the rest of the leg is about.
 */
export function ServiceAdminDates({ value, onChange }: ServiceAdminDatesProps) {
  const hasValue = Boolean(
    value.bookingDate || value.confirmationDate || value.paymentMadeDate || value.paidWith,
  )
  const [open, setOpen] = useState(hasValue)

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 p-3 text-sm font-medium"
        >
          Supplier admin
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-3 border-t p-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Booking date</Label>
            <DatePicker
              value={value.bookingDate ?? ""}
              onChange={(next) => onChange({ ...value, bookingDate: next || null })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Confirmation date</Label>
            <DatePicker
              value={value.confirmationDate ?? ""}
              onChange={(next) => onChange({ ...value, confirmationDate: next || null })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Payment made date</Label>
            <DatePicker
              value={value.paymentMadeDate ?? ""}
              onChange={(next) => onChange({ ...value, paymentMadeDate: next || null })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Paid with</Label>
            <Input
              value={value.paidWith ?? ""}
              onChange={(event) => onChange({ ...value, paidWith: event.target.value || null })}
            />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2 xl:col-span-4">
            Recorded for the internal worksheet. Not shown to the customer.
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
