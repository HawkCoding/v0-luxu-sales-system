"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { ExternalLink, Link2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export const LINKED_ACCOUNT_RELATIONSHIP_OPTIONS = [
  "Spouse",
  "Partner",
  "Family Member",
  "Travel Agent",
  "Other",
] as const

interface DetectMatchResponse {
  match: {
    id: string
    firstName: string
    lastName: string
    email: string
    phone: string | null
  } | null
}

export interface LinkedAccountFormValue {
  relationship: string | null
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  linkedCustomerId: string | null
}

interface LinkedAccountFormProps {
  currentCustomerId: string
  currentCustomerEmail: string
  currentCustomerPhone: string | null
  initialValue?: LinkedAccountFormValue
  submitLabel: string
  isSubmitting: boolean
  onCancel: () => void
  onSubmit: (value: LinkedAccountFormValue) => Promise<void> | void
}

function normalizeOptionalString(value: string): string | null {
  const normalized = value.trim()
  return normalized ? normalized : null
}

export function LinkedAccountForm({
  currentCustomerId,
  currentCustomerEmail,
  currentCustomerPhone,
  initialValue,
  submitLabel,
  isSubmitting,
  onCancel,
  onSubmit,
}: LinkedAccountFormProps) {
  const router = useRouter()
  const [relationship, setRelationship] = useState(initialValue?.relationship ?? "Partner")
  const [firstName, setFirstName] = useState(initialValue?.firstName ?? "")
  const [lastName, setLastName] = useState(initialValue?.lastName ?? "")
  const [email, setEmail] = useState(initialValue?.email ?? "")
  const [phone, setPhone] = useState(initialValue?.phone ?? "")
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(
    initialValue?.linkedCustomerId ?? null,
  )
  const [detectedMatch, setDetectedMatch] = useState<DetectMatchResponse["match"]>(null)
  const [isDetecting, setIsDetecting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const linkedCustomerDisplayName = useMemo(() => {
    if (!detectedMatch) return null
    return `${detectedMatch.firstName} ${detectedMatch.lastName}`.trim()
  }, [detectedMatch])
  const isLinkedToDetectedMatch = Boolean(detectedMatch && linkedCustomerId === detectedMatch.id)

  async function detectMatch(params: { email?: string; phone?: string }) {
    const query = new URLSearchParams()
    if (params.email) query.set("email", params.email)
    if (params.phone) query.set("phone", params.phone)
    query.set("excludeId", currentCustomerId)
    setIsDetecting(true)

    try {
      const response = await fetch(`/api/customers/detect-match?${query.toString()}`)
      if (!response.ok) {
        setDetectedMatch(null)
        return
      }
      const payload = (await response.json()) as DetectMatchResponse
      setDetectedMatch(payload.match)
      if (!payload.match && !initialValue?.linkedCustomerId) {
        setLinkedCustomerId(null)
      }
    } finally {
      setIsDetecting(false)
    }
  }

  async function handleEmailBlur() {
    const normalizedEmail = normalizeOptionalString(email)?.toLowerCase() ?? null
    if (!normalizedEmail || normalizedEmail === currentCustomerEmail.toLowerCase()) {
      return
    }
    await detectMatch({ email: normalizedEmail })
  }

  async function handlePhoneBlur() {
    const normalizedPhone = normalizeOptionalString(phone)
    if (!normalizedPhone || normalizedPhone === currentCustomerPhone) {
      return
    }
    await detectMatch({ phone: normalizedPhone })
  }

  async function handleSubmit() {
    const payload: LinkedAccountFormValue = {
      relationship: normalizeOptionalString(relationship),
      firstName: normalizeOptionalString(firstName),
      lastName: normalizeOptionalString(lastName),
      email: normalizeOptionalString(email)?.toLowerCase() ?? null,
      phone: normalizeOptionalString(phone),
      linkedCustomerId,
    }

    if (
      !payload.relationship &&
      !payload.firstName &&
      !payload.lastName &&
      !payload.email &&
      !payload.phone &&
      !payload.linkedCustomerId
    ) {
      setFormError("Please provide at least one linked account field")
      return
    }

    setFormError(null)
    await onSubmit(payload)
  }

  function handleConfirmLinkToDetectedMatch() {
    if (!detectedMatch) {
      return
    }

    setLinkedCustomerId(detectedMatch.id)
    setFirstName(detectedMatch.firstName)
    setLastName(detectedMatch.lastName)
    setEmail(detectedMatch.email)
    setPhone(detectedMatch.phone ?? "")
  }

  return (
    <div className="rounded-lg border border-dashed p-4 space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Relationship</Label>
          <Select value={relationship} onValueChange={setRelationship}>
            <SelectTrigger>
              <SelectValue placeholder="Select a relationship" />
            </SelectTrigger>
            <SelectContent>
              {LINKED_ACCOUNT_RELATIONSHIP_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label>First name</Label>
          <Input
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            placeholder="First name"
            disabled={isSubmitting || isLinkedToDetectedMatch}
          />
        </div>
        <div className="space-y-2">
          <Label>Last name</Label>
          <Input
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            placeholder="Last name"
            disabled={isSubmitting || isLinkedToDetectedMatch}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Email</Label>
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={() => void handleEmailBlur()}
            placeholder="name@example.com"
            disabled={isSubmitting || isLinkedToDetectedMatch}
          />
        </div>
        <div className="space-y-2">
          <Label>Cell phone</Label>
          <Input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            onBlur={() => void handlePhoneBlur()}
            placeholder="+27..."
            disabled={isSubmitting || isLinkedToDetectedMatch}
          />
        </div>
      </div>

      {isLinkedToDetectedMatch ? (
        <p className="text-xs text-muted-foreground">
          Name and contact fields are folded to the linked customer account and locked.
        </p>
      ) : null}

      {isDetecting ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Checking for matching customer...
        </div>
      ) : null}

      {detectedMatch ? (
        <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-2">
          <p className="text-foreground">
            Found existing customer <span className="font-medium">{linkedCustomerDisplayName}</span>
            {detectedMatch.email ? ` (${detectedMatch.email})` : ""}
            {detectedMatch.phone ? ` • ${detectedMatch.phone}` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => router.push(`/app/customers/${detectedMatch.id}`)}
              disabled={isSubmitting}
            >
              Go to account
            </Button>
            <Button asChild type="button" size="sm" variant="ghost" disabled={isSubmitting}>
              <Link
                href={`/app/customers/${detectedMatch.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open in new tab
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
          {isLinkedToDetectedMatch ? (
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              This linked account will be connected to that customer.
            </p>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmLinkToDetectedMatch}
              disabled={isSubmitting}
            >
              Yes, link this account
            </Button>
          )}
        </div>
      ) : null}

      {linkedCustomerId && !detectedMatch ? (
        <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          This entry is currently linked to an existing customer.
        </div>
      ) : null}

      {formError ? <p className="text-xs text-destructive">{formError}</p> : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : submitLabel}
        </Button>
      </div>
    </div>
  )
}
