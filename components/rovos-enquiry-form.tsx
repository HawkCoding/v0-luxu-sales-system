"use client"

import { useForm, useFieldArray, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import {
  DIRECTIONS, DEPARTURE_DATES, SUITE_TYPES, TITLES,
  TRAVELLER_PREFIXES, CHILD_PREFIXES, COUNTRIES,
  HOTEL_OPTIONS, getHotelRegionForDirection,
} from "@/lib/form-data"
import { Loader2, ChevronRight, ChevronLeft } from "lucide-react"

const travellerSchema = z.object({
  prefix: z.string().min(1, "Required"),
  name: z.string().min(1, "Required"),
  surname: z.string().min(1, "Required"),
  idPassport: z.string().min(1, "Required"),
  dateOfBirth: z.string().min(1, "Required"),
})

const schema = z.object({
  purpose: z.enum(["quote", "availability", "reservation"]),
  title: z.string().min(1, "Required"),
  name: z.string().min(1, "Required"),
  surname: z.string().min(1, "Required"),
  contactNumber: z.string().min(1, "Required"),
  email: z.string().email("Invalid email"),
  confirmEmail: z.string().email("Invalid email"),
  country: z.string().min(1, "Required"),
  direction: z.string().min(1, "Required"),
  departureDate: z.string().min(1, "Required"),
  noOfSuites: z.number().min(1).max(10),
  noOfAdults: z.number().min(1).max(20),
  noOfChildren: z.number().min(0).max(5),
  childAges: z.array(z.number().min(3).max(9)).optional(),
  suiteTypes: z.array(z.string().min(1)).min(1, "At least 1 suite type required"),
  travellers: z.array(travellerSchema).optional(),
  childTravellers: z.array(travellerSchema).optional(),
  hotelBooking: z.string().optional(),
  hotelOption: z.string().optional(),
  extendStay: z.string().optional(),
  extraNights: z.number().min(1).max(4).optional(),
  additionalServices: z.string().optional(),
  additionalServicesDetails: z.string().optional(),
  promotionCode: z.string().optional(),
  termsAccepted: z.literal(true, { errorMap: () => ({ message: "You must accept the terms" }) }),
}).refine(d => d.email === d.confirmEmail, {
  message: "Emails must match",
  path: ["confirmEmail"],
})

type FormValues = z.infer<typeof schema>

export function RovosEnquiryForm({ onSuccess }: { onSuccess: (data: { jobNumber: string }) => void }) {
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(0) // 0 = form, 1 = review (reservation only)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      purpose: "quote",
      title: "",
      name: "",
      surname: "",
      contactNumber: "",
      email: "",
      confirmEmail: "",
      country: "",
      direction: "",
      departureDate: "",
      noOfSuites: 1,
      noOfAdults: 2,
      noOfChildren: 0,
      childAges: [],
      suiteTypes: [""],
      travellers: [],
      childTravellers: [],
      hotelBooking: "",
      hotelOption: "",
      extendStay: "No",
      extraNights: 1,
      additionalServices: "No",
      additionalServicesDetails: "",
      promotionCode: "",
      termsAccepted: false as unknown as true,
    },
  })

  const { watch, register, control, formState: { errors }, setValue, trigger, handleSubmit } = form
  const purpose = watch("purpose")
  const direction = watch("direction")
  const noOfSuites = watch("noOfSuites")
  const noOfAdults = watch("noOfAdults")
  const noOfChildren = watch("noOfChildren")
  const extendStay = watch("extendStay")
  const additionalServices = watch("additionalServices")
  const isReservation = purpose === "reservation"

  const dates = direction ? (DEPARTURE_DATES[direction] || []) : []
  const hotelRegion = direction ? getHotelRegionForDirection(direction) : ""
  const hotels = hotelRegion ? (HOTEL_OPTIONS[hotelRegion] || []) : []

  const { fields: travellerFields, replace: replaceTravellers } = useFieldArray({ control, name: "travellers" })
  const { fields: childFields, replace: replaceChildren } = useFieldArray({ control, name: "childTravellers" })

  const syncTravellers = () => {
    const current = form.getValues("travellers") || []
    const target = noOfAdults
    if (current.length < target) {
      replaceTravellers([...current, ...Array(target - current.length).fill({ prefix: "", name: "", surname: "", idPassport: "", dateOfBirth: "" })])
    } else if (current.length > target) {
      replaceTravellers(current.slice(0, target))
    }
  }

  const syncChildren = () => {
    const current = form.getValues("childTravellers") || []
    const target = noOfChildren
    if (current.length < target) {
      replaceChildren([...current, ...Array(target - current.length).fill({ prefix: "", name: "", surname: "", idPassport: "", dateOfBirth: "" })])
    } else if (current.length > target) {
      replaceChildren(current.slice(0, target))
    }
  }

  const handleReview = async () => {
    const valid = await trigger()
    if (valid && isReservation) {
      setStep(1)
    } else if (valid) {
      doSubmit(form.getValues())
    }
  }

  const doSubmit = async (data: FormValues) => {
    setLoading(true)
    try {
      const res = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const result = await res.json()
      onSuccess({ jobNumber: result.jobNumber })
    } catch {
      setLoading(false)
    }
  }

  const allValues = watch()

  if (step === 1) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">Review Your Submission</h2>
          <Button variant="outline" size="sm" onClick={() => setStep(0)}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Edit
          </Button>
        </div>
        <div className="bg-card border border-border rounded-lg divide-y divide-border">
          <ReviewSection title="Purpose" items={[["Type", allValues.purpose]]} />
          <ReviewSection title="Contact" items={[
            ["Name", `${allValues.title} ${allValues.name} ${allValues.surname}`],
            ["Email", allValues.email],
            ["Phone", allValues.contactNumber],
            ["Country", allValues.country],
          ]} />
          <ReviewSection title="Departure" items={[
            ["Direction", allValues.direction],
            ["Date", allValues.departureDate],
            ["Suites", String(allValues.noOfSuites)],
            ["Adults", String(allValues.noOfAdults)],
            ["Children", String(allValues.noOfChildren)],
            ...allValues.suiteTypes.map((s, i) => [`Suite ${i + 1}`, s] as [string, string]),
          ]} />
          {allValues.travellers && allValues.travellers.length > 0 && (
            <ReviewSection title="Travellers" items={allValues.travellers.map((t, i) => [`Guest ${i + 1}`, `${t.prefix} ${t.name} ${t.surname}`])} />
          )}
          {allValues.hotelBooking && (
            <ReviewSection title="Hotel" items={[
              ["Booking", allValues.hotelBooking],
              ["Hotel", allValues.hotelOption || "-"],
              ["Extra Nights", allValues.extendStay === "Yes" ? String(allValues.extraNights) : "None"],
            ]} />
          )}
        </div>
        <Button className="w-full bg-brand-gold text-card hover:bg-brand-gold-light" disabled={loading} onClick={handleSubmit(doSubmit)}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Submit Enquiry
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleReview() }} className="space-y-8">
      {/* Purpose */}
      <FormSection title="Purpose">
        <FieldWrap label="Enquiry Type" error={errors.purpose?.message}>
          <Controller control={control} name="purpose" render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger><SelectValue placeholder="Select purpose" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="quote">Quote</SelectItem>
                <SelectItem value="availability">Availability</SelectItem>
                <SelectItem value="reservation">Reservation</SelectItem>
              </SelectContent>
            </Select>
          )} />
        </FieldWrap>
      </FormSection>

      {/* Contact */}
      <FormSection title="Personal Contact Information">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FieldWrap label="Title" error={errors.title?.message}>
            <Controller control={control} name="title" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue placeholder="Title" /></SelectTrigger>
                <SelectContent>{TITLES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            )} />
          </FieldWrap>
          <FieldWrap label="Name" error={errors.name?.message}>
            <Input {...register("name")} placeholder="First name" />
          </FieldWrap>
          <FieldWrap label="Surname" error={errors.surname?.message}>
            <Input {...register("surname")} placeholder="Surname" />
          </FieldWrap>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldWrap label="Contact Number" error={errors.contactNumber?.message}>
            <Input {...register("contactNumber")} placeholder="+27..." />
          </FieldWrap>
          <FieldWrap label="Country" error={errors.country?.message}>
            <Controller control={control} name="country" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue placeholder="Country" /></SelectTrigger>
                <SelectContent>{COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            )} />
          </FieldWrap>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldWrap label="Email" error={errors.email?.message}>
            <Input type="email" {...register("email")} placeholder="email@example.com" />
          </FieldWrap>
          <FieldWrap label="Confirm Email" error={errors.confirmEmail?.message}>
            <Input type="email" {...register("confirmEmail")} placeholder="Confirm email" />
          </FieldWrap>
        </div>
      </FormSection>

      {/* Departure */}
      <FormSection title="Rovos Rail Departure Information">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldWrap label="Direction" error={errors.direction?.message}>
            <Controller control={control} name="direction" render={({ field }) => (
              <Select value={field.value} onValueChange={(v) => { field.onChange(v); setValue("departureDate", "") }}>
                <SelectTrigger><SelectValue placeholder="Select direction" /></SelectTrigger>
                <SelectContent>{DIRECTIONS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            )} />
          </FieldWrap>
          <FieldWrap label="Date" error={errors.departureDate?.message}>
            <Controller control={control} name="departureDate" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={!direction}>
                <SelectTrigger><SelectValue placeholder={direction ? "Select date" : "Select direction first"} /></SelectTrigger>
                <SelectContent>{dates.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            )} />
          </FieldWrap>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FieldWrap label="No. of Suites" error={errors.noOfSuites?.message}>
            <Controller control={control} name="noOfSuites" render={({ field }) => (
              <Select value={String(field.value)} onValueChange={(v) => {
                const num = Number(v)
                field.onChange(num)
                const curr = form.getValues("suiteTypes")
                if (curr.length < num) setValue("suiteTypes", [...curr, ...Array(num - curr.length).fill("")])
                else setValue("suiteTypes", curr.slice(0, num))
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Array.from({ length: 10 }, (_, i) => <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}</SelectItem>)}</SelectContent>
              </Select>
            )} />
          </FieldWrap>
          <FieldWrap label="No. of Adults" error={errors.noOfAdults?.message}>
            <Controller control={control} name="noOfAdults" render={({ field }) => (
              <Select value={String(field.value)} onValueChange={(v) => { field.onChange(Number(v)); if (isReservation) setTimeout(syncTravellers, 0) }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Array.from({ length: 20 }, (_, i) => <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}</SelectItem>)}</SelectContent>
              </Select>
            )} />
          </FieldWrap>
          <FieldWrap label="No. of Children" error={errors.noOfChildren?.message}>
            <Controller control={control} name="noOfChildren" render={({ field }) => (
              <Select value={String(field.value)} onValueChange={(v) => {
                const num = Number(v)
                field.onChange(num)
                const curr = form.getValues("childAges") || []
                if (curr.length < num) setValue("childAges", [...curr, ...Array(num - curr.length).fill(3)])
                else setValue("childAges", curr.slice(0, num))
                if (isReservation) setTimeout(syncChildren, 0)
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Array.from({ length: 6 }, (_, i) => <SelectItem key={i} value={String(i)}>{i}</SelectItem>)}</SelectContent>
              </Select>
            )} />
          </FieldWrap>
        </div>

        {noOfChildren > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Array.from({ length: noOfChildren }).map((_, i) => (
              <FieldWrap key={i} label={`Child ${i + 1} Age`}>
                <Controller control={control} name={`childAges.${i}`} render={({ field }) => (
                  <Select value={String(field.value || 3)} onValueChange={(v) => field.onChange(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Array.from({ length: 7 }, (_, j) => <SelectItem key={j + 3} value={String(j + 3)}>{j + 3} years</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </FieldWrap>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <Label className="text-sm font-medium text-foreground">Suite Types</Label>
          {Array.from({ length: noOfSuites }).map((_, i) => (
            <FieldWrap key={i} label={`Suite ${i + 1}`} error={errors.suiteTypes?.[i]?.message}>
              <Controller control={control} name={`suiteTypes.${i}`} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder="Select suite type" /></SelectTrigger>
                  <SelectContent>{SUITE_TYPES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </FieldWrap>
          ))}
        </div>
      </FormSection>

      {/* Travellers (Reservation only) */}
      {isReservation && (
        <FormSection title="Travellers Information">
          <p className="text-sm text-muted-foreground mb-2">Please provide details for all guests.</p>
          {travellerFields.map((field, i) => (
            <div key={field.id} className="border border-border rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">Guest {i + 1}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <FieldWrap label="Prefix">
                  <Controller control={control} name={`travellers.${i}.prefix`} render={({ field: f }) => (
                    <Select value={f.value} onValueChange={f.onChange}>
                      <SelectTrigger><SelectValue placeholder="Prefix" /></SelectTrigger>
                      <SelectContent>{TRAVELLER_PREFIXES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                  )} />
                </FieldWrap>
                <FieldWrap label="Name">
                  <Input {...register(`travellers.${i}.name`)} placeholder="Name" />
                </FieldWrap>
                <FieldWrap label="Surname">
                  <Input {...register(`travellers.${i}.surname`)} placeholder="Surname" />
                </FieldWrap>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FieldWrap label="ID/Passport">
                  <Input {...register(`travellers.${i}.idPassport`)} placeholder="ID or Passport Number" />
                </FieldWrap>
                <FieldWrap label="Date of Birth">
                  <Input {...register(`travellers.${i}.dateOfBirth`)} placeholder="dd/mm/yyyy" />
                </FieldWrap>
              </div>
            </div>
          ))}
          {noOfAdults > travellerFields.length && (
            <Button type="button" variant="outline" size="sm" onClick={syncTravellers}>
              Add remaining travellers
            </Button>
          )}

          {childFields.length > 0 && (
            <>
              <Separator />
              <p className="text-sm font-medium text-foreground">Children</p>
            </>
          )}
          {childFields.map((field, i) => (
            <div key={field.id} className="border border-border rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">Child {i + 1}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <FieldWrap label="Prefix">
                  <Controller control={control} name={`childTravellers.${i}.prefix`} render={({ field: f }) => (
                    <Select value={f.value} onValueChange={f.onChange}>
                      <SelectTrigger><SelectValue placeholder="Prefix" /></SelectTrigger>
                      <SelectContent>{CHILD_PREFIXES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                  )} />
                </FieldWrap>
                <FieldWrap label="Name">
                  <Input {...register(`childTravellers.${i}.name`)} placeholder="Name" />
                </FieldWrap>
                <FieldWrap label="Surname">
                  <Input {...register(`childTravellers.${i}.surname`)} placeholder="Surname" />
                </FieldWrap>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FieldWrap label="ID/Passport">
                  <Input {...register(`childTravellers.${i}.idPassport`)} placeholder="ID or Passport Number" />
                </FieldWrap>
                <FieldWrap label="Date of Birth">
                  <Input {...register(`childTravellers.${i}.dateOfBirth`)} placeholder="dd/mm/yyyy" />
                </FieldWrap>
              </div>
            </div>
          ))}
        </FormSection>
      )}

      {/* Hotel (Reservation only) */}
      {isReservation && (
        <FormSection title="Complimentary Night Hotel Information">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldWrap label="Hotel Booking">
              <Controller control={control} name="hotelBooking" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pre-departure">Pre-departure</SelectItem>
                    <SelectItem value="Post-departure">Post-departure</SelectItem>
                  </SelectContent>
                </Select>
              )} />
            </FieldWrap>
            <FieldWrap label="Hotel">
              <Controller control={control} name="hotelOption" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={hotels.length === 0}>
                  <SelectTrigger><SelectValue placeholder={hotels.length ? "Select hotel" : "Select direction first"} /></SelectTrigger>
                  <SelectContent>{hotels.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </FieldWrap>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldWrap label="Extend your stay?">
              <Controller control={control} name="extendStay" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="No">No</SelectItem>
                    <SelectItem value="Yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
              )} />
            </FieldWrap>
            {extendStay === "Yes" && (
              <FieldWrap label="Extra Nights">
                <Controller control={control} name="extraNights" render={({ field }) => (
                  <Select value={String(field.value || 1)} onValueChange={(v) => field.onChange(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{[1, 2, 3, 4].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </FieldWrap>
            )}
          </div>
        </FormSection>
      )}

      {/* Additional Services (Reservation only) */}
      {isReservation && (
        <FormSection title="Additional Travel Services">
          <FieldWrap label="Do you require additional travel services?">
            <Controller control={control} name="additionalServices" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="No">No</SelectItem>
                  <SelectItem value="Yes">Yes</SelectItem>
                </SelectContent>
              </Select>
            )} />
          </FieldWrap>
          {additionalServices === "Yes" && (
            <FieldWrap label="Briefly explain the travel services you require">
              <Textarea {...register("additionalServicesDetails")} rows={3} placeholder="Describe your requirements..." />
            </FieldWrap>
          )}
          <FieldWrap label="Promotion Code (optional)">
            <Input {...register("promotionCode")} placeholder="Enter code" />
          </FieldWrap>
        </FormSection>
      )}

      {/* Consent */}
      <FormSection title="Consent">
        <div className="flex items-start gap-3">
          <Controller control={control} name="termsAccepted" render={({ field }) => (
            <Checkbox
              checked={field.value}
              onCheckedChange={field.onChange}
              id="terms"
              className="mt-0.5"
            />
          )} />
          <div>
            <Label htmlFor="terms" className="text-sm text-foreground cursor-pointer">
              I have read and accept the Terms and Conditions
            </Label>
            {errors.termsAccepted && (
              <p className="text-xs text-destructive mt-1">{errors.termsAccepted.message}</p>
            )}
          </div>
        </div>
      </FormSection>

      <Button type="submit" className="w-full bg-brand-gold text-card hover:bg-brand-gold-light" disabled={loading}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        {isReservation ? (
          <>Review & Submit <ChevronRight className="w-4 h-4 ml-1" /></>
        ) : "Submit Enquiry"}
      </Button>
    </form>
  )
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <Separator className="mt-2" />
      </div>
      {children}
    </section>
  )
}

function FieldWrap({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function ReviewSection({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <div className="p-4 space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {items.map(([k, v], i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{k}</span>
            <span className="text-foreground font-medium">{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
