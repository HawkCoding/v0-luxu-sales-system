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
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useRole } from "@/lib/role-context"
import { getPipelineStageLabel, PIPELINE_STAGES } from "@/lib/types"
import { useCustomerDetail } from "@/lib/use-data"
import { formatDisplayDate } from "@/lib/date-format"
import { useRecordPresence } from "@/hooks/use-record-presence"
import { useVersionedSave } from "@/hooks/use-versioned-save"

type Presentation = "page" | "modal"

interface CustomerPatchPayload {
  notes: string
  email: string
  phone: string | null
  province: string | null
  date_of_birth: string | null
  vip_status: boolean
  preferences: string | null
  communication_preferences: string | null
}

interface CustomerPatchResponse {
  notes: string | null
  email: string
  phone: string | null
  province: string | null
  dateOfBirth: string | null
  vipStatus: boolean
  preferences: string | null
  communicationPreferences: string | null
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
  const [newBookingOpen, setNewBookingOpen] = useState(false)
  const [emailDraft, setEmailDraft] = useState("")
  const [phoneDraft, setPhoneDraft] = useState("")
  const [notesDraft, setNotesDraft] = useState("")
  const [provinceDraft, setProvinceDraft] = useState("")
  const [dateOfBirthDraft, setDateOfBirthDraft] = useState("")
  const [vipStatusDraft, setVipStatusDraft] = useState(false)
  const [preferencesDraft, setPreferencesDraft] = useState("")
  const [communicationPreferencesDraft, setCommunicationPreferencesDraft] = useState("")
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
  const hasLoadError = Boolean(error)
  const lastSeenCustomerUpdatedAtRef = useRef<string | undefined>(undefined)
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
        setNotesDraft(data.customer.notes ?? "")
        setProvinceDraft(data.customer.province ?? "")
        setDateOfBirthDraft(data.customer.dateOfBirth ?? "")
        setVipStatusDraft(data.customer.vipStatus ?? false)
        setPreferencesDraft(data.customer.preferences ?? "")
        setCommunicationPreferencesDraft(data.customer.communicationPreferences ?? "")
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
      ? "max-h-[80vh] overflow-y-auto p-6 space-y-6"
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
  const hasChanges =
    emailDraft !== customer.email ||
    phoneDraft !== (customer.phone ?? "") ||
    notesDraft !== (customer.notes ?? "") ||
    provinceDraft !== (customer.province ?? "") ||
    dateOfBirthDraft !== (customer.dateOfBirth ?? "") ||
    vipStatusDraft !== (customer.vipStatus ?? false) ||
    preferencesDraft !== (customer.preferences ?? "") ||
    communicationPreferencesDraft !== (customer.communicationPreferences ?? "")

  function getCustomerPatchPayload(): CustomerPatchPayload {
    return {
      notes: notesDraft,
      email: emailDraft,
      phone: phoneDraft || null,
      province: provinceDraft || null,
      date_of_birth: dateOfBirthDraft || null,
      vip_status: vipStatusDraft,
      preferences: preferencesDraft || null,
      communication_preferences: communicationPreferencesDraft || null,
    }
  }

  async function persistCustomer(
    payload: CustomerPatchPayload,
    options?: { ignoreExpectedUpdatedAt?: boolean },
  ): Promise<boolean> {
    setLastCustomerPayload(payload)

    try {
      const updated = await saveCustomer(payload, options)
      await mutate()
      await mutateGlobal("/api/data")
      setIsEditing(false)
      setEditingStartedUpdatedAt(updated.updatedAt)
      setHasExternalUpdate(false)
      clearCustomerConflict()
      toast.success("Customer saved")
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save customer"
      toast.error(message)
      return false
    }
  }

  async function saveNotes() {
    if (!canEditCustomers || !isEditing || !hasChanges || isSaving) {
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
      await mutateGlobal("/api/data")
      setIsAddingLinkedAccount(false)
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
      await mutateGlobal("/api/data")
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
      await mutateGlobal("/api/data")
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
                      setNotesDraft(customer.notes ?? "")
                      setProvinceDraft(customer.province ?? "")
                      setDateOfBirthDraft(customer.dateOfBirth ?? "")
                      setVipStatusDraft(customer.vipStatus ?? false)
                      setPreferencesDraft(customer.preferences ?? "")
                      setCommunicationPreferencesDraft(customer.communicationPreferences ?? "")
                      setIsEditing(false)
                      setHasExternalUpdate(false)
                      clearCustomerConflict()
                    }}
                    variant="outline"
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button onClick={saveNotes} disabled={!hasChanges || isSaving}>
                    <Save className="mr-2 h-4 w-4" />
                    {isSaving ? "Saving..." : "Save changes"}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {(customerConflict || hasExternalUpdate) && (
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
      )}

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
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Country</Label>
            <div className="inline-flex items-center gap-2">
              <Badge variant="outline" className="text-xs gap-1">
                <Globe className="w-3 h-3" />
                {customer.country ?? "Not provided"}
              </Badge>
            </div>
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
                    submitLabel="Save linked account"
                    isSubmitting={isSavingLinkedAccount}
                    onCancel={() => setIsAddingLinkedAccount(false)}
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
          onSaved={(jobId) => router.push(`/app/bookings/${jobId}`)}
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
