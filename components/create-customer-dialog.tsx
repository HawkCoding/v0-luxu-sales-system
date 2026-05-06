"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Loader2 } from "lucide-react"
import { TITLES, COUNTRIES } from "@/lib/form-data"

interface CreateCustomerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (customerId: string) => void
}

interface FormState {
  title: string
  firstName: string
  lastName: string
  email: string
  phone: string
  country: string
  notes: string
}

type FormField = keyof Omit<FormState, "notes">
type FormErrors = Record<FormField, string | null>
type FormTouched = Partial<Record<FormField, boolean>>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function getInitialForm(): FormState {
  return { title: "", firstName: "", lastName: "", email: "", phone: "", country: "", notes: "" }
}

function validateForm(form: FormState): FormErrors {
  return {
    title: null,
    firstName: form.firstName.trim().length === 0 ? "First name is required" : null,
    lastName: form.lastName.trim().length === 0 ? "Last name is required" : null,
    email:
      form.email.trim().length === 0
        ? "Email is required"
        : !EMAIL_PATTERN.test(form.email.trim())
          ? "Must be a valid email address"
          : null,
    phone: null,
    country: null,
  }
}

export function CreateCustomerDialog({ open, onOpenChange, onSuccess }: CreateCustomerDialogProps) {
  const [form, setForm] = useState<FormState>(getInitialForm())
  const [touched, setTouched] = useState<FormTouched>({})
  const [isSaving, setIsSaving] = useState(false)
  const [emailConflictError, setEmailConflictError] = useState<string | null>(null)

  const errors = useMemo(() => validateForm(form), [form])
  const hasErrors = useMemo(() => Object.values(errors).some((e) => e !== null), [errors])

  const getFieldClassName = (field: FormField) =>
    touched[field] && errors[field] ? "border-destructive focus-visible:ring-destructive" : undefined

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (key === "email") setEmailConflictError(null)
  }

  const markTouched = (field: FormField) => setTouched((t) => ({ ...t, [field]: true }))

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next)
    if (!next) {
      setTimeout(() => {
        setForm(getInitialForm())
        setTouched({})
        setEmailConflictError(null)
        setIsSaving(false)
      }, 300)
    }
  }

  const handleSubmit = async () => {
    const currentErrors = validateForm(form)
    const hasValidationErrors = Object.values(currentErrors).some((e) => e !== null)

    if (hasValidationErrors) {
      setTouched({ title: true, firstName: true, lastName: true, email: true, phone: true, country: true })
      toast.error("Please fix the highlighted fields")
      return
    }

    setIsSaving(true)
    setEmailConflictError(null)

    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title || null,
          first_name: form.firstName,
          last_name: form.lastName,
          email: form.email,
          phone: form.phone || null,
          country: form.country || null,
          notes: form.notes || null,
        }),
      })

      const payload = await response.json()

      if (response.status === 409) {
        setEmailConflictError(payload.error ?? "A customer with this email already exists.")
        setTouched((t) => ({ ...t, email: true }))
        return
      }

      if (!response.ok) {
        toast.error(payload.error ?? "Failed to create customer")
        return
      }

      handleOpenChange(false)
      onSuccess(payload.id)
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Customer</DialogTitle>
          <DialogDescription>Add a new customer to your database.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Select value={form.title} onValueChange={(v) => setField("title", v)}>
              <SelectTrigger id="title" className="h-9">
                <SelectValue placeholder="Select title" />
              </SelectTrigger>
              <SelectContent>
                {TITLES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* spacer */}
          <div />

          {/* First Name */}
          <div className="space-y-1.5">
            <Label htmlFor="firstName">
              First Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="firstName"
              value={form.firstName}
              onChange={(e) => setField("firstName", e.target.value)}
              onBlur={() => markTouched("firstName")}
              className={getFieldClassName("firstName")}
              placeholder="Jane"
            />
            {touched.firstName && errors.firstName && (
              <p className="text-xs text-destructive">{errors.firstName}</p>
            )}
          </div>

          {/* Last Name */}
          <div className="space-y-1.5">
            <Label htmlFor="lastName">
              Last Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="lastName"
              value={form.lastName}
              onChange={(e) => setField("lastName", e.target.value)}
              onBlur={() => markTouched("lastName")}
              className={getFieldClassName("lastName")}
              placeholder="Smith"
            />
            {touched.lastName && errors.lastName && (
              <p className="text-xs text-destructive">{errors.lastName}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
              onBlur={() => markTouched("email")}
              className={
                (touched.email && errors.email) || emailConflictError
                  ? "border-destructive focus-visible:ring-destructive"
                  : undefined
              }
              placeholder="jane@example.com"
            />
            {touched.email && errors.email && (
              <p className="text-xs text-destructive">{errors.email}</p>
            )}
            {emailConflictError && (
              <p className="text-xs text-destructive">{emailConflictError}</p>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setField("phone", e.target.value)}
              placeholder="+1 555 000 0000"
            />
          </div>

          {/* Country */}
          <div className="space-y-1.5">
            <Label htmlFor="country">Country</Label>
            <Select value={form.country} onValueChange={(v) => setField("country", v)}>
              <SelectTrigger id="country" className="h-9">
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* spacer */}
          <div />

          {/* Notes */}
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder="Any additional notes..."
              rows={3}
              maxLength={5000}
            />
            {form.notes.length > 4800 && (
              <p className="text-xs text-muted-foreground text-right">{form.notes.length}/5000</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving || (hasErrors && Object.keys(touched).length > 0)}>
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isSaving ? "Creating..." : "Create Customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
