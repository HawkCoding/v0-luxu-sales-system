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
  kind: SupplierKind
  name: string
  email: string
  phone: string
  website: string
  location: string
  notes: string
}

function getInitialFormState(): CreateSupplierFormState {
  return {
    kind: "train_operator",
    name: "",
    email: "",
    phone: "",
    website: "",
    location: "",
    notes: "",
  }
}

export function AddSupplierDialog({ open, onOpenChange }: AddSupplierDialogProps) {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const [isSaving, setIsSaving] = useState(false)
  const [form, setForm] = useState<CreateSupplierFormState>(getInitialFormState())

  const canSubmit = useMemo(() => form.name.trim().length > 0, [form.name])

  const resetForm = () => {
    setForm(getInitialFormState())
    setIsSaving(false)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      resetForm()
    }
  }

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.error("Supplier name is required")
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

      await mutate("/api/suppliers")
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
              value={form.kind}
              onValueChange={(value: SupplierKind) =>
                setForm((current) => ({ ...current, kind: value }))
              }
            >
              <SelectTrigger id="supplier-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SUPPLIER_KIND_LABELS).map(([kind, label]) => (
                  <SelectItem key={kind} value={kind}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            />
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
            />
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
            />
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
            />
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
            />
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
