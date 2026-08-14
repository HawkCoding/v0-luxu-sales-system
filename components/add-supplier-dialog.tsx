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
import {
  createEmptySupplierEmail,
  SupplierEmailEditor,
  type EditableSupplierEmail,
} from "@/components/supplier-email-editor"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { useSuppliers } from "@/lib/use-data"
import { shortenUrl } from "@/lib/url"
import { SUPPLIER_KIND_LABELS, type SupplierKind } from "@/lib/types"

interface AddSupplierDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface CreateSupplierFormState {
  kind: SupplierKind | ""
  name: string
  emails: EditableSupplierEmail[]
  phone: string
  website: string
  location: string
  notes: string
  /** Set when the user ticks "Linked": the sibling record whose contact details this one reuses. */
  parentSupplierId: string | null
}

type SupplierFormField = Exclude<
  keyof CreateSupplierFormState,
  "notes" | "emails" | "parentSupplierId"
>
type SupplierFormErrors = Record<SupplierFormField | "emails", string | null>
type SupplierFormTouched = Partial<Record<SupplierFormField, boolean>>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^[+\d\s()-]*$/
const WEBSITE_PATTERN = /^\S+\.\S+$/

function getInitialFormState(): CreateSupplierFormState {
  return {
    kind: "",
    name: "",
    emails: [createEmptySupplierEmail()],
    phone: "",
    website: "",
    location: "",
    notes: "",
    parentSupplierId: null,
  }
}

function getInitialTouchedState(): SupplierFormTouched {
  return {}
}

function validateSupplierForm(form: CreateSupplierFormState): SupplierFormErrors {
  const name = form.name.trim()
  const phone = form.phone.trim()
  const website = form.website.trim()
  const location = form.location.trim()
  const cleanedEmails = form.emails
    .map((entry) => entry.email.trim())
    .filter((entry) => entry.length > 0)
  const invalidEmail = cleanedEmails.find((entry) => !EMAIL_PATTERN.test(entry))
  const seen = new Set<string>()
  const duplicateEmail = cleanedEmails.find((entry) => {
    const normalized = entry.toLowerCase()
    if (seen.has(normalized)) return true
    seen.add(normalized)
    return false
  })

  return {
    kind: form.kind ? null : "Please choose a supplier category",
    name:
      name.length === 0
        ? "Supplier name is required"
        : name.length < 2
          ? "Supplier name must be at least 2 characters"
          : null,
    emails: invalidEmail
      ? `Invalid email: ${invalidEmail}`
      : duplicateEmail
        ? `Duplicate email: ${duplicateEmail}`
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
  const { data: suppliers } = useSuppliers()

  // The same company can hold one record per category. When the name matches a record in another
  // category, offer to reuse that record's contact details rather than re-typing them. Records that
  // already inherit are excluded -- inheritance is one level deep.
  const linkCandidates = useMemo(() => {
    const normalizedName = form.name.trim().toLowerCase()
    if (normalizedName.length < 2 || !Array.isArray(suppliers)) return []
    return suppliers.filter(
      (supplier) =>
        supplier.name.trim().toLowerCase() === normalizedName &&
        supplier.kind !== form.kind &&
        !supplier.parentSupplierId,
    )
  }, [form.kind, form.name, suppliers])

  // Derived rather than reset on every keystroke: a stale id simply stops matching and goes inert.
  const linkedParent = useMemo(
    () => linkCandidates.find((candidate) => candidate.id === form.parentSupplierId) ?? null,
    [linkCandidates, form.parentSupplierId],
  )
  const isLinked = linkedParent !== null

  const canSubmit = useMemo(
    () =>
      errors.kind === null &&
      errors.name === null &&
      errors.emails === null &&
      Object.entries(errors).filter(([field]) => field !== "emails").every(
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
          email: "",
          emails: form.emails
            .map((entry, index) => ({
              id: entry.id,
              email: entry.email.trim(),
              label: entry.label.trim() || "General",
              // The editor's row order is the saved order; the first address is the primary contact.
              sortOrder: index,
            }))
            .filter((entry) => entry.email.length > 0),
          phone: form.phone,
          website: form.website,
          location: form.location,
          notes: form.notes,
          parentSupplierId: linkedParent?.id ?? null,
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
      router.push(`/app/suppliers/${payload.slug}`)
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
            <Label htmlFor="supplier-kind">
              Category <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.kind || ""}
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
            <Label htmlFor="supplier-name">
              Supplier name <span className="text-destructive">*</span>
            </Label>
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

          {linkCandidates.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-dashed bg-muted/40 p-3 md:col-span-2">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="supplier-linked"
                  checked={isLinked}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({
                      ...current,
                      parentSupplierId: checked === true ? linkCandidates[0].id : null,
                    }))
                  }
                />
                <div className="space-y-1">
                  <Label htmlFor="supplier-linked" className="font-medium">
                    Linked — use the same contact details
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {linkCandidates.length === 1
                      ? `"${linkCandidates[0].name}" already exists under ${SUPPLIER_KIND_LABELS[linkCandidates[0].kind]}. Tick to reuse its phone, website and email list — edit them there and this record follows.`
                      : `"${form.name.trim()}" already exists in other categories. Tick to reuse one record's phone, website and email list.`}
                  </p>
                </div>
              </div>

              {isLinked && linkCandidates.length > 1 ? (
                <div className="space-y-2 pl-7">
                  <Label htmlFor="supplier-linked-parent">Inherit from</Label>
                  <Select
                    value={linkedParent?.id ?? ""}
                    onValueChange={(value) =>
                      setForm((current) => ({ ...current, parentSupplierId: value }))
                    }
                  >
                    <SelectTrigger id="supplier-linked-parent">
                      <SelectValue placeholder="Select a supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {linkCandidates.map((candidate) => (
                        <SelectItem key={candidate.id} value={candidate.id}>
                          {candidate.name} ({SUPPLIER_KIND_LABELS[candidate.kind]})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="supplier-phone">Phone</Label>
            <Input
              id="supplier-phone"
              value={isLinked ? (linkedParent.phone ?? "") : form.phone}
              disabled={isLinked}
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
              value={isLinked ? (linkedParent.website ?? "") : form.website}
              disabled={isLinked}
              onChange={(event) =>
                setForm((current) => ({ ...current, website: event.target.value }))
              }
              placeholder="https://..."
              className={getFieldClassName("website")}
              onBlur={(event) => {
                setForm((current) => ({
                  ...current,
                  website: shortenUrl(event.target.value),
                }))
                markFieldTouched("website")
              }}
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
            {isLinked ? (
              <>
                <Label>Supplier emails</Label>
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Copied from {linkedParent.name} ({SUPPLIER_KIND_LABELS[linkedParent.kind]}) when
                  this supplier is created, and kept in step with it afterwards.
                </div>
              </>
            ) : (
              <>
                <SupplierEmailEditor
                  emails={form.emails}
                  onChange={(emails) => setForm((current) => ({ ...current, emails }))}
                  idPrefix="add-supplier"
                />
                {errors.emails ? <p className="text-xs text-destructive">{errors.emails}</p> : null}
              </>
            )}
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
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? "Creating..." : "Create Supplier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
