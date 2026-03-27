"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { useSWRConfig } from "swr"
import { ArrowLeft, CalendarDays, Globe, Mail, Pencil, Phone, Save } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CustomerActivitySummary } from "@/components/customer-activity-summary"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useRole } from "@/lib/role-context"
import { PIPELINE_STAGES } from "@/lib/types"
import { useCustomerDetail } from "@/lib/use-data"
import { formatDisplayDate } from "@/lib/date-format"

type Presentation = "page" | "modal"

interface CustomerDetailViewProps {
  customerId: string
  presentation?: Presentation
}

export function CustomerDetailView({
  customerId,
  presentation = "page",
}: CustomerDetailViewProps) {
  const router = useRouter()
  const { data, isLoading, error, mutate } = useCustomerDetail(customerId)
  const { mutate: mutateGlobal } = useSWRConfig()
  const { can } = useRole()
  const canEditCustomers = can("edit:customers")
  const [emailDraft, setEmailDraft] = useState("")
  const [phoneDraft, setPhoneDraft] = useState("")
  const [notesDraft, setNotesDraft] = useState("")
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const hasLoadError = Boolean(error)

  useEffect(() => {
    if (data && "customer" in data) {
      setEmailDraft(data.customer.email)
      setPhoneDraft(data.customer.phone ?? "")
      setNotesDraft(data.customer.notes ?? "")
    }
  }, [data])

  useEffect(() => {
    if (!hasLoadError) {
      return
    }
    router.replace("/app/customers")
  }, [hasLoadError, router])

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

  if (isLoading || !data || hasLoadError || "error" in data) {
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

  const { customer, bookings } = data
  const fullName = `${customer.firstName} ${customer.lastName}`.trim()
  const initials = `${customer.firstName?.[0] ?? ""}${customer.lastName?.[0] ?? ""}`.toUpperCase()
  const hasChanges =
    emailDraft !== customer.email ||
    phoneDraft !== (customer.phone ?? "") ||
    notesDraft !== (customer.notes ?? "")

  async function saveNotes() {
    if (!canEditCustomers || !isEditing || !hasChanges || isSaving) {
      return
    }

    setIsSaving(true)
    try {
      const response = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          notes: notesDraft,
          email: emailDraft,
          phone: phoneDraft || null,
        }),
      })

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null
        throw new Error(errorPayload?.error ?? "Failed to save customer")
      }

      await mutate()
      await mutateGlobal("/api/data")
      setIsEditing(false)
      toast.success("Customer saved")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save customer"
      toast.error(message)
    } finally {
      setIsSaving(false)
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
              <h1 className="text-2xl font-semibold text-foreground tracking-tight">{fullName}</h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-1">
                {customer.title && <Badge variant="outline">{customer.title}</Badge>}
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" />
                  Customer since {formatDisplayDate(customer.createdAt)}
                </span>
              </div>
            </div>
          </div>

          {canEditCustomers && (
            <div
              className={`flex items-center gap-2${
                presentation === "modal" ? " mr-10 sm:mr-12" : ""
              }`}
            >
              {!isEditing ? (
                <Button variant="secondary" onClick={() => setIsEditing(true)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              ) : (
                <>
                  <Button
                    onClick={() => {
                      setEmailDraft(customer.email)
                      setPhoneDraft(customer.phone ?? "")
                      setNotesDraft(customer.notes ?? "")
                      setIsEditing(false)
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
        </CardContent>
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
                        {stageLabels[booking.stage] ?? booking.stage.replace(/_/g, " ")}
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
    </div>
  )
}
