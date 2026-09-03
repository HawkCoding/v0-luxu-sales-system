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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { AlertCircle, Copy, Plus, RotateCcw, Trash2, UserCheck } from "lucide-react"
import { toast } from "sonner"
import { ReservationFormCard } from "@/components/reservation-form-card"
import { normalizeDateOfBirth } from "@/lib/date-format"
import {
  fillBlanksFromCustomer,
  PREFILL_FIELDS,
  type PrefillField,
} from "@/lib/traveller-prefill"
import { useJobReservationDetails, useJobTravellers, type JobTraveller } from "@/lib/use-data"
import type { Customer, PipelineStage } from "@/lib/types"
import { useSaveOnExit } from "@/hooks/use-save-on-exit"
import { useUnloadGuard } from "@/hooks/use-unload-guard"

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

function travellersValid(rows: TravellerDraft[]): boolean {
  return rows.every((t) => t.firstName.trim() && t.lastName.trim() && t.idPassport.trim())
}

/** Snapshot used to detect edits against the last-hydrated/last-saved baseline. */
function travellersSnapshot(rows: TravellerDraft[]): string {
  return JSON.stringify(
    rows.map((t) => ({
      id: t.id ?? null,
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
    })),
  )
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

const SMOKING_NONE = "none"
const MEAL_SEATING_NONE = "none"

interface DetailsFields {
  dietary: string
  medical: string
  occasion: string
  smokingPreference: string
  mealSeating: string
  voucherSpecialRequests: string
  agencyName: string
  agencyAddress: string
  billingCompanyName: string
  billingVatNumber: string
  billingAddressLine1: string
  billingAddressLine2: string
  billingCity: string
  billingProvince: string
  billingPostalCode: string
  billingCountry: string
}

/** Shared by the save request body and the dirty-snapshot comparison, so the two can't drift. */
function toDetailsPayload(f: DetailsFields) {
  return {
    dietary: f.dietary || null,
    medical: f.medical || null,
    occasion: f.occasion || null,
    smokingPreference: f.smokingPreference === SMOKING_NONE ? null : f.smokingPreference,
    mealSeating: f.mealSeating === MEAL_SEATING_NONE ? null : f.mealSeating,
    voucherSpecialRequests: f.voucherSpecialRequests || null,
    agencyName: f.agencyName || null,
    agencyAddress: f.agencyAddress || null,
    billingCompanyName: f.billingCompanyName || null,
    billingVatNumber: f.billingVatNumber || null,
    billingAddressLine1: f.billingAddressLine1 || null,
    billingAddressLine2: f.billingAddressLine2 || null,
    billingCity: f.billingCity || null,
    billingProvince: f.billingProvince || null,
    billingPostalCode: f.billingPostalCode || null,
    billingCountry: f.billingCountry || null,
  }
}

function plural(count: number, noun: string, pluralNoun: string): string {
  return `${count} ${count === 1 ? noun : pluralNoun}`
}

/** Text-only status next to a card title — never color alone, per the UI conventions. */
function SaveStatus({ saving, dirty }: { saving: boolean; dirty: boolean }) {
  if (saving) return <span className="text-xs text-muted-foreground">Saving…</span>
  if (dirty) return <span className="text-xs text-muted-foreground">Unsaved changes</span>
  return null
}

/** "2 adults, 1 child, 1 infant" — zero buckets are dropped so the sentence stays readable. */
function describePax(totals: { adultCount: number; childCount: number; infantCount: number } | null): string {
  if (!totals) return "none"
  const parts: string[] = []
  if (totals.adultCount > 0) parts.push(plural(totals.adultCount, "adult", "adults"))
  if (totals.childCount > 0) parts.push(plural(totals.childCount, "child", "children"))
  if (totals.infantCount > 0) parts.push(plural(totals.infantCount, "infant", "infants"))
  return parts.length > 0 ? parts.join(", ") : "nobody"
}

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
  const [prefilledFields, setPrefilledFields] = useState<Map<string, Set<PrefillField>>>(new Map())
  const [savingTravellers, setSavingTravellers] = useState(false)
  const [syncingPax, setSyncingPax] = useState(false)
  const [confirmWipeOpen, setConfirmWipeOpen] = useState(false)
  const travellersHydrated = useRef(false)
  const guestsCardRef = useRef<HTMLDivElement | null>(null)
  // Snapshot of the last-hydrated-or-saved roster, for the click-out autosave's dirty check. Null
  // until hydration runs once, so autosave can't fire against an empty baseline.
  const travellersBaselineRef = useRef<string | null>(null)

  /**
   * Runs once the reservation form is marked received. This used to raise a
   * "fill in the details now?" dialog whose only real answer was yes — and
   * which covered the very card it offered to scroll to. Scrolling and saying
   * so gets to the same place without the click.
   */
  const goToGuestDetails = () => {
    guestsCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    toast.success("Reservation form marked received", {
      description: "Record the returned guest and reservation details below.",
    })
  }

  // Seed is captured once per tab session (not on every SWR revalidation) so an
  // "Enquiry: ..." comparison survives after the salesperson saves an edit. The
  // seed is the stored row, so "revert to enquiry" undoes a prefill too.
  useEffect(() => {
    if (!travellersData || travellersHydrated.current) return
    travellersHydrated.current = true
    const drafts = travellersData.travellers.map(toDraft)
    setTravellerSeeds(new Map(drafts.map((d) => [d.key, d])))
    if (!customer) {
      setTravellers(drafts)
      travellersBaselineRef.current = travellersSnapshot(drafts)
      return
    }
    // Baseline is the post-prefill rows, not the raw saved rows: a prefill is "check, then save"
    // (see saveTravellers), so a freshly-opened tab must not read as dirty and autosave it unseen.
    const { rows, prefilled } = fillBlanksFromCustomer(drafts, customer, travellerFromCustomer)
    setTravellers(rows)
    setPrefilledFields(prefilled)
    travellersBaselineRef.current = travellersSnapshot(rows)
  }, [travellersData, customer])

  // Only the name seeds from the customer profile — the address does not, since an
  // agency's own address has no relation to the customer's (billing address is the
  // section for the customer's address).
  const agencySeed = useMemo(() => ({ name: customer?.companyName ?? "" }), [customer])

  // Structured fields for the "Copy from customer profile" buttons below — the invoice
  // reads only the billing_* columns (no fallback), so this is a one-shot fill, not a default.
  const billingSeed = useMemo(
    () => ({
      companyName: customer?.companyName ?? "",
      vatNumber: customer?.vatNumber ?? "",
      addressLine1: customer?.addressLine1 ?? "",
      addressLine2: customer?.addressLine2 ?? "",
      city: customer?.city ?? "",
      province: customer?.province ?? "",
      postalCode: customer?.postalCode ?? "",
      country: customer?.country ?? "",
    }),
    [customer],
  )

  const savedTravellerCount = travellersData?.travellers.length ?? 0
  // Reflects the *saved* roster, not the drafts on screen — the pax it is compared against only
  // moves when the guest list is saved, so anything else would flip on every keystroke.
  const paxComparison = travellersData?.paxComparison ?? null
  const paxMismatch = paxComparison && !paxComparison.matches ? paxComparison : null

  const [dietary, setDietary] = useState("")
  const [medical, setMedical] = useState("")
  const [occasion, setOccasion] = useState("")
  const [smokingPreference, setSmokingPreference] = useState<string>(SMOKING_NONE)
  const [mealSeating, setMealSeating] = useState<string>(MEAL_SEATING_NONE)
  const [voucherSpecialRequests, setVoucherSpecialRequests] = useState("")
  const [agencyName, setAgencyName] = useState("")
  const [agencyAddress, setAgencyAddress] = useState("")
  const [billingCompanyName, setBillingCompanyName] = useState("")
  const [billingVatNumber, setBillingVatNumber] = useState("")
  const [billingAddressLine1, setBillingAddressLine1] = useState("")
  const [billingAddressLine2, setBillingAddressLine2] = useState("")
  const [billingCity, setBillingCity] = useState("")
  const [billingProvince, setBillingProvince] = useState("")
  const [billingPostalCode, setBillingPostalCode] = useState("")
  const [billingCountry, setBillingCountry] = useState("")
  const [savingDetails, setSavingDetails] = useState(false)
  const detailsHydrated = useRef(false)
  // Same idea as travellersBaselineRef, but for the shared reservation-details payload used by
  // the Company details / Special requests / Agency details cards (and the billing sub-panel).
  const detailsBaselineRef = useRef<string | null>(null)
  const detailsInFlightRef = useRef<Promise<void> | null>(null)
  const companyCardRef = useRef<HTMLDivElement | null>(null)
  const specialRequestsCardRef = useRef<HTMLDivElement | null>(null)
  const agencyCardRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!detailsData || detailsHydrated.current) return
    detailsHydrated.current = true
    const agencyNameValue = detailsData.agencyName || agencySeed.name
    setDietary(detailsData.dietary)
    setMedical(detailsData.medical)
    setOccasion(detailsData.occasion)
    setSmokingPreference(detailsData.smokingPreference ?? SMOKING_NONE)
    setMealSeating(detailsData.mealSeating ?? MEAL_SEATING_NONE)
    setVoucherSpecialRequests(detailsData.voucherSpecialRequests)
    setAgencyName(agencyNameValue)
    setAgencyAddress(detailsData.agencyAddress)
    setBillingCompanyName(detailsData.billingCompanyName)
    setBillingVatNumber(detailsData.billingVatNumber)
    setBillingAddressLine1(detailsData.billingAddressLine1)
    setBillingAddressLine2(detailsData.billingAddressLine2)
    setBillingCity(detailsData.billingCity)
    setBillingProvince(detailsData.billingProvince)
    setBillingPostalCode(detailsData.billingPostalCode)
    setBillingCountry(detailsData.billingCountry)
    detailsBaselineRef.current = JSON.stringify(
      toDetailsPayload({
        dietary: detailsData.dietary,
        medical: detailsData.medical,
        occasion: detailsData.occasion,
        smokingPreference: detailsData.smokingPreference ?? SMOKING_NONE,
        mealSeating: detailsData.mealSeating ?? MEAL_SEATING_NONE,
        voucherSpecialRequests: detailsData.voucherSpecialRequests,
        agencyName: agencyNameValue,
        agencyAddress: detailsData.agencyAddress,
        billingCompanyName: detailsData.billingCompanyName,
        billingVatNumber: detailsData.billingVatNumber,
        billingAddressLine1: detailsData.billingAddressLine1,
        billingAddressLine2: detailsData.billingAddressLine2,
        billingCity: detailsData.billingCity,
        billingProvince: detailsData.billingProvince,
        billingPostalCode: detailsData.billingPostalCode,
        billingCountry: detailsData.billingCountry,
      }),
    )
  }, [detailsData, agencySeed])

  // One-shot fill from the customer profile — never overwrites without the salesperson asking,
  // since the invoice no longer falls back to the customer profile on its own.
  const copyCompanyFromCustomer = () => {
    if (!customer) return
    setBillingCompanyName(billingSeed.companyName)
    setBillingVatNumber(billingSeed.vatNumber)
  }

  const copyBillingAddressFromCustomer = () => {
    if (!customer) return
    setBillingAddressLine1(billingSeed.addressLine1)
    setBillingAddressLine2(billingSeed.addressLine2)
    setBillingCity(billingSeed.city)
    setBillingProvince(billingSeed.province)
    setBillingPostalCode(billingSeed.postalCode)
    setBillingCountry(billingSeed.country)
  }

  // Once the salesperson edits a field themselves it is no longer "from the
  // customer profile", so drop the hint for it.
  const clearPrefillMarks = (key: string, fields: string[]) => {
    setPrefilledFields((current) => {
      const marked = current.get(key)
      if (!marked) return current
      const remaining = new Set(marked)
      for (const field of fields) remaining.delete(field as PrefillField)
      if (remaining.size === marked.size) return current
      const next = new Map(current)
      if (remaining.size === 0) next.delete(key)
      else next.set(key, remaining)
      return next
    })
  }

  const updateTraveller = (key: string, patch: Partial<TravellerDraft>) => {
    setTravellers((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))
    clearPrefillMarks(key, Object.keys(patch))
  }

  const removeTraveller = (key: string) => {
    setTravellers((rows) => rows.filter((row) => row.key !== key))
    clearPrefillMarks(key, [...PREFILL_FIELDS])
  }

  const revertTraveller = (key: string) => {
    const seed = travellerSeeds.get(key)
    if (!seed) return
    setTravellers((rows) => rows.map((row) => (row.key === key ? { ...seed } : row)))
    clearPrefillMarks(key, [...PREFILL_FIELDS])
  }

  const setPrimaryTraveller = (key: string) => {
    setTravellers((rows) => rows.map((row) => ({ ...row, isPrimary: row.key === key })))
  }

  /**
   * Manual re-run of the prefill. Fills blanks only — it never overwrites guest
   * details already on the row, so a mis-click can't wipe typed-in data.
   */
  const fillFromCustomer = () => {
    if (!customer) return
    const { rows, prefilled, changed } = fillBlanksFromCustomer(travellers, customer, travellerFromCustomer)
    if (!changed) {
      toast.info("Nothing to fill — the customer's guest details are already complete")
      return
    }
    setTravellers(rows)
    setPrefilledFields((current) => {
      const next = new Map(current)
      for (const [key, fields] of prefilled) {
        next.set(key, new Set([...(next.get(key) ?? []), ...fields]))
      }
      return next
    })
  }

  /**
   * Writes the saved roster into the booking's passenger counts. Explicit on purpose: pricing must
   * never move because somebody typed a date of birth (see the sync-pax route).
   */
  const applyRosterToPax = async () => {
    setSyncingPax(true)
    try {
      const response = await fetch(`/api/jobs/${bookingId}/travellers/sync-pax`, { method: "POST" })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Could not apply the guest list")
      }
      await mutateTravellers()
      await mutateJob()
      toast.success("Passenger counts updated from the guest list")
      if (typeof payload?.warning === "string") toast.warning(payload.warning)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not apply the guest list")
    } finally {
      setSyncingPax(false)
    }
  }

  const requestSaveTravellers = () => {
    // An empty payload is a replace-set wipe: ID numbers and dates of birth do not come back.
    if (travellers.length === 0 && savedTravellerCount > 0) {
      setConfirmWipeOpen(true)
      return
    }
    void saveTravellers()
  }

  const saveTravellers = async (opts?: { silent?: boolean }) => {
    if (!travellersValid(travellers)) {
      if (!opts?.silent) toast.error("Each guest needs a first name, surname, and ID/passport number")
      return
    }
    const snapshot = travellersSnapshot(travellers)
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
      const payload = (await response.json().catch(() => null)) as { warning?: string | null } | null
      travellersBaselineRef.current = snapshot
      await mutateTravellers()
      await mutateJob()
      // Prefilled values are now stored guest details, so drop the "check, then
      // save" hint.
      setPrefilledFields(new Map())
      if (!opts?.silent) toast.success("Guests saved")
      if (typeof payload?.warning === "string") toast.warning(payload.warning)
      // The billing address sub-panel lives inside this card visually but is
      // stored on booking_reservation_details, so it saves alongside the roster.
      // Skipped until that row has hydrated — otherwise its still-blank drafts
      // would overwrite whatever was already saved.
      if (detailsHydrated.current) await saveDetails({ silent: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save guests")
    } finally {
      setSavingTravellers(false)
    }
  }

  const saveDetails = async (opts?: { silent?: boolean }) => {
    const fields: DetailsFields = {
      dietary,
      medical,
      occasion,
      smokingPreference,
      mealSeating,
      voucherSpecialRequests,
      agencyName,
      agencyAddress,
      billingCompanyName,
      billingVatNumber,
      billingAddressLine1,
      billingAddressLine2,
      billingCity,
      billingProvince,
      billingPostalCode,
      billingCountry,
    }
    const snapshot = JSON.stringify(toDetailsPayload(fields))
    // Two cards can each ask for a flush within the same tick (e.g. clicking from the guests
    // card's billing panel straight into another card); share the in-flight request instead of
    // firing a second overlapping PUT.
    if (detailsInFlightRef.current) await detailsInFlightRef.current
    const run = (async () => {
      setSavingDetails(true)
      try {
        const response = await fetch(`/api/jobs/${bookingId}/reservation-details`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toDetailsPayload(fields)),
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          throw new Error(typeof payload?.error === "string" ? payload.error : "Could not save reservation details")
        }
        detailsBaselineRef.current = snapshot
        await mutateDetails()
        if (!opts?.silent) toast.success("Reservation details saved")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save reservation details")
      } finally {
        setSavingDetails(false)
      }
    })()
    detailsInFlightRef.current = run
    try {
      await run
    } finally {
      if (detailsInFlightRef.current === run) detailsInFlightRef.current = null
    }
  }

  // Reads the refs live (`.current`, not a captured value) so a check run after an earlier `await`
  // in the same tick sees whatever the last save already settled — that's what lets the guests
  // card's exit handler chain travellers-then-details without firing details twice.
  const computeDetailsSnapshot = () =>
    JSON.stringify(
      toDetailsPayload({
        dietary,
        medical,
        occasion,
        smokingPreference,
        mealSeating,
        voucherSpecialRequests,
        agencyName,
        agencyAddress,
        billingCompanyName,
        billingVatNumber,
        billingAddressLine1,
        billingAddressLine2,
        billingCity,
        billingProvince,
        billingPostalCode,
        billingCountry,
      }),
    )
  const computeTravellersDirty = () =>
    travellersBaselineRef.current !== null && travellersSnapshot(travellers) !== travellersBaselineRef.current
  const computeDetailsDirty = () =>
    detailsBaselineRef.current !== null && computeDetailsSnapshot() !== detailsBaselineRef.current

  const travellersDirty = computeTravellersDirty()
  const detailsDirty = computeDetailsDirty()

  // Click-out autosave for the guests roster: skips silently on an invalid row (the button still
  // surfaces that error) and never fires the empty-roster wipe (that stays behind the confirm
  // dialog only). Returns a promise so the guests card's exit handler can wait for it before
  // deciding whether details still need a separate save.
  const flushTravellers = (): Promise<void> => {
    if (savingTravellers || !computeTravellersDirty()) return Promise.resolve()
    if (travellers.length === 0 && savedTravellerCount > 0) return Promise.resolve()
    if (!travellersValid(travellers)) return Promise.resolve()
    return saveTravellers({ silent: true })
  }

  // Click-out autosave shared by Company details / Special requests / Agency details, and the
  // billing sub-panel inside the Guests card.
  const flushDetails = () => {
    if (savingDetails || !computeDetailsDirty()) return
    void saveDetails({ silent: true })
  }

  useSaveOnExit(
    guestsCardRef,
    () => {
      // saveTravellers already chains a silent saveDetails when it succeeds (the billing panel
      // lives in this card but is stored on reservation_details) — wait for that before checking
      // whether details are still dirty, so a plain click-out never fires two overlapping PUTs.
      void flushTravellers().then(flushDetails)
    },
    travellersDirty || detailsDirty,
  )
  useSaveOnExit(companyCardRef, flushDetails, detailsDirty)
  useSaveOnExit(specialRequestsCardRef, flushDetails, detailsDirty)
  useSaveOnExit(agencyCardRef, flushDetails, detailsDirty)
  useUnloadGuard(travellersDirty || detailsDirty)

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
        onMarkedReceived={goToGuestDetails}
        stage={stage}
      />

      {/* Genuinely destructive and unrecoverable, so this one is an AlertDialog: it must not be
          dismissable by an outside click. */}
      <AlertDialog open={confirmWipeOpen} onOpenChange={setConfirmWipeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {plural(savedTravellerCount, "guest", "guests")}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Saving an empty guest list deletes every saved guest on this booking. Their names, ID
              or passport numbers and dates of birth cannot be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep guests</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmWipeOpen(false)
                void saveTravellers()
              }}
            >
              Remove all guests
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!reservationFormReceivedAt ? (
        <p className="text-xs text-muted-foreground">
          Mark the reservation form received above once it comes back, then record the returned
          details below. Fields are pre-filled from the original enquiry — edit them to reflect
          what the client returned.
        </p>
      ) : null}

      <Card ref={guestsCardRef}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">Guests</CardTitle>
            <SaveStatus saving={savingTravellers || savingDetails} dirty={travellersDirty || detailsDirty} />
          </div>
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
              onClick={fillFromCustomer}
              disabled={!customer}
            >
              <UserCheck className="w-3.5 h-3.5 mr-1" /> Fill from customer profile
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {paxMismatch ? (
            <Alert>
              <AlertCircle className="w-4 h-4" />
              <AlertTitle>Guest list does not match the passenger counts</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>
                  Saved guests: {describePax(paxMismatch.roster)}. This booking is priced for{" "}
                  {describePax(paxMismatch.booking)}. Quotes, invoices and vouchers all use the
                  priced counts, not the guest list.
                  {paxMismatch.roster && paxMismatch.roster.undatedCount > 0
                    ? ` ${paxMismatch.roster.undatedCount} guest${
                        paxMismatch.roster.undatedCount === 1 ? " has" : "s have"
                      } no date of birth and ${
                        paxMismatch.roster.undatedCount === 1 ? "was" : "were"
                      } counted by the "child" tick instead.`
                    : ""}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={applyRosterToPax}
                  disabled={syncingPax || savedTravellerCount === 0}
                >
                  {syncingPax ? "Applying..." : "Apply guest list to passenger counts"}
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
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
              const unreadableDob =
                traveller.dateOfBirth.trim().length > 0 && normalizeDateOfBirth(traveller.dateOfBirth) === null
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
                          placeholder="Date of birth"
                          value={traveller.dateOfBirth}
                          onChange={(e) => updateTraveller(traveller.key, { dateOfBirth: e.target.value })}
                          onBlur={(e) => {
                            const normalized = normalizeDateOfBirth(e.target.value)
                            if (normalized && normalized !== e.target.value) {
                              updateTraveller(traveller.key, { dateOfBirth: normalized })
                            }
                          }}
                          aria-invalid={unreadableDob}
                          aria-describedby={unreadableDob ? `dob-hint-${traveller.key}` : undefined}
                          className="sm:col-span-2"
                        />
                      </TooltipTrigger>
                      <TooltipContent>Day first — 12/05/1980 or 1980-05-12</TooltipContent>
                    </Tooltip>
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
                  {unreadableDob ? (
                    <p id={`dob-hint-${traveller.key}`} className="text-xs text-amber-600 dark:text-amber-500">
                      Date of birth isn&apos;t in a format we can read — use 12/05/1980 or 1980-05-12. It will be
                      saved as typed, but won&apos;t be remembered on the customer profile.
                    </p>
                  ) : null}
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
                  {traveller.isPrimary ? (
                    <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">Billing address</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={copyBillingAddressFromCustomer}
                          disabled={!customer}
                        >
                          <Copy className="w-3 h-3 mr-1" /> Copy from customer profile
                        </Button>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2">
                        <Input
                          placeholder="Address line 1"
                          value={billingAddressLine1}
                          onChange={(e) => setBillingAddressLine1(e.target.value)}
                        />
                        <Input
                          placeholder="Address line 2"
                          value={billingAddressLine2}
                          onChange={(e) => setBillingAddressLine2(e.target.value)}
                        />
                        <Input
                          placeholder="City"
                          value={billingCity}
                          onChange={(e) => setBillingCity(e.target.value)}
                        />
                        <Input
                          placeholder="Province"
                          value={billingProvince}
                          onChange={(e) => setBillingProvince(e.target.value)}
                        />
                        <Input
                          placeholder="Code"
                          value={billingPostalCode}
                          onChange={(e) => setBillingPostalCode(e.target.value)}
                        />
                        <Input
                          placeholder="Country"
                          value={billingCountry}
                          onChange={(e) => setBillingCountry(e.target.value)}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })
          )}
          <div className="flex justify-end">
            <Button size="sm" onClick={requestSaveTravellers} disabled={savingTravellers}>
              {savingTravellers ? "Saving..." : "Save guests"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card ref={companyCardRef}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">Company details</CardTitle>
            <SaveStatus saving={savingDetails} dirty={detailsDirty} />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyCompanyFromCustomer}
            disabled={!customer}
          >
            <Copy className="w-3.5 h-3.5 mr-1" /> Copy from customer profile
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {detailsLoading ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Company name</Label>
                <Input
                  value={billingCompanyName}
                  onChange={(e) => setBillingCompanyName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">VAT number</Label>
                <Input
                  value={billingVatNumber}
                  onChange={(e) => setBillingVatNumber(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Printed on the invoice as Company / VAT. Left blank prints a dash — it no longer falls
            back to the customer profile.
          </p>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => saveDetails()} disabled={savingDetails}>
              {savingDetails ? "Saving..." : "Save company details"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card ref={specialRequestsCardRef}>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0">
          <CardTitle className="text-sm">Special requests</CardTitle>
          <SaveStatus saving={savingDetails} dirty={detailsDirty} />
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
              <div>
                <Label className="text-xs text-muted-foreground">Voucher special requests</Label>
                <Textarea
                  value={voucherSpecialRequests}
                  onChange={(e) => setVoucherSpecialRequests(e.target.value)}
                  className="mt-1"
                  rows={3}
                  placeholder="Anniversary celebration, wheelchair access at boarding, etc."
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Prints as SPECIAL REQUESTS on the voucher. Nothing else does.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Dietary and occasion print on hotel service blocks; smoking and meal seating print on train
                service blocks. Medical is kept here for internal use only and does not print on any document.
              </p>
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
            <Button size="sm" onClick={() => saveDetails()} disabled={savingDetails}>
              {savingDetails ? "Saving..." : "Save special requests"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card ref={agencyCardRef}>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0">
          <CardTitle className="text-sm">Agency details</CardTitle>
          <SaveStatus saving={savingDetails} dirty={detailsDirty} />
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
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => saveDetails()} disabled={savingDetails}>
              {savingDetails ? "Saving..." : "Save agency details"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
