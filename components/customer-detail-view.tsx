"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { useSWRConfig } from "swr"
import { AlertCircle, ArrowLeft, CalendarDays, Globe, Link2, Mail, Pencil, Phone, Plus, Save, Star, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { LinkedAccountForm, type LinkedAccountFormValue } from "@/components/linked-account-form"
import { NewEnquiryDialog } from "@/components/new-enquiry-dialog"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CustomerActivitySummary } from "@/components/customer-activity-summary"
import { PresenceAvatars } from "@/components/presence-avatars"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useRole } from "@/lib/role-context"
import { getPipelineStageLabel, PIPELINE_STAGES } from "@/lib/types"
import { useCustomerDetail, useRateTypes } from "@/lib/use-data"
import { COUNTRIES } from "@/lib/form-data"
import { PHONE_VALIDATION_MESSAGE, isPlausiblePhone } from "@/lib/phone-format"
import { formatDisplayDate } from "@/lib/date-format"
import { useRecordPresence } from "@/hooks/use-record-presence"
import { useVersionedSave, type VersionedSaveError } from "@/hooks/use-versioned-save"

type Presentation = "page" | "modal"

interface CustomerPatchPayload {
  notes: string
  email: string
  phone: string | null
  fax: string | null
  country: string | null
  province: string | null
  company_name: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  postal_code: string | null
  vat_number: string | null
  date_of_birth: string | null
  id_passport: string | null
  vip_status: boolean
  preferences: string | null
  communication_preferences: string | null
  default_rate_type_id: string | null
}

interface CustomerPatchResponse {
  notes: string | null
  email: string
  phone: string | null
  country: string | null
  province: string | null
  dateOfBirth: string | null
  vipStatus: boolean
  preferences: string | null
  communicationPreferences: string | null
  defaultRateTypeId: string | null
  updatedAt: string
}

interface CustomerDetailViewProps {
  customerId: string
  presentation?: Presentation
}

const LINKED_ACCOUNTS_ACCORDION_VALUE = "linked-accounts"

export function CustomerDetailView({
  customerId,
  presentation = "page",
}: CustomerDetailViewProps) {
  const { data, isLoading, error, mutate } = useCustomerDetail(customerId)
  const { mutate: mutateGlobal } = useSWRConfig()
  const { can } = useRole()
  const router = useRouter()
  const { others, setEditing: setPresenceEditing } = useRecordPresence("customer", customerId)
  const canEditCustomers = can("edit:customers")
  const canCreateBooking = can("create:enquiry")
  const { data: rateTypesData } = useRateTypes()
  const rateTypes = (rateTypesData?.rateTypes ?? []).filter((rt) => !rt.archivedAt)
  const [newBookingOpen, setNewBookingOpen] = useState(false)
  const [emailDraft, setEmailDraft] = useState("")
  const [phoneDraft, setPhoneDraft] = useState("")
  const [faxDraft, setFaxDraft] = useState("")
  const [notesDraft, setNotesDraft] = useState("")
  const [countryDraft, setCountryDraft] = useState("")
  const [provinceDraft, setProvinceDraft] = useState("")
  const [companyNameDraft, setCompanyNameDraft] = useState("")
  const [addressLine1Draft, setAddressLine1Draft] = useState("")
  const [addressLine2Draft, setAddressLine2Draft] = useState("")
  const [cityDraft, setCityDraft] = useState("")
  const [postalCodeDraft, setPostalCodeDraft] = useState("")
  const [vatNumberDraft, setVatNumberDraft] = useState("")
  const [dateOfBirthDraft, setDateOfBirthDraft] = useState("")
  const [idPassportDraft, setIdPassportDraft] = useState("")
  const [vipStatusDraft, setVipStatusDraft] = useState(false)
  const [preferencesDraft, setPreferencesDraft] = useState("")
  const [communicationPreferencesDraft, setCommunicationPreferencesDraft] = useState("")
  const [defaultRateTypeIdDraft, setDefaultRateTypeIdDraft] = useState("")
  const [isEditing, setIsEditing] = useState(false)
  const [editingStartedUpdatedAt, setEditingStartedUpdatedAt] = useState<string | undefined>(undefined)
  const [hasExternalUpdate, setHasExternalUpdate] = useState(false)
  const [lastCustomerPayload, setLastCustomerPayload] = useState<CustomerPatchPayload | null>(null)
  const [isAddingLinkedAccount, setIsAddingLinkedAccount] = useState(false)
  const [editingLinkedAccountId, setEditingLinkedAccountId] = useState<string | null>(null)
  const [isSavingLinkedAccount, setIsSavingLinkedAccount] = useState(false)
  const [deletingLinkedAccountId, setDeletingLinkedAccountId] = useState<string | null>(null)
  const [linkedAccountsAccordionValue, setLinkedAccountsAccordionValue] = useState<string | undefined>(
    undefined,
  )
  const [addLinkedAccountPrefill, setAddLinkedAccountPrefill] = useState<LinkedAccountFormValue | null>(null)
  const hasLoadError = Boolean(error)
  const lastSeenCustomerUpdatedAtRef = useRef<string | undefined>(undefined)
  // Values loaded into the form at the moment editing started, so the server
  // can tell "someone else changed a field I'm also changing" from "someone
  // else saved this record for an unrelated reason while I was editing".
  const editingBaselineRef = useRef<Record<string, unknown> | null>(null)
  const customerUpdatedAt = data && "customer" in data ? data.customer.updatedAt : undefined
  const {
    save: saveCustomer,
    isSaving,
    conflict: customerConflict,
    clearConflict: clearCustomerConflict,
  } = useVersionedSave<CustomerPatchPayload, CustomerPatchResponse>({
    url: `/api/customers/${customerId}`,
    method: "PATCH",
    entity: "customer",
    recordId: customerId,
    expectedUpdatedAt: isEditing ? editingStartedUpdatedAt : customerUpdatedAt,
    baseline: isEditing ? (editingBaselineRef.current ?? undefined) : undefined,
  })

  useEffect(() => {
    if (data && "customer" in data) {
      const previousUpdatedAt = lastSeenCustomerUpdatedAtRef.current
      const nextUpdatedAt = data.customer.updatedAt

      if (isEditing && previousUpdatedAt && nextUpdatedAt && previousUpdatedAt !== nextUpdatedAt) {
        setHasExternalUpdate(true)
        lastSeenCustomerUpdatedAtRef.current = nextUpdatedAt
        return
      }

      if (!isEditing) {
        setEmailDraft(data.customer.email)
        setPhoneDraft(data.customer.phone ?? "")
        setFaxDraft(data.customer.fax ?? "")
        setNotesDraft(data.customer.notes ?? "")
        setCountryDraft(data.customer.country ?? "")
        setProvinceDraft(data.customer.province ?? "")
        setCompanyNameDraft(data.customer.companyName ?? "")
        setAddressLine1Draft(data.customer.addressLine1 ?? "")
        setAddressLine2Draft(data.customer.addressLine2 ?? "")
        setCityDraft(data.customer.city ?? "")
        setPostalCodeDraft(data.customer.postalCode ?? "")
        setVatNumberDraft(data.customer.vatNumber ?? "")
        setDateOfBirthDraft(data.customer.dateOfBirth ?? "")
        setIdPassportDraft(data.customer.idPassport ?? "")
        setVipStatusDraft(data.customer.vipStatus ?? false)
        setPreferencesDraft(data.customer.preferences ?? "")
        setCommunicationPreferencesDraft(data.customer.communicationPreferences ?? "")
        setDefaultRateTypeIdDraft(data.customer.defaultRateTypeId ?? "")
        setEditingStartedUpdatedAt(undefined)
      }

      lastSeenCustomerUpdatedAtRef.current = nextUpdatedAt
    }
  }, [data, isEditing])

  useEffect(() => {
    setPresenceEditing(isEditing || isAddingLinkedAccount || editingLinkedAccountId !== null)
  }, [editingLinkedAccountId, isAddingLinkedAccount, isEditing, setPresenceEditing])

  const contentClassName =
    presentation === "modal"
      ? "p-6 space-y-6"
      : "p-6 space-y-6 max-w-5xl"

  const stageLabels = useMemo(() => {
    return PIPELINE_STAGES.reduce<Record<string, string>>((acc, stage) => {
      acc[stage.key] = stage.label
      return acc
    }, {})
  }, [])

  if (hasLoadError || (data && "error" in data)) {
    return (
      <div className={contentClassName}>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Could not load customer</AlertTitle>
          <AlertDescription>
            Refresh the page or return to the customer list.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (isLoading || !data) {
    return (
      <div className={contentClassName}>
        <div className="space-y-3">
          <Skeleton className="h-10 w-80" />
          <Skeleton className="h-5 w-56" />
        </div>
        <Card>
          <CardContent className="p-6 space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  const { customer, bookings, linkedAccounts } = data
  const fullName = `${customer.firstName} ${customer.lastName}`.trim()
  const initials = `${customer.firstName?.[0] ?? ""}${customer.lastName?.[0] ?? ""}`.toUpperCase()
  const linkedAccountsCount = linkedAccounts.length
  const completedBookings = bookings.filter(
    (booking) => booking.stage === "voucher_sent" || booking.stage === "trip_active" || booking.stage === "closed",
  ).length
  const isRepeatClient = (customer.isRepeatClient ?? false) || completedBookings > 0
  const phoneDraftError =
    phoneDraft.trim().length > 0 && !isPlausiblePhone(phoneDraft) ? PHONE_VALIDATION_MESSAGE : null
  const hasChanges =
    emailDraft !== customer.email ||
    phoneDraft !== (customer.phone ?? "") ||
    faxDraft !== (customer.fax ?? "") ||
    notesDraft !== (customer.notes ?? "") ||
    countryDraft !== (customer.country ?? "") ||
    provinceDraft !== (customer.province ?? "") ||
    companyNameDraft !== (customer.companyName ?? "") ||
    addressLine1Draft !== (customer.addressLine1 ?? "") ||
    addressLine2Draft !== (customer.addressLine2 ?? "") ||
    cityDraft !== (customer.city ?? "") ||
    postalCodeDraft !== (customer.postalCode ?? "") ||
    vatNumberDraft !== (customer.vatNumber ?? "") ||
    dateOfBirthDraft !== (customer.dateOfBirth ?? "") ||
    idPassportDraft !== (customer.idPassport ?? "") ||
    vipStatusDraft !== (customer.vipStatus ?? false) ||
    preferencesDraft !== (customer.preferences ?? "") ||
    communicationPreferencesDraft !== (customer.communicationPreferences ?? "") ||
    defaultRateTypeIdDraft !== (customer.defaultRateTypeId ?? "")

  function getCustomerPatchPayload(): CustomerPatchPayload {
    return {
      notes: notesDraft,
      email: emailDraft,
      phone: phoneDraft || null,
      fax: faxDraft || null,
      country: countryDraft || null,
      province: provinceDraft || null,
      company_name: companyNameDraft || null,
      address_line1: addressLine1Draft || null,
      address_line2: addressLine2Draft || null,
      city: cityDraft || null,
      postal_code: postalCodeDraft || null,
      vat_number: vatNumberDraft || null,
      date_of_birth: dateOfBirthDraft || null,
      id_passport: idPassportDraft.trim() || null,
      vip_status: vipStatusDraft,
      preferences: preferencesDraft || null,
      communication_preferences: communicationPreferencesDraft || null,
      default_rate_type_id: defaultRateTypeIdDraft || null,
    }
  }

  async function persistCustomer(
    payload: CustomerPatchPayload,
    options?: { ignoreExpectedUpdatedAt?: boolean },
  ): Promise<boolean> {
    setLastCustomerPayload(payload)

    try {
      const updated = await saveCustomer(payload, options)
      // Update local state before awaiting mutate() so the "customer changed
      // elsewhere" effect doesn't mistake our own just-saved updatedAt for an
      // external change while the SWR revalidation is in flight.
      setIsEditing(false)
      setEditingStartedUpdatedAt(updated.updatedAt)
      lastSeenCustomerUpdatedAtRef.current = updated.updatedAt
      setHasExternalUpdate(false)
      clearCustomerConflict()
      await mutate()
      await mutateGlobal((key) => typeof key === "string" && key.startsWith("/api/data"))
      toast.success("Customer saved")
      return true
    } catch (error) {
      // A typed conflict (stale version, field conflict, duplicate email) is
      // already rendered as its own banner below — no need to also toast it.
      if ((error as VersionedSaveError | undefined)?.conflict) {
        return false
      }
      const message = error instanceof Error ? error.message : "Could not save customer"
      toast.error(message)
      return false
    }
  }

  async function saveNotes() {
    if (!canEditCustomers || !isEditing || !hasChanges || isSaving) {
      return
    }

    if (phoneDraftError) {
      toast.error(phoneDraftError)
      return
    }

    await persistCustomer(getCustomerPatchPayload())
  }

  async function createLinkedAccount(payload: LinkedAccountFormValue) {
    setIsSavingLinkedAccount(true)
    try {
      const response = await fetch(`/api/customers/${customerId}/linked-accounts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null
        throw new Error(errorPayload?.error ?? "Failed to create linked account")
      }

      await mutate()
      await mutateGlobal((key) => typeof key === "string" && key.startsWith("/api/data"))
      setIsAddingLinkedAccount(false)
      setAddLinkedAccountPrefill(null)
      toast.success("Linked account saved")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save linked account"
      toast.error(message)
    } finally {
      setIsSavingLinkedAccount(false)
    }
  }

  async function updateLinkedAccount(linkedAccountId: string, payload: LinkedAccountFormValue) {
    setIsSavingLinkedAccount(true)
    try {
      const response = await fetch(`/api/customers/${customerId}/linked-accounts/${linkedAccountId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null
        throw new Error(errorPayload?.error ?? "Failed to update linked account")
      }

      await mutate()
      await mutateGlobal((key) => typeof key === "string" && key.startsWith("/api/data"))
      setEditingLinkedAccountId(null)
      toast.success("Linked account updated")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update linked account"
      toast.error(message)
    } finally {
      setIsSavingLinkedAccount(false)
    }
  }

  async function deleteLinkedAccount(linkedAccountId: string) {
    setDeletingLinkedAccountId(linkedAccountId)
    try {
      const response = await fetch(`/api/customers/${customerId}/linked-accounts/${linkedAccountId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null
        throw new Error(errorPayload?.error ?? "Failed to delete linked account")
      }

      await mutate()
      await mutateGlobal((key) => typeof key === "string" && key.startsWith("/api/data"))
      toast.success("Linked account removed")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete linked account"
      toast.error(message)
    } finally {
      setDeletingLinkedAccountId(null)
    }
  }

  return (
    <div className={contentClassName}>
      {presentation === "page" && (
        <Link
          href="/app/customers"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to customers
        </Link>
      )}

      <div className="space-y-1">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-semibold text-foreground" style={{ fontFamily: "var(--font-inter)" }}>
                {initials || "C"}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold text-foreground tracking-tight">{fullName}</h1>
                <PresenceAvatars users={others} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-1">
                {customer.title && <Badge variant="outline">{customer.title}</Badge>}
                {customer.vipStatus ? (
                  <Badge variant="secondary" className="gap-1">
                    <Star className="w-3 h-3" />
                    VIP
                  </Badge>
                ) : null}
                {isRepeatClient ? <Badge variant="outline">Repeat Client</Badge> : null}
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" />
                  Customer since {formatDisplayDate(customer.createdAt)}
                </span>
              </div>
            </div>
          </div>

          {(canEditCustomers || canCreateBooking) && (
            <div
              className={`flex items-center gap-2${
                presentation === "modal" ? " mr-10 sm:mr-12" : ""
              }`}
            >
              {!isEditing ? (
                <>
                  {canCreateBooking && (
                    <Button
                      onClick={() => setNewBookingOpen(true)}
                      data-testid="customer-new-booking-button"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      New booking
                    </Button>
                  )}
                  {canEditCustomers && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setEditingStartedUpdatedAt(customer.updatedAt)
                        editingBaselineRef.current = getCustomerPatchPayload() as unknown as Record<string, unknown>
                        setHasExternalUpdate(false)
                        clearCustomerConflict()
                        setIsEditing(true)
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button
                    onClick={() => {
                      setEmailDraft(customer.email)
                      setPhoneDraft(customer.phone ?? "")
                      setFaxDraft(customer.fax ?? "")
                      setNotesDraft(customer.notes ?? "")
                      setCountryDraft(customer.country ?? "")
                      setProvinceDraft(customer.province ?? "")
                      setCompanyNameDraft(customer.companyName ?? "")
                      setAddressLine1Draft(customer.addressLine1 ?? "")
                      setAddressLine2Draft(customer.addressLine2 ?? "")
                      setCityDraft(customer.city ?? "")
                      setPostalCodeDraft(customer.postalCode ?? "")
                      setVatNumberDraft(customer.vatNumber ?? "")
                      setDateOfBirthDraft(customer.dateOfBirth ?? "")
                      setIdPassportDraft(customer.idPassport ?? "")
                      setVipStatusDraft(customer.vipStatus ?? false)
                      setPreferencesDraft(customer.preferences ?? "")
                      setCommunicationPreferencesDraft(customer.communicationPreferences ?? "")
                      setDefaultRateTypeIdDraft(customer.defaultRateTypeId ?? "")
                      setIsEditing(false)
                      editingBaselineRef.current = null
                      setHasExternalUpdate(false)
                      clearCustomerConflict()
                    }}
                    variant="outline"
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button onClick={saveNotes} disabled={!hasChanges || isSaving || Boolean(phoneDraftError)}>
                    <Save className="mr-2 h-4 w-4" />
                    {isSaving ? "Saving..." : "Save changes"}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {customerConflict?.code === "DUPLICATE_EMAIL" ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Email already in use</AlertTitle>
          <AlertDescription>
            <p>
              That email already belongs to{" "}
              <Link href={`/app/customers/${customerConflict.existingCustomer.id}`} className="underline">
                {customerConflict.existingCustomer.firstName} {customerConflict.existingCustomer.lastName}
              </Link>
              .
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" asChild>
                <Link href={`/app/customers/${customerConflict.existingCustomer.id}`}>Open that customer</Link>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const existingCustomer = customerConflict.existingCustomer
                  setAddLinkedAccountPrefill({
                    relationship: null,
                    firstName: existingCustomer.firstName,
                    lastName: existingCustomer.lastName,
                    email: emailDraft || null,
                    phone: null,
                    linkedCustomerId: existingCustomer.id,
                  })
                  setEditingLinkedAccountId(null)
                  setIsAddingLinkedAccount(true)
                  setLinkedAccountsAccordionValue(LINKED_ACCOUNTS_ACCORDION_VALUE)
                  clearCustomerConflict()
                }}
              >
                Add as linked account
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : (customerConflict || hasExternalUpdate) ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>This customer changed elsewhere</AlertTitle>
          <AlertDescription>
            <p>
              {customerConflict?.error ??
                "Another user just updated this customer. Refresh to load their changes or save anyway to attempt your current edits."}
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  clearCustomerConflict()
                  setHasExternalUpdate(false)
                  setIsEditing(false)
                  void mutate()
                }}
              >
                Refresh
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  void persistCustomer(lastCustomerPayload ?? getCustomerPatchPayload(), {
                    ignoreExpectedUpdatedAt: true,
                  })
                }}
                disabled={isSaving}
              >
                Save anyway
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Customer information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Email</Label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={emailDraft}
                  onChange={(event) => setEmailDraft(event.target.value)}
                  readOnly={!canEditCustomers || !isEditing}
                  disabled={isSaving}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={phoneDraft}
                  onChange={(event) => setPhoneDraft(event.target.value)}
                  readOnly={!canEditCustomers || !isEditing}
                  disabled={isSaving}
                  placeholder={isEditing ? "Enter phone number" : "Not provided"}
                  className={
                    isEditing && phoneDraftError
                      ? "pl-9 border-destructive focus-visible:ring-destructive"
                      : "pl-9"
                  }
                  aria-invalid={isEditing && Boolean(phoneDraftError)}
                />
              </div>
              {isEditing && phoneDraftError && (
                <p className="text-xs text-destructive">{phoneDraftError}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="customer-country">Country</Label>
            {canEditCustomers && isEditing ? (
              <Select value={countryDraft} onValueChange={setCountryDraft} disabled={isSaving}>
                <SelectTrigger id="customer-country" className="h-9 md:w-1/2">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((countryName) => (
                    <SelectItem key={countryName} value={countryName}>
                      {countryName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="inline-flex items-center gap-2">
                <Badge variant="outline" className="text-xs gap-1">
                  <Globe className="w-3 h-3" />
                  {customer.country ?? "Not provided"}
                </Badge>
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Province</Label>
              <Input
                value={provinceDraft}
                onChange={(event) => setProvinceDraft(event.target.value)}
                readOnly={!canEditCustomers || !isEditing}
                disabled={isSaving}
                placeholder={isEditing ? "Enter province" : "Not provided"}
              />
            </div>
            <div className="space-y-2">
              <Label>Birthday / Date of Birth</Label>
              <Input
                type={isEditing ? "date" : "text"}
                value={
                  isEditing
                    ? dateOfBirthDraft
                    : customer.dateOfBirth
                      ? formatDisplayDate(customer.dateOfBirth)
                      : "Not provided"
                }
                onChange={(event) => setDateOfBirthDraft(event.target.value)}
                readOnly={!canEditCustomers || !isEditing}
                disabled={isSaving}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="customer-id-passport">ID / Passport number</Label>
              <Input
                id="customer-id-passport"
                value={isEditing ? idPassportDraft : idPassportDraft || "Not provided"}
                onChange={(event) => setIdPassportDraft(event.target.value)}
                readOnly={!canEditCustomers || !isEditing}
                disabled={isSaving}
                placeholder={isEditing ? "ID or passport number" : "Not provided"}
                aria-describedby="customer-id-passport-hint"
              />
              <p id="customer-id-passport-hint" className="text-xs text-muted-foreground">
                Used to prefill this customer&apos;s guest row on new reservation forms. Kept in step with the
                primary guest whenever guest details are saved on a job.
              </p>
            </div>
          </div>

          <div className="space-y-4 rounded-md border p-4">
            <div>
              <h3 className="text-sm font-semibold">Billing details</h3>
              <p className="text-xs text-muted-foreground">
                Printed on tax invoices. Required by law for supplies over R5 000.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Company</Label>
                <Input
                  value={companyNameDraft}
                  onChange={(event) => setCompanyNameDraft(event.target.value)}
                  readOnly={!canEditCustomers || !isEditing}
                  disabled={isSaving}
                  placeholder={isEditing ? "Company name" : "Not provided"}
                />
              </div>
              <div className="space-y-2">
                <Label>VAT number</Label>
                <Input
                  value={vatNumberDraft}
                  onChange={(event) => setVatNumberDraft(event.target.value)}
                  readOnly={!canEditCustomers || !isEditing}
                  disabled={isSaving}
                  placeholder={isEditing ? "Recipient VAT number" : "Not provided"}
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Address line 1</Label>
                <Input
                  value={addressLine1Draft}
                  onChange={(event) => setAddressLine1Draft(event.target.value)}
                  readOnly={!canEditCustomers || !isEditing}
                  disabled={isSaving}
                  placeholder={isEditing ? "Street address" : "Not provided"}
                />
              </div>
              <div className="space-y-2">
                <Label>Address line 2</Label>
                <Input
                  value={addressLine2Draft}
                  onChange={(event) => setAddressLine2Draft(event.target.value)}
                  readOnly={!canEditCustomers || !isEditing}
                  disabled={isSaving}
                  placeholder={isEditing ? "Suburb / apartment" : "Not provided"}
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  value={cityDraft}
                  onChange={(event) => setCityDraft(event.target.value)}
                  readOnly={!canEditCustomers || !isEditing}
                  disabled={isSaving}
                  placeholder={isEditing ? "City" : "Not provided"}
                />
              </div>
              <div className="space-y-2">
                <Label>Postal code</Label>
                <Input
                  value={postalCodeDraft}
                  onChange={(event) => setPostalCodeDraft(event.target.value)}
                  readOnly={!canEditCustomers || !isEditing}
                  disabled={isSaving}
                  placeholder={isEditing ? "Code" : "Not provided"}
                />
              </div>
              <div className="space-y-2">
                <Label>Fax</Label>
                <Input
                  value={faxDraft}
                  onChange={(event) => setFaxDraft(event.target.value)}
                  readOnly={!canEditCustomers || !isEditing}
                  disabled={isSaving}
                  placeholder={isEditing ? "Fax number" : "Not provided"}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label>VIP Status</Label>
              <div className="flex h-10 items-center gap-2 rounded-md border px-3">
                <Switch
                  checked={vipStatusDraft}
                  onCheckedChange={setVipStatusDraft}
                  disabled={!canEditCustomers || !isEditing || isSaving}
                  aria-label="VIP status"
                />
                <span className="text-sm text-muted-foreground">
                  {vipStatusDraft ? "VIP client" : "Standard client"}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>First Travel Date</Label>
              <Input
                value={
                  customer.firstTravelDate
                    ? formatDisplayDate(customer.firstTravelDate)
                    : "Not recorded"
                }
                readOnly
              />
            </div>
            <div className="space-y-2">
              <Label>Last Travel Date</Label>
              <Input
                value={
                  customer.lastTravelDate
                    ? formatDisplayDate(customer.lastTravelDate)
                    : "Not recorded"
                }
                readOnly
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Preferences</Label>
              <Textarea
                value={preferencesDraft}
                onChange={(event) => setPreferencesDraft(event.target.value)}
                maxLength={2000}
                className="min-h-24"
                disabled={!canEditCustomers || !isEditing || isSaving}
                readOnly={!canEditCustomers || !isEditing}
                placeholder={isEditing ? "Service, suite, dietary, or journey preferences..." : "Not provided"}
              />
            </div>
            <div className="space-y-2">
              <Label>Communication Preferences</Label>
              <Textarea
                value={communicationPreferencesDraft}
                onChange={(event) => setCommunicationPreferencesDraft(event.target.value)}
                maxLength={1000}
                className="min-h-24"
                disabled={!canEditCustomers || !isEditing || isSaving}
                readOnly={!canEditCustomers || !isEditing}
                placeholder={isEditing ? "Preferred channels, timing, or contact notes..." : "Not provided"}
              />
            </div>
          </div>

          {rateTypes.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="defaultRateType">Default rate type</Label>
                <Select
                  value={defaultRateTypeIdDraft || "none"}
                  onValueChange={(v) => setDefaultRateTypeIdDraft(v === "none" ? "" : v)}
                  disabled={!canEditCustomers || !isEditing || isSaving}
                >
                  <SelectTrigger id="defaultRateType" className="h-9">
                    <SelectValue placeholder="System default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">System default</SelectItem>
                    {rateTypes.map((rt) => (
                      <SelectItem key={rt.id} value={rt.id}>
                        {rt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Pre-selects the rate version (e.g. Resident) when quoting this customer.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <Accordion
          type="single"
          collapsible
          value={linkedAccountsAccordionValue}
          onValueChange={(nextValue) => {
            setLinkedAccountsAccordionValue(nextValue || undefined)
          }}
        >
          <AccordionItem value={LINKED_ACCOUNTS_ACCORDION_VALUE} className="border-b-0">
            <CardHeader className="space-y-0 py-4">
              <div className="flex flex-row items-center justify-between gap-3">
                <AccordionTrigger className="py-0 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <CardTitle>Linked Accounts</CardTitle>
                    <Badge variant="secondary" className="min-w-6 justify-center px-2 text-xs tabular-nums">
                      {linkedAccountsCount}
                    </Badge>
                  </div>
                </AccordionTrigger>
                {canEditCustomers ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingLinkedAccountId(null)
                      setAddLinkedAccountPrefill(null)
                      setIsAddingLinkedAccount((current) => {
                        const nextValue = !current
                        if (nextValue) {
                          setLinkedAccountsAccordionValue(LINKED_ACCOUNTS_ACCORDION_VALUE)
                        }
                        return nextValue
                      })
                    }}
                    disabled={isSavingLinkedAccount}
                  >
                    {isAddingLinkedAccount ? "Cancel" : "Add"}
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <AccordionContent className="px-6 pb-6">
              <CardContent className="space-y-3 p-0">
                {isAddingLinkedAccount ? (
                  <LinkedAccountForm
                    currentCustomerId={customerId}
                    currentCustomerEmail={customer.email}
                    currentCustomerPhone={customer.phone}
                    initialValue={addLinkedAccountPrefill ?? undefined}
                    submitLabel="Save linked account"
                    isSubmitting={isSavingLinkedAccount}
                    onCancel={() => {
                      setIsAddingLinkedAccount(false)
                      setAddLinkedAccountPrefill(null)
                    }}
                    onSubmit={createLinkedAccount}
                  />
                ) : null}

                {linkedAccounts.length === 0 && !isAddingLinkedAccount ? (
                  <p className="text-sm text-muted-foreground">No linked accounts.</p>
                ) : null}

                {linkedAccounts.map((linkedAccount) => {
                  const isEditingThisAccount = editingLinkedAccountId === linkedAccount.id
                  const linkedDisplayName = linkedAccount.linkedCustomerName
                    ? linkedAccount.linkedCustomerName
                    : [linkedAccount.firstName, linkedAccount.lastName].filter(Boolean).join(" ").trim()
                  const relationshipLabel = linkedAccount.relationship ?? "Not specified"
                  const isDeletingThisAccount = deletingLinkedAccountId === linkedAccount.id

                  return (
                    <div key={linkedAccount.id} className="rounded-lg border p-3 space-y-2">
                      {isEditingThisAccount ? (
                        <LinkedAccountForm
                          currentCustomerId={customerId}
                          currentCustomerEmail={customer.email}
                          currentCustomerPhone={customer.phone}
                          initialValue={{
                            relationship: linkedAccount.relationship,
                            firstName: linkedAccount.firstName,
                            lastName: linkedAccount.lastName,
                            email: linkedAccount.email,
                            phone: linkedAccount.phone,
                            linkedCustomerId: linkedAccount.linkedCustomerId,
                          }}
                          submitLabel="Update linked account"
                          isSubmitting={isSavingLinkedAccount}
                          onCancel={() => setEditingLinkedAccountId(null)}
                          onSubmit={(payload) => updateLinkedAccount(linkedAccount.id, payload)}
                        />
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline">{relationshipLabel}</Badge>
                                {linkedAccount.linkedCustomerId ? (
                                  <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                                    <Link2 className="h-3 w-3" />
                                    Linked to existing customer
                                  </span>
                                ) : null}
                              </div>
                              {linkedAccount.linkedCustomerId ? (
                                <Link
                                  href={`/app/customers/${linkedAccount.linkedCustomerId}`}
                                  className="text-sm font-medium hover:underline"
                                >
                                  {linkedDisplayName || "Open linked customer"}
                                </Link>
                              ) : (
                                <p className="text-sm font-medium">{linkedDisplayName || "Unnamed contact"}</p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {linkedAccount.email ?? "No email"} • {linkedAccount.phone ?? "No cell phone"}
                              </p>
                            </div>
                            {canEditCustomers ? (
                              <div className="flex items-center gap-2 shrink-0">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setIsAddingLinkedAccount(false)
                                    setEditingLinkedAccountId(linkedAccount.id)
                                  }}
                                  disabled={isSavingLinkedAccount || isDeletingThisAccount}
                                >
                                  Edit
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    void deleteLinkedAccount(linkedAccount.id)
                                  }}
                                  disabled={isSavingLinkedAccount || isDeletingThisAccount}
                                >
                                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                                  {isDeletingThisAccount ? "Removing..." : "Delete"}
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>

      <CustomerActivitySummary bookings={bookings} />

      <Card>
        <CardHeader>
          <CardTitle>Bookings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {bookings.length === 0 && (
            <p className="text-sm text-muted-foreground">No bookings found for this customer.</p>
          )}
          {bookings.map((booking) => (
            <Link key={booking.id} href={`/app/bookings/${booking.id}`}>
              <div className="rounded-lg border p-3 hover:bg-accent transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{booking.bookingNumber}</p>
                      <Badge variant="outline" className="text-[10px]">
                        {stageLabels[booking.stage] ?? getPipelineStageLabel(booking.stage)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {booking.direction ?? "Route not specified"}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground flex-shrink-0">
                    <p>
                      {booking.departureDate ? formatDisplayDate(booking.departureDate) : "No departure date"}
                    </p>
                    <p className="mt-1">{booking.consultant ?? "Unassigned"}</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!canEditCustomers && (
            <p className="text-sm text-muted-foreground">
              You have view-only access to customer notes.
            </p>
          )}
          <Textarea
            value={notesDraft}
            onChange={(event) => setNotesDraft(event.target.value)}
            placeholder="Add internal notes for this customer..."
            className="min-h-32"
            disabled={!canEditCustomers || !isEditing || isSaving}
            readOnly={!canEditCustomers || !isEditing}
          />
        </CardContent>
      </Card>

      {canCreateBooking && (
        <NewEnquiryDialog
          open={newBookingOpen}
          onOpenChange={setNewBookingOpen}
          onSaved={(jobId) => router.push(`/app/bookings/${jobId}?tab=quotes`)}
          presetCustomer={{
            id: customer.id,
            title: customer.title,
            firstName: customer.firstName,
            lastName: customer.lastName,
            email: customer.email,
            phone: customer.phone,
            country: customer.country,
            province: customer.province,
          }}
        />
      )}
    </div>
  )
}
