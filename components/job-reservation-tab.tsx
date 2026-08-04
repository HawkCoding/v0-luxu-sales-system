"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AlertCircle, Plus, RotateCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ReservationFormCard } from "@/components/reservation-form-card"
import { useJobReservationDetails, useJobTravellers, type JobTraveller } from "@/lib/use-data"
import type { Customer, PipelineStage } from "@/lib/types"

interface JobReservationTabProps {
  bookingId: string
  reservationFormReceivedAt: string | null
  mutateJob: () => void | Promise<unknown>
  additionalServicesDetails?: string
  customer: Customer | null
  stage: PipelineStage
}

interface TravellerDraft {
  key: string
  id?: string
  prefix: string
  firstName: string
  lastName: string
  idPassport: string
  dateOfBirth: string
  residence: string
  roomWith: string
  roomType: string
  isChild: boolean
  isPrimary: boolean
}

let draftKeySeq = 0
function newDraftKey(): string {
  draftKeySeq += 1
  return `new-${draftKeySeq}`
}

function toDraft(t: JobTraveller): TravellerDraft {
  return {
    key: t.id,
    id: t.id,
    prefix: t.prefix,
    firstName: t.firstName,
    lastName: t.lastName,
    idPassport: t.idPassport,
    dateOfBirth: t.dateOfBirth,
    residence: t.residence,
    roomWith: t.roomWith,
    roomType: t.roomType,
    isChild: t.isChild,
    isPrimary: t.isPrimary,
  }
}

function emptyDraft(isChild: boolean): TravellerDraft {
  return {
    key: newDraftKey(),
    prefix: "",
    firstName: "",
    lastName: "",
    idPassport: "",
    dateOfBirth: "",
    residence: "",
    roomWith: "",
    roomType: "",
    isChild,
    isPrimary: false,
  }
}

function travellerFromCustomer(customer: Customer): TravellerDraft {
  return {
    key: newDraftKey(),
    prefix: customer.title ?? "",
    firstName: customer.firstName,
    lastName: customer.lastName,
    idPassport: customer.idPassport ?? "",
    dateOfBirth: customer.dateOfBirth ?? "",
    residence: customer.country ?? "",
    roomWith: "",
    roomType: "",
    isChild: false,
    isPrimary: true,
  }
}

function travellerRowDiffers(a: TravellerDraft, b: TravellerDraft): boolean {
  return (
    a.prefix !== b.prefix ||
    a.firstName !== b.firstName ||
    a.lastName !== b.lastName ||
    a.idPassport !== b.idPassport ||
    a.dateOfBirth !== b.dateOfBirth ||
    a.residence !== b.residence ||
    a.roomWith !== b.roomWith ||
    a.roomType !== b.roomType ||
    a.isChild !== b.isChild
  )
}

function describeTraveller(t: TravellerDraft): string {
  const name = [t.prefix, t.firstName, t.lastName].filter(Boolean).join(" ")
  const extra = [t.residence, t.dateOfBirth, t.idPassport].filter(Boolean).join(" · ")
  return extra ? `${name} (${extra})` : name
}

function formatCustomerAddress(customer: Customer | null): string {
  if (!customer) return ""
  return [customer.addressLine1, customer.addressLine2, customer.city, customer.province, customer.postalCode]
    .filter(Boolean)
    .join(", ")
}

const SMOKING_NONE = "none"
const MEAL_SEATING_NONE = "none"

export function JobReservationTab({
  bookingId,
  reservationFormReceivedAt,
  mutateJob,
  additionalServicesDetails,
  customer,
  stage,
}: JobReservationTabProps) {
  const {
    data: travellersData,
    isLoading: travellersLoading,
    error: travellersError,
    mutate: mutateTravellers,
  } = useJobTravellers(bookingId)
  const {
    data: detailsData,
    isLoading: detailsLoading,
    error: detailsError,
    mutate: mutateDetails,
  } = useJobReservationDetails(bookingId)

  const [travellers, setTravellers] = useState<TravellerDraft[]>([])
  const [travellerSeeds, setTravellerSeeds] = useState<Map<string, TravellerDraft>>(new Map())
  const [savingTravellers, setSavingTravellers] = useState(false)
  const travellersHydrated = useRef(false)
  const guestsCardRef = useRef<HTMLDivElement | null>(null)
  const [showReceivedPrompt, setShowReceivedPrompt] = useState(false)

  const goToGuestDetails = () => {
    setShowReceivedPrompt(false)
    if (travellers.length === 0 && customer) {
      setTravellers([travellerFromCustomer(customer)])
    }
    guestsCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  // Seed is captured once per tab session (not on every SWR revalidation) so an
  // "Enquiry: ..." comparison survives after the salesperson saves an edit.
  useEffect(() => {
    if (!travellersData || travellersHydrated.current) return
    travellersHydrated.current = true
    const drafts = travellersData.travellers.map(toDraft)
    setTravellers(drafts)
    setTravellerSeeds(new Map(drafts.map((d) => [d.key, d])))
  }, [travellersData])

  const agencySeed = useMemo(
    () => ({ name: customer?.companyName ?? "", address: formatCustomerAddress(customer) }),
    [customer],
  )

  const [dietary, setDietary] = useState("")
  const [medical, setMedical] = useState("")
  const [occasion, setOccasion] = useState("")
  const [smokingPreference, setSmokingPreference] = useState<string>(SMOKING_NONE)
  const [mealSeating, setMealSeating] = useState<string>(MEAL_SEATING_NONE)
  const [agencyName, setAgencyName] = useState("")
  const [agencyAddress, setAgencyAddress] = useState("")
  const [savingDetails, setSavingDetails] = useState(false)
  const detailsHydrated = useRef(false)

  useEffect(() => {
    if (!detailsData || detailsHydrated.current) return
    detailsHydrated.current = true
    setDietary(detailsData.dietary)
    setMedical(detailsData.medical)
    setOccasion(detailsData.occasion)
    setSmokingPreference(detailsData.smokingPreference ?? SMOKING_NONE)
    setMealSeating(detailsData.mealSeating ?? MEAL_SEATING_NONE)
    setAgencyName(detailsData.agencyName || agencySeed.name)
    setAgencyAddress(detailsData.agencyAddress || agencySeed.address)
  }, [detailsData, agencySeed])

  const updateTraveller = (key: string, patch: Partial<TravellerDraft>) => {
    setTravellers((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  const removeTraveller = (key: string) => {
    setTravellers((rows) => rows.filter((row) => row.key !== key))
  }

  const revertTraveller = (key: string) => {
    const seed = travellerSeeds.get(key)
    if (!seed) return
    setTravellers((rows) => rows.map((row) => (row.key === key ? { ...seed } : row)))
  }

  const setPrimaryTraveller = (key: string) => {
    setTravellers((rows) => rows.map((row) => ({ ...row, isPrimary: row.key === key })))
  }

  const addOrSyncCustomerAsGuest = () => {
    if (!customer) return
    setTravellers((rows) => {
      const existingPrimary = rows.find((row) => row.isPrimary)
      const seeded = travellerFromCustomer(customer)
      if (existingPrimary) {
        return rows.map((row) =>
          row.key === existingPrimary.key
            ? { ...seeded, key: row.key, id: row.id, residence: row.residence || seeded.residence }
            : row,
        )
      }
      return [seeded, ...rows]
    })
  }

  const saveTravellers = async () => {
    const invalid = travellers.some((t) => !t.firstName.trim() || !t.lastName.trim() || !t.idPassport.trim())
    if (invalid) {
      toast.error("Each guest needs a first name, surname, and ID/passport number")
      return
    }
    setSavingTravellers(true)
    try {
      const response = await fetch(`/api/jobs/${bookingId}/travellers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          travellers: travellers.map((t) => ({
            id: t.id,
            prefix: t.prefix || null,
            firstName: t.firstName,
            lastName: t.lastName,
            idPassport: t.idPassport || null,
            dateOfBirth: t.dateOfBirth || null,
            residence: t.residence || null,
            roomWith: t.roomWith || null,
            roomType: t.roomType || null,
            isChild: t.isChild,
            isPrimary: t.isPrimary,
          })),
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(typeof payload?.error === "string" ? payload.error : "Could not save guests")
      }
      await mutateTravellers()
      await mutateJob()
      toast.success("Guests saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save guests")
    } finally {
      setSavingTravellers(false)
    }
  }

  const saveDetails = async () => {
    setSavingDetails(true)
    try {
      const response = await fetch(`/api/jobs/${bookingId}/reservation-details`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dietary: dietary || null,
          medical: medical || null,
          occasion: occasion || null,
          smokingPreference: smokingPreference === SMOKING_NONE ? null : smokingPreference,
          mealSeating: mealSeating === MEAL_SEATING_NONE ? null : mealSeating,
          agencyName: agencyName || null,
          agencyAddress: agencyAddress || null,
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(typeof payload?.error === "string" ? payload.error : "Could not save reservation details")
      }
      await mutateDetails()
      toast.success("Reservation details saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save reservation details")
    } finally {
      setSavingDetails(false)
    }
  }

  if (travellersError || detailsError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="w-4 h-4" />
        <AlertTitle>Could not load reservation details</AlertTitle>
        <AlertDescription>
          {(travellersError ?? detailsError) instanceof Error
            ? ((travellersError ?? detailsError) as Error).message
            : "Something went wrong."}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-4">
      <ReservationFormCard
        jobId={bookingId}
        reservationFormReceivedAt={reservationFormReceivedAt}
        mutate={mutateJob}
        onMarkedReceived={() => setShowReceivedPrompt(true)}
        stage={stage}
      />

      {/* Optional prompt, not a destructive confirmation: use Dialog rather than
          AlertDialog so Escape, the close button and an outside click all dismiss
          it. AlertDialog blocks outside interaction by design, which left users
          stranded when the dialog mounted into a locked layer. */}
      <Dialog open={showReceivedPrompt} onOpenChange={setShowReceivedPrompt}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reservation form received</DialogTitle>
            <DialogDescription>
              Fill in the guest and reservation details returned on the form now?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Later</Button>
            </DialogClose>
            <Button onClick={goToGuestDetails}>Fill in now</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!reservationFormReceivedAt ? (
        <p className="text-xs text-muted-foreground">
          Mark the reservation form received above once it comes back, then record the returned
          details below. Fields are pre-filled from the original enquiry — edit them to reflect
          what the client returned.
        </p>
      ) : null}

      <Card ref={guestsCardRef}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Guests</CardTitle>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTravellers((rows) => [...rows, emptyDraft(false)])}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add guest
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTravellers((rows) => [...rows, emptyDraft(true)])}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add child
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addOrSyncCustomerAsGuest}
              disabled={!customer}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add customer as guest
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {travellersLoading ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : travellers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No guests yet</p>
          ) : (
            travellers.map((traveller) => {
              const seed = travellerSeeds.get(traveller.key)
              const differs = seed ? travellerRowDiffers(traveller, seed) : false
              return (
                <div key={traveller.key} className="rounded-md border p-3 space-y-2">
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                    <Input
                      placeholder="Title"
                      value={traveller.prefix}
                      onChange={(e) => updateTraveller(traveller.key, { prefix: e.target.value })}
                    />
                    <Input
                      placeholder="First name *"
                      value={traveller.firstName}
                      onChange={(e) => updateTraveller(traveller.key, { firstName: e.target.value })}
                      className="sm:col-span-2"
                      required
                    />
                    <Input
                      placeholder="Surname *"
                      value={traveller.lastName}
                      onChange={(e) => updateTraveller(traveller.key, { lastName: e.target.value })}
                      className="sm:col-span-2"
                      required
                    />
                    <div className="flex items-center gap-1.5">
                      <Checkbox
                        id={`child-${traveller.key}`}
                        checked={traveller.isChild}
                        onCheckedChange={(checked) => updateTraveller(traveller.key, { isChild: checked === true })}
                      />
                      <Label htmlFor={`child-${traveller.key}`} className="text-xs">Child</Label>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Checkbox
                        id={`primary-${traveller.key}`}
                        checked={traveller.isPrimary}
                        onCheckedChange={(checked) =>
                          checked === true ? setPrimaryTraveller(traveller.key) : updateTraveller(traveller.key, { isPrimary: false })
                        }
                      />
                      <Label htmlFor={`primary-${traveller.key}`} className="text-xs">Primary guest</Label>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Input
                          placeholder="Residence"
                          value={traveller.residence}
                          onChange={(e) => updateTraveller(traveller.key, { residence: e.target.value })}
                          className="sm:col-span-2"
                        />
                      </TooltipTrigger>
                      <TooltipContent>Country of residence</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Input
                          placeholder="Date of birth"
                          value={traveller.dateOfBirth}
                          onChange={(e) => updateTraveller(traveller.key, { dateOfBirth: e.target.value })}
                          className="sm:col-span-2"
                        />
                      </TooltipTrigger>
                      <TooltipContent>Format: YYYY-MM-DD (e.g. 1990-02-14)</TooltipContent>
                    </Tooltip>
                    <Input
                      placeholder="ID / Passport number *"
                      value={traveller.idPassport}
                      onChange={(e) => updateTraveller(traveller.key, { idPassport: e.target.value })}
                      className="sm:col-span-2"
                      required
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Input
                          placeholder="Room with"
                          value={traveller.roomWith}
                          onChange={(e) => updateTraveller(traveller.key, { roomWith: e.target.value })}
                          className="sm:col-span-2"
                        />
                      </TooltipTrigger>
                      <TooltipContent>Shown on the Worksheet PDF</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Input
                          placeholder="Room type"
                          value={traveller.roomType}
                          onChange={(e) => updateTraveller(traveller.key, { roomType: e.target.value })}
                          className="sm:col-span-2"
                        />
                      </TooltipTrigger>
                      <TooltipContent>Shown on the Worksheet PDF</TooltipContent>
                    </Tooltip>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTraveller(traveller.key)}
                      aria-label="Remove guest"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {differs && seed ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Enquiry: {describeTraveller(seed) || "—"}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2"
                        onClick={() => revertTraveller(traveller.key)}
                      >
                        <RotateCcw className="w-3 h-3 mr-1" /> Revert to enquiry
                      </Button>
                    </div>
                  ) : null}
                </div>
              )
            })
          )}
          <div className="flex justify-end">
            <Button size="sm" onClick={saveTravellers} disabled={savingTravellers}>
              {savingTravellers ? "Saving..." : "Save guests"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Special requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {additionalServicesDetails ? (
            <p className="text-xs text-muted-foreground rounded-md border bg-muted/40 p-2">
              From enquiry: {additionalServicesDetails}
            </p>
          ) : null}
          {detailsLoading ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Dietary</Label>
                  <Input value={dietary} onChange={(e) => setDietary(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Medical</Label>
                  <Input value={medical} onChange={(e) => setMedical(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Occasion</Label>
                  <Input value={occasion} onChange={(e) => setOccasion(e.target.value)} className="mt-1" />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Smoking</Label>
                  <Select value={smokingPreference} onValueChange={setSmokingPreference}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SMOKING_NONE}>Not specified</SelectItem>
                      <SelectItem value="smoking">Smoking</SelectItem>
                      <SelectItem value="non_smoking">Non-smoking</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Meal seating</Label>
                  <Select value={mealSeating} onValueChange={setMealSeating}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={MEAL_SEATING_NONE}>Not specified</SelectItem>
                      <SelectItem value="first">1st seating</SelectItem>
                      <SelectItem value="second">2nd seating</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}
          <div className="flex justify-end">
            <Button size="sm" onClick={saveDetails} disabled={savingDetails}>
              {savingDetails ? "Saving..." : "Save special requests"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Agency details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Agency name</Label>
            <Input value={agencyName} onChange={(e) => setAgencyName(e.target.value)} className="mt-1" />
            {agencySeed.name && agencyName !== agencySeed.name ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <span>Enquiry: {agencySeed.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => setAgencyName(agencySeed.name)}
                >
                  <RotateCcw className="w-3 h-3 mr-1" /> Revert
                </Button>
              </div>
            ) : null}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Agency address</Label>
            <Textarea value={agencyAddress} onChange={(e) => setAgencyAddress(e.target.value)} className="mt-1" rows={2} />
            {agencySeed.address && agencyAddress !== agencySeed.address ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <span>Enquiry: {agencySeed.address}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => setAgencyAddress(agencySeed.address)}
                >
                  <RotateCcw className="w-3 h-3 mr-1" /> Revert
                </Button>
              </div>
            ) : null}
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={saveDetails} disabled={savingDetails}>
              {savingDetails ? "Saving..." : "Save agency details"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
