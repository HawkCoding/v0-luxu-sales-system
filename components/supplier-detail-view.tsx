"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useSWRConfig } from "swr"
import { ArrowLeft, CheckCircle2, Mail, MapPin, Pencil, Phone, Plus, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ContentTransition } from "@/components/ui/content-transition"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useDeferredReveal } from "@/hooks/use-deferred-reveal"
import { useRole } from "@/lib/role-context"
import { useSupplierDetail } from "@/lib/use-data"
import {
  SUPPLIER_KIND_LABELS,
  type SupplierDetail,
  type SupplierKind,
} from "@/lib/types"

type Presentation = "page" | "modal"

interface SupplierDetailViewProps {
  supplierId: string
  presentation?: Presentation
}

interface EditablePricingOption {
  id?: string
  name: string
  singlePrice: number
  doublePrice: number
  familyPrice: number
  currency: string
  isPrimary: boolean
}

interface SupplierFormState {
  name: string
  kind: SupplierKind
  email: string
  phone: string
  website: string
  location: string
  notes: string
  active: boolean
  pricingOptions: EditablePricingOption[]
}

interface SupplierDetailSkeletonProps {
  presentation?: Presentation
}

function createEmptyPricingOption(): EditablePricingOption {
  return {
    name: "",
    singlePrice: 0,
    doublePrice: 0,
    familyPrice: 0,
    currency: "ZAR",
    isPrimary: false,
  }
}

function buildFormState(supplier: SupplierDetail): SupplierFormState {
  return {
    name: supplier.name,
    kind: supplier.kind,
    email: supplier.email ?? "",
    phone: supplier.phone ?? "",
    website: supplier.website ?? "",
    location: supplier.location ?? "",
    notes: supplier.notes ?? "",
    active: supplier.active,
    pricingOptions:
      supplier.pricingOptions.length > 0
        ? supplier.pricingOptions.map((option) => ({
            id: option.id,
            name: option.name,
            singlePrice: option.singlePrice,
            doublePrice: option.doublePrice,
            familyPrice: option.familyPrice,
            currency: option.currency,
            isPrimary: option.isPrimary,
          }))
        : [createEmptyPricingOption()],
  }
}

function formatCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function getContainerClass(presentation: Presentation) {
  return presentation === "page"
    ? "p-6 space-y-6 max-w-5xl"
    : "max-h-[80vh] overflow-y-auto p-6 space-y-6"
}

export function SupplierDetailSkeleton({
  presentation = "page",
}: SupplierDetailSkeletonProps) {
  return (
    <div className={getContainerClass(presentation)}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-3 flex-1">
          {presentation === "page" && (
            <Button asChild variant="ghost" size="sm" className="pl-0">
              <Link href="/app/suppliers">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to suppliers
              </Link>
            </Button>
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Skeleton className="h-9 w-56" />
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-48" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-28" />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle>Supplier information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {["Email", "Phone", "Website", "Location", "Last updated", "Status"].map(
              (label) => (
                <div key={label} className="space-y-1">
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                    style={{ fontFamily: "var(--font-inter)" }}
                  >
                    {label}
                  </p>
                  <Skeleton className="h-4 w-28" />
                </div>
              ),
            )}
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="h-4 w-4" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>

          <div className="rounded-lg bg-secondary/40 p-4 text-sm text-muted-foreground">
            <div className="space-y-2">
              <Skeleton className="h-4 w-full max-w-xl" />
              <Skeleton className="h-4 w-full max-w-md" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>Pricing</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage the pricing options shown when editing this supplier.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {["Single", "Double", "Family"].map((label) => (
                  <div key={label} className="space-y-1">
                    <p
                      className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                      style={{ fontFamily: "var(--font-inter)" }}
                    >
                      {label}
                    </p>
                    <Skeleton className="h-4 w-24" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function InfoItem({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  return (
    <div className="space-y-1">
      <p
        className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
        style={{ fontFamily: "var(--font-inter)" }}
      >
        {label}
      </p>
      <p className="text-sm text-foreground">{value || "-"}</p>
    </div>
  )
}

export function SupplierDetailView({
  supplierId,
  presentation = "page",
}: SupplierDetailViewProps) {
  const { data, isLoading, mutate: mutateDetail } = useSupplierDetail(supplierId)
  const { mutate } = useSWRConfig()
  const { can } = useRole()
  const canEdit = can("edit:suppliers")
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [form, setForm] = useState<SupplierFormState | null>(null)

  const supplier =
    data && !("error" in data)
      ? data
      : null
  const fallbackForm = useMemo(
    () => (supplier ? buildFormState(supplier) : null),
    [supplier],
  )
  const formState = form ?? fallbackForm
  const { showContent } = useDeferredReveal({
    isReady: data !== undefined,
    resetKey: supplierId,
    minDelayMs: 800,
  })

  useEffect(() => {
    if (supplier) {
      setForm(buildFormState(supplier))
    }
  }, [supplier])

  const pricingSummary = useMemo(() => {
    if (!supplier || supplier.pricingOptions.length === 0) {
      return "No pricing configured yet"
    }

    const primaryOption =
      supplier.pricingOptions.find((option) => option.isPrimary) ??
      supplier.pricingOptions[0]

    return `${primaryOption.name} · ${formatCurrency(
      primaryOption.doublePrice,
      primaryOption.currency,
    )} double`
  }, [supplier])

  const updateField = <K extends keyof SupplierFormState>(
    key: K,
    value: SupplierFormState[K],
  ) => {
    setForm((current) => {
      const nextForm = current ?? fallbackForm
      return nextForm ? { ...nextForm, [key]: value } : current
    })
  }

  const updatePricingOption = <
    K extends keyof EditablePricingOption,
  >(
    index: number,
    key: K,
    value: EditablePricingOption[K],
  ) => {
    setForm((current) => {
      const nextForm = current ?? fallbackForm
      if (!nextForm) return current

      const nextOptions = nextForm.pricingOptions.map((option, optionIndex) => {
        if (optionIndex !== index) return option
        return { ...option, [key]: value }
      })

      return { ...nextForm, pricingOptions: nextOptions }
    })
  }

  const markPrimaryOption = (index: number) => {
    setForm((current) => {
      const nextForm = current ?? fallbackForm
      if (!nextForm) return current
      return {
        ...nextForm,
        pricingOptions: nextForm.pricingOptions.map((option, optionIndex) => ({
          ...option,
          isPrimary: optionIndex === index,
        })),
      }
    })
  }

  const addPricingOption = () => {
    setForm((current) =>
      (current ?? fallbackForm)
        ? {
            ...(current ?? fallbackForm)!,
            pricingOptions: [
              ...(current ?? fallbackForm)!.pricingOptions,
              createEmptyPricingOption(),
            ],
          }
        : current,
    )
  }

  const removePricingOption = (index: number) => {
    setForm((current) => {
      const nextForm = current ?? fallbackForm
      if (!nextForm) return current

      const nextOptions = nextForm.pricingOptions.filter(
        (_option, optionIndex) => optionIndex !== index,
      )

      if (nextOptions.length === 0) {
        return {
          ...nextForm,
          pricingOptions: [createEmptyPricingOption()],
        }
      }

      if (!nextOptions.some((option) => option.isPrimary)) {
        nextOptions[0] = { ...nextOptions[0], isPrimary: true }
      }

      return { ...nextForm, pricingOptions: nextOptions }
    })
  }

  const cancelEdit = () => {
    if (supplier) {
      setForm(buildFormState(supplier))
    }
    setIsEditing(false)
  }

  const handleSave = async () => {
    if (!formState) return

    if (!formState.name.trim()) {
      toast.error("Supplier name is required")
      return
    }

    const namedPricingOptions = formState.pricingOptions.filter(
      (option) => option.name.trim().length > 0,
    )
    const hasExplicitPrimary = namedPricingOptions.some(
      (option) => option.isPrimary,
    )
    const cleanedPricingOptions = namedPricingOptions.map((option, index) => ({
        id: option.id,
        name: option.name.trim(),
        singlePrice: option.singlePrice,
        doublePrice: option.doublePrice,
        familyPrice: option.familyPrice,
        currency: option.currency.trim().toUpperCase() || "ZAR",
        isPrimary: hasExplicitPrimary ? option.isPrimary : index === 0,
      }))

    setIsSaving(true)
    try {
      const response = await fetch(`/api/suppliers/${supplierId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formState.name.trim(),
          kind: formState.kind,
          email: formState.email.trim(),
          phone: formState.phone.trim(),
          website: formState.website.trim(),
          location: formState.location.trim(),
          notes: formState.notes.trim(),
          active: formState.active,
          pricingOptions: cleanedPricingOptions,
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        toast.error(payload.error ?? "Failed to update supplier")
        return
      }

      await Promise.all([mutateDetail(), mutate("/api/suppliers")])
      setIsEditing(false)
      toast.success("Supplier updated successfully")
    } catch {
      toast.error("Failed to update supplier")
    } finally {
      setIsSaving(false)
    }
  }

  const fallback = <SupplierDetailSkeleton presentation={presentation} />
  const content =
    data && "error" in data ? (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <p className="text-base font-medium text-foreground">
            Supplier not found
          </p>
          <p className="text-sm text-muted-foreground">
            The supplier could not be loaded or no longer exists.
          </p>
          <div>
            <Button asChild variant="outline" size="sm">
              <Link href="/app/suppliers">Back to suppliers</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    ) : formState ? (
      <div className={getContainerClass(presentation)}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-3">
          {presentation === "page" && (
            <Button asChild variant="ghost" size="sm" className="pl-0">
              <Link href="/app/suppliers">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to suppliers
              </Link>
            </Button>
          )}

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                {supplier?.name}
              </h1>
              <Badge variant="secondary">
                {SUPPLIER_KIND_LABELS[supplier!.kind]}
              </Badge>
              <Badge variant={supplier?.active ? "default" : "outline"}>
                {supplier?.active ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {pricingSummary}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canEdit && !isEditing && (
            <Button onClick={() => setIsEditing(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}

          {isEditing && (
            <>
              <Button variant="outline" onClick={cancelEdit} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? "Saving..." : "Save changes"}
              </Button>
            </>
          )}
        </div>
      </div>

      {!canEdit && (
        <Card className="border-dashed">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Supplier details are view-only for your role. Editing pricing and core
            supplier information is restricted to managers and admins.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-4">
          <CardTitle>Supplier information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {isEditing ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="supplier-name">Supplier name</Label>
                  <Input
                    id="supplier-name"
                    value={formState.name}
                    onChange={(event) => updateField("name", event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="supplier-kind">Category</Label>
                  <Select
                    value={formState.kind}
                    onValueChange={(value: SupplierKind) =>
                      updateField("kind", value)
                    }
                  >
                    <SelectTrigger id="supplier-kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SUPPLIER_KIND_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="supplier-email">Email</Label>
                  <Input
                    id="supplier-email"
                    type="email"
                    value={formState.email}
                    onChange={(event) => updateField("email", event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="supplier-phone">Phone</Label>
                  <Input
                    id="supplier-phone"
                    value={formState.phone}
                    onChange={(event) => updateField("phone", event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="supplier-website">Website</Label>
                  <Input
                    id="supplier-website"
                    value={formState.website}
                    onChange={(event) => updateField("website", event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="supplier-location">Location</Label>
                  <Input
                    id="supplier-location"
                    value={formState.location}
                    onChange={(event) => updateField("location", event.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier-notes">Notes</Label>
                <Textarea
                  id="supplier-notes"
                  value={formState.notes}
                  onChange={(event) => updateField("notes", event.target.value)}
                  rows={4}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Supplier status
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Toggle whether this supplier is currently active.
                  </p>
                </div>
                <Switch
                  checked={formState.active}
                  onCheckedChange={(checked) => updateField("active", checked)}
                />
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <InfoItem label="Email" value={supplier?.email} />
                <InfoItem label="Phone" value={supplier?.phone} />
                <InfoItem label="Website" value={supplier?.website} />
                <InfoItem label="Location" value={supplier?.location} />
                <InfoItem
                  label="Last updated"
                  value={
                    supplier
                      ? new Date(supplier.updatedAt).toLocaleDateString()
                      : null
                  }
                />
                <InfoItem
                  label="Status"
                  value={supplier?.active ? "Active" : "Inactive"}
                />
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>{supplier?.email || "No email on file"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  <span>{supplier?.phone || "No phone on file"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>{supplier?.location || "No location on file"}</span>
                </div>
              </div>

              <div className="rounded-lg bg-secondary/40 p-4 text-sm text-muted-foreground">
                {supplier?.notes || "No supplier notes recorded."}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>Pricing</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage the pricing options shown when editing this supplier.
              </p>
            </div>

            {isEditing && (
              <Button variant="outline" size="sm" onClick={addPricingOption}>
                <Plus className="mr-2 h-4 w-4" />
                Add pricing option
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditing ? (
            formState.pricingOptions.map((option, index) => (
              <div key={option.id ?? `new-${index}`} className="rounded-lg border p-4 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="space-y-2 flex-1 min-w-[220px]">
                    <Label htmlFor={`pricing-name-${index}`}>Option name</Label>
                    <Input
                      id={`pricing-name-${index}`}
                      value={option.name}
                      onChange={(event) =>
                        updatePricingOption(index, "name", event.target.value)
                      }
                      placeholder="e.g. Deluxe suite"
                    />
                  </div>

                  <div className="flex items-center gap-2 self-end">
                    <Button
                      type="button"
                      size="sm"
                      variant={option.isPrimary ? "default" : "outline"}
                      onClick={() => markPrimaryOption(index)}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Primary
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => removePricingOption(index)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor={`pricing-single-${index}`}>Single</Label>
                    <Input
                      id={`pricing-single-${index}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={option.singlePrice}
                      onChange={(event) =>
                        updatePricingOption(
                          index,
                          "singlePrice",
                          Number(event.target.value || 0),
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`pricing-double-${index}`}>Double</Label>
                    <Input
                      id={`pricing-double-${index}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={option.doublePrice}
                      onChange={(event) =>
                        updatePricingOption(
                          index,
                          "doublePrice",
                          Number(event.target.value || 0),
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`pricing-family-${index}`}>Family</Label>
                    <Input
                      id={`pricing-family-${index}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={option.familyPrice}
                      onChange={(event) =>
                        updatePricingOption(
                          index,
                          "familyPrice",
                          Number(event.target.value || 0),
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`pricing-currency-${index}`}>Currency</Label>
                    <Input
                      id={`pricing-currency-${index}`}
                      maxLength={10}
                      value={option.currency}
                      onChange={(event) =>
                        updatePricingOption(
                          index,
                          "currency",
                          event.target.value.toUpperCase(),
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            ))
          ) : supplier && supplier.pricingOptions.length > 0 ? (
            supplier.pricingOptions.map((option) => (
              <div key={option.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-foreground">
                    {option.name}
                  </p>
                  {option.isPrimary && <Badge>Primary</Badge>}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <InfoItem
                    label="Single"
                    value={formatCurrency(option.singlePrice, option.currency)}
                  />
                  <InfoItem
                    label="Double"
                    value={formatCurrency(option.doublePrice, option.currency)}
                  />
                  <InfoItem
                    label="Family"
                    value={formatCurrency(option.familyPrice, option.currency)}
                  />
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              No pricing options have been configured for this supplier yet.
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    ) : null

  return (
    <ContentTransition
      show={Boolean(content) && showContent}
      fallback={fallback}
    >
      {content}
    </ContentTransition>
  )
}
