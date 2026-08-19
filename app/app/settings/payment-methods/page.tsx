"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, ArrowDown, ArrowUp, Loader2, Plus, Star, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { PaymentMethodEditor, type AdminPaymentMethod } from "@/components/payment-method-editor"
import { useRole } from "@/lib/role-context"
import { MAX_PAYMENT_METHODS } from "@/lib/payment-methods-shared"

interface MethodsResponse {
  methods: AdminPaymentMethod[]
}

export default function PaymentMethodsPage() {
  const { role } = useRole()
  const canEdit = role === "admin" || role === "manager"

  const [methods, setMethods] = useState<AdminPaymentMethod[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState("")
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/settings/payment-methods")
      if (!res.ok) {
        toast.error("Failed to load payment methods")
        return
      }
      const data = (await res.json()) as MethodsResponse
      setMethods(data.methods)
      setSelectedId((current) => current ?? data.methods[0]?.id ?? null)
    } catch {
      toast.error("Failed to load payment methods")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const selected = methods.find((m) => m.id === selectedId) ?? null

  async function create() {
    if (!addName.trim()) return
    setAdding(true)
    try {
      const res = await fetch("/api/settings/payment-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addName.trim() }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        toast.error(detail?.error ?? "Failed to add payment method")
        return
      }
      setAddOpen(false)
      setAddName("")
      await load()
      toast.success("Payment method added")
    } catch {
      toast.error("Failed to add payment method")
    } finally {
      setAdding(false)
    }
  }

  async function toggleEnabled(method: AdminPaymentMethod) {
    setBusyId(method.id)
    try {
      const res = await fetch(`/api/settings/payment-methods/${method.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !method.enabled }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        toast.error(detail?.error ?? "Failed to update payment method")
        return
      }
      await load()
    } catch {
      toast.error("Failed to update payment method")
    } finally {
      setBusyId(null)
    }
  }

  async function makeDefault(method: AdminPaymentMethod) {
    setBusyId(method.id)
    try {
      const res = await fetch(`/api/settings/payment-methods/${method.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        toast.error(detail?.error ?? "Failed to set default")
        return
      }
      await load()
      toast.success(`${method.name} is now the default`)
    } catch {
      toast.error("Failed to set default")
    } finally {
      setBusyId(null)
    }
  }

  async function move(method: AdminPaymentMethod, direction: -1 | 1) {
    const ordered = [...methods].sort((a, b) => a.sortOrder - b.sortOrder)
    const index = ordered.findIndex((m) => m.id === method.id)
    const swapWith = ordered[index + direction]
    if (!swapWith) return

    setBusyId(method.id)
    try {
      await Promise.all([
        fetch(`/api/settings/payment-methods/${method.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: swapWith.sortOrder }),
        }),
        fetch(`/api/settings/payment-methods/${swapWith.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: method.sortOrder }),
        }),
      ])
      await load()
    } catch {
      toast.error("Failed to reorder")
    } finally {
      setBusyId(null)
    }
  }

  async function remove(method: AdminPaymentMethod) {
    setBusyId(method.id)
    try {
      const res = await fetch(`/api/settings/payment-methods/${method.id}`, { method: "DELETE" })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        toast.error(detail?.error ?? "Failed to delete payment method")
        return
      }
      if (selectedId === method.id) setSelectedId(null)
      await load()
      toast.success("Payment method deleted")
    } catch {
      toast.error("Failed to delete payment method")
    } finally {
      setBusyId(null)
    }
  }

  const ordered = [...methods].sort((a, b) => a.sortOrder - b.sortOrder)
  const atCap = methods.length >= MAX_PAYMENT_METHODS

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <Link href="/app/settings">
          <Button variant="ghost" size="sm" aria-label="Back to settings">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold">Payment Methods</h1>
          <p className="text-sm text-muted-foreground">
            Bank and company details for invoice PDFs and outgoing invoice/reminder emails. The default
            is used whenever a specific method isn&apos;t chosen. Setup here is admin/manager only —
            anyone can pick a method when generating an invoice or sending an email.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[300px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Methods</CardTitle>
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={atCap}
                  title={atCap ? `Maximum of ${MAX_PAYMENT_METHODS} methods reached` : undefined}
                  onClick={() => setAddOpen(true)}
                >
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              )}
            </div>
            {atCap && (
              <CardDescription className="text-xs">
                Maximum of {MAX_PAYMENT_METHODS} methods reached.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : ordered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No payment methods yet.</p>
            ) : (
              <ul className="space-y-1">
                {ordered.map((method, index) => (
                  <li
                    key={method.id}
                    className={`flex flex-col gap-1 rounded-md px-2 py-1.5 cursor-pointer ${
                      method.id === selectedId ? "bg-secondary" : "hover:bg-secondary/50"
                    }`}
                    onClick={() => setSelectedId(method.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`flex items-center gap-1.5 ${method.enabled ? "" : "text-muted-foreground line-through"}`}>
                        {method.name}
                        {method.isDefault && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Default
                          </Badge>
                        )}
                      </span>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          disabled={busyId === method.id || index === 0}
                          onClick={() => move(method, -1)}
                          aria-label={`Move ${method.name} up`}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          disabled={busyId === method.id || index === ordered.length - 1}
                          onClick={() => move(method, 1)}
                          aria-label={`Move ${method.name} down`}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          disabled={busyId === method.id || method.isDefault}
                          title="Set as default"
                          onClick={() => makeDefault(method)}
                          aria-label={`Set ${method.name} as default`}
                        >
                          <Star className={`h-3.5 w-3.5 ${method.isDefault ? "fill-current" : ""}`} />
                        </Button>
                        <Switch
                          checked={method.enabled}
                          disabled={busyId === method.id || method.isDefault}
                          title={method.isDefault ? "The default method can't be disabled" : undefined}
                          onCheckedChange={() => toggleEnabled(method)}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-destructive"
                          disabled={busyId === method.id || method.isDefault}
                          title={method.isDefault ? "The default method can't be deleted" : undefined}
                          onClick={() => remove(method)}
                          aria-label={`Delete ${method.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {selected ? (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{selected.name}</CardTitle>
                {selected.isDefault && <Badge variant="secondary">Default</Badge>}
              </div>
              <CardDescription>
                Blank fields are simply omitted from the PDF and email — there is no shared fallback
                between methods.
              </CardDescription>
              {canEdit && (
                <div className="pt-1">
                  <Label htmlFor="payment-method-name" className="text-xs text-muted-foreground">
                    Name
                  </Label>
                  <Input
                    id="payment-method-name"
                    className="mt-1 max-w-sm"
                    defaultValue={selected.name}
                    onBlur={async (event) => {
                      const next = event.target.value.trim()
                      if (!next || next === selected.name) return
                      const res = await fetch(`/api/settings/payment-methods/${selected.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: next }),
                      })
                      if (!res.ok) {
                        toast.error("Failed to rename")
                        return
                      }
                      await load()
                    }}
                  />
                </div>
              )}
            </CardHeader>
            <CardContent>
              <PaymentMethodEditor
                method={selected}
                canEdit={canEdit}
                onUpdated={(updated) => setMethods((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))}
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Select a payment method to edit it.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add payment method</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-method-name">Name</Label>
              <Input
                id="new-method-name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="e.g. Standard Bank ZAR"
                maxLength={120}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>
              Cancel
            </Button>
            <Button onClick={() => void create()} disabled={!addName.trim() || adding}>
              {adding ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
