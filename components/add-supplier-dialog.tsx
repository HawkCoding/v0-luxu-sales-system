"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useSWRConfig } from "swr"
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
import { SUPPLIER_KIND_LABELS, type SupplierKind } from "@/lib/types"

interface AddSupplierDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface CreateSupplierFormState {
  kind: SupplierKind | ""
  name: string
  email: string
  phone: string
  website: string
  location: string
  notes: string
}

type SupplierFormField = Exclude<keyof CreateSupplierFormState, "notes">
type SupplierFormErrors = Record<SupplierFormField, string | null>
type SupplierFormTouched = Partial<Record<SupplierFormField, boolean>>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^[+\d\s()-]*$/
const WEBSITE_PATTERN = /^\S+\.\S+$/

function getInitialFormState(): CreateSupplierFormState {
  return {
    kind: "",
    name: "",
    email: "",
    phone: "",
    website: "",
    location: "",
    notes: "",
  }
}

function getInitialTouchedState(): SupplierFormTouched {
  return {}
}

function validateSupplierForm(form: CreateSupplierFormState): SupplierFormErrors {
  const name = form.name.trim()
  const email = form.email.trim()
  const phone = form.phone.trim()
  const website = form.website.trim()
  const location = form.location.trim()

  return {
    kind: form.kind ? null : "Please choose a supplier category",
    name:
      name.length === 0
        ? "Supplier name is required"
        : name.length < 2
          ? "Supplier name must be at least 2 characters"
          : null,
    email:
      email.length > 0 && !EMAIL_PATTERN.test(email)
        ? "Enter a valid email (e.g. name@example.com)"
        : null,
    phone:
      phone.length > 0 && !PHONE_PATTERN.test(phone)
        ? "Phone can include digits, spaces, +, -, and parentheses only"
        : phone.length > 0 && phone.length < 7
          ? "Phone must be at least 7 characters"
          : null,
    website:
      website.length > 0 && !WEBSITE_PATTERN.test(website)
        ? "Enter a valid website (e.g. example.com)"
        : null,
    location:
      location.length > 0 && location.length < 2
        ? "Location must be at least 2 characters"
        : null,
  }
}

export function AddSupplierDialog({ open, onOpenChange }: AddSupplierDialogProps) {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const [isSaving, setIsSaving] = useState(false)
  const [form, setForm] = useState<CreateSupplierFormState>(getInitialFormState())
  const [touched, setTouched] = useState<SupplierFormTouched>(getInitialTouchedState())
  const errors = useMemo(() => validateSupplierForm(form), [form])

  const canSubmit = useMemo(
    () =>
      errors.kind === null &&
      errors.name === null &&
      Object.entries(errors).every(
        ([field, error]) => !error || !touched[field as SupplierFormField],
      ),
    [errors, touched],
  )

  const getFieldClassName = (field: SupplierFormField) =>
    touched[field] && errors[field] ? "border-destructive focus-visible:ring-destructive" : undefined

  const resetForm = () => {
    setForm(getInitialFormState())
    setTouched(getInitialTouchedState())
    setIsSaving(false)
  }

  const markFieldTouched = (field: SupplierFormField) => {
    setTouched((current) => ({ ...current, [field]: true }))
  }

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      resetForm()
    }
  }

  const handleSubmit = async () => {
    const validationErrors = validateSupplierForm(form)
    const hasValidationErrors = Object.values(validationErrors).some((value) => value !== null)

    if (hasValidationErrors) {
      setTouched({
        kind: true,
        name: true,
        email: true,
        phone: true,
        website: true,
        location: true,
      })
      toast.error("Please fix the highlighted fields")
      return
    }

    if (!canSubmit) {
      toast.error("Please complete the required fields")
      return
    }

    if (!form.kind) {
      toast.error("Please choose a supplier category")
      return
    }

    setIsSaving(true)
    try {
      const response = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: form.kind,
          name: form.name,
          email: form.email,
          phone: form.phone,
          website: form.website,
          location: form.location,
          notes: form.notes,
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        toast.error(payload.error ?? "Failed to create supplier")
        return
      }

      await mutate("/api/suppliers?includeDrafts=true")
      handleOpenChange(false)
      toast.success("Supplier created")
      router.push(`/app/suppliers/${payload.id}`)
    } catch {
      toast.error("Failed to create supplier")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Supplier</DialogTitle>
          <DialogDescription>
            Create the supplier record first, then configure full pricing and route details
            on the supplier page.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="supplier-kind">Category</Label>
            <Select
              value={form.kind || undefined}
              onValueChange={(value: SupplierKind) =>
                setForm((current) => ({ ...current, kind: value }))
              }
            >
              <SelectTrigger id="supplier-kind">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SUPPLIER_KIND_LABELS).map(([kind, label]) => (
                  <SelectItem key={kind} value={kind}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {touched.kind && errors.kind ? (
              <p className="text-xs text-destructive">{errors.kind}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="supplier-name">Supplier name</Label>
            <Input
              id="supplier-name"
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Enter supplier name"
              className={getFieldClassName("name")}
              onBlur={() => markFieldTouched("name")}
            />
            {touched.name && errors.name ? (
              <p className="text-xs text-destructive">{errors.name}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="supplier-email">Email</Label>
            <Input
              id="supplier-email"
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
              placeholder="supplier@example.com"
              className={getFieldClassName("email")}
              onBlur={() => markFieldTouched("email")}
            />
            {touched.email && errors.email ? (
              <p className="text-xs text-destructive">{errors.email}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="supplier-phone">Phone</Label>
            <Input
              id="supplier-phone"
              value={form.phone}
              onChange={(event) =>
                setForm((current) => ({ ...current, phone: event.target.value }))
              }
              placeholder="+27 ..."
              className={getFieldClassName("phone")}
              onBlur={() => markFieldTouched("phone")}
            />
            {touched.phone && errors.phone ? (
              <p className="text-xs text-destructive">{errors.phone}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="supplier-website">Website</Label>
            <Input
              id="supplier-website"
              value={form.website}
              onChange={(event) =>
                setForm((current) => ({ ...current, website: event.target.value }))
              }
              placeholder="https://..."
              className={getFieldClassName("website")}
              onBlur={() => markFieldTouched("website")}
            />
            {touched.website && errors.website ? (
              <p className="text-xs text-destructive">{errors.website}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="supplier-location">Location</Label>
            <Input
              id="supplier-location"
              value={form.location}
              onChange={(event) =>
                setForm((current) => ({ ...current, location: event.target.value }))
              }
              placeholder="City or region"
              className={getFieldClassName("location")}
              onBlur={() => markFieldTouched("location")}
            />
            {touched.location && errors.location ? (
              <p className="text-xs text-destructive">{errors.location}</p>
            ) : null}
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="supplier-notes">Notes</Label>
            <Textarea
              id="supplier-notes"
              rows={4}
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({ ...current, notes: event.target.value }))
              }
              placeholder="Add optional notes..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving || !canSubmit}>
            {isSaving ? "Creating..." : "Create Supplier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
