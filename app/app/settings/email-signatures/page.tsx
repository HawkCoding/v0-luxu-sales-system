"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmailSignatureSettingsEditor } from "@/components/email-signature-settings-editor"
import { SignatureBrandEditor, type AdminSignatureBrand } from "@/components/signature-brand-editor"
import { useRole } from "@/lib/role-context"
import { useEmailSignatureSettings } from "@/lib/use-data"
import { MAX_SIGNATURE_BRANDS } from "@/lib/email/signature-brands"

interface BrandsResponse {
  brands: AdminSignatureBrand[]
  enabled: boolean
}

export default function EmailSignaturesPage() {
  const { can } = useRole()
  const canEdit = can("edit:settings")
  const { data: defaults } = useEmailSignatureSettings()

  const [brands, setBrands] = useState<AdminSignatureBrand[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState("")
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/settings/signature-brands")
      if (!res.ok) {
        toast.error("Failed to load signature brands")
        return
      }
      const data = (await res.json()) as BrandsResponse
      setBrands(data.brands)
      setSelectedId((current) => current ?? data.brands[0]?.id ?? null)
    } catch {
      toast.error("Failed to load signature brands")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const selected = brands.find((b) => b.id === selectedId) ?? null

  async function create() {
    if (!addName.trim()) return
    setAdding(true)
    try {
      const res = await fetch("/api/settings/signature-brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addName.trim() }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        toast.error(detail?.error ?? "Failed to add signature brand")
        return
      }
      setAddOpen(false)
      setAddName("")
      await load()
      toast.success("Signature brand added")
    } catch {
      toast.error("Failed to add signature brand")
    } finally {
      setAdding(false)
    }
  }

  async function toggleEnabled(brand: AdminSignatureBrand) {
    setBusyId(brand.id)
    try {
      const res = await fetch(`/api/settings/signature-brands/${brand.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !brand.enabled }),
      })
      if (!res.ok) {
        toast.error("Failed to update signature brand")
        return
      }
      await load()
    } catch {
      toast.error("Failed to update signature brand")
    } finally {
      setBusyId(null)
    }
  }

  async function move(brand: AdminSignatureBrand, direction: -1 | 1) {
    const ordered = [...brands].sort((a, b) => a.sortOrder - b.sortOrder)
    const index = ordered.findIndex((b) => b.id === brand.id)
    const swapWith = ordered[index + direction]
    if (!swapWith) return

    setBusyId(brand.id)
    try {
      await Promise.all([
        fetch(`/api/settings/signature-brands/${brand.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: swapWith.sortOrder }),
        }),
        fetch(`/api/settings/signature-brands/${swapWith.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: brand.sortOrder }),
        }),
      ])
      await load()
    } catch {
      toast.error("Failed to reorder")
    } finally {
      setBusyId(null)
    }
  }

  async function remove(brand: AdminSignatureBrand) {
    setBusyId(brand.id)
    try {
      const res = await fetch(`/api/settings/signature-brands/${brand.id}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error("Failed to delete signature brand")
        return
      }
      if (selectedId === brand.id) setSelectedId(null)
      await load()
      toast.success("Signature brand deleted")
    } catch {
      toast.error("Failed to delete signature brand")
    } finally {
      setBusyId(null)
    }
  }

  const ordered = [...brands].sort((a, b) => a.sortOrder - b.sortOrder)
  const atCap = brands.length >= MAX_SIGNATURE_BRANDS

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <Link href="/app/settings">
          <Button variant="ghost" size="sm" aria-label="Back to settings">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold">Email Signatures</h1>
          <p className="text-sm text-muted-foreground">
            Division brand templates for the outgoing-email signature, and the copy every brand
            shares by default. Any salesperson can pick which brand to send with — setup here is
            admin/manager only.
          </p>
        </div>
      </div>

      <Tabs defaultValue="brands">
        <TabsList>
          <TabsTrigger value="brands">Brand templates</TabsTrigger>
          <TabsTrigger value="defaults">Shared defaults</TabsTrigger>
        </TabsList>

        <TabsContent value="brands" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-[280px_minmax(0,1fr)]">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Brands</CardTitle>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={atCap}
                      title={atCap ? `Maximum of ${MAX_SIGNATURE_BRANDS} brands reached` : undefined}
                      onClick={() => setAddOpen(true)}
                    >
                      <Plus className="w-4 h-4 mr-1" /> Add
                    </Button>
                  )}
                </div>
                {atCap && (
                  <CardDescription className="text-xs">
                    Maximum of {MAX_SIGNATURE_BRANDS} brands reached.
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                  </div>
                ) : ordered.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No signature brands yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {ordered.map((brand, index) => (
                      <li
                        key={brand.id}
                        className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 cursor-pointer ${
                          brand.id === selectedId ? "bg-secondary" : "hover:bg-secondary/50"
                        }`}
                        onClick={() => setSelectedId(brand.id)}
                      >
                        <span className={brand.enabled ? "" : "text-muted-foreground line-through"}>
                          {brand.name}
                        </span>
                        {canEdit && (
                          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              disabled={busyId === brand.id || index === 0}
                              onClick={() => move(brand, -1)}
                              aria-label={`Move ${brand.name} up`}
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              disabled={busyId === brand.id || index === ordered.length - 1}
                              onClick={() => move(brand, 1)}
                              aria-label={`Move ${brand.name} down`}
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <Switch
                              checked={brand.enabled}
                              disabled={busyId === brand.id}
                              onCheckedChange={() => toggleEnabled(brand)}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-destructive"
                              disabled={busyId === brand.id}
                              onClick={() => remove(brand)}
                              aria-label={`Delete ${brand.name}`}
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
                  <CardTitle className="text-base">{selected.name}</CardTitle>
                  <CardDescription>
                    Layout is fixed and shared by every brand — only the banner, badges and copy
                    below differ.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SignatureBrandEditor
                    brand={selected}
                    defaults={defaults}
                    canEdit={canEdit}
                    onUpdated={(updated) =>
                      setBrands((prev) => prev.map((b) => (b.id === updated.id ? updated : b)))
                    }
                  />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Select a brand to edit it.
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="defaults">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Shared defaults</CardTitle>
              <CardDescription>
                Copy every brand inherits unless it sets its own override. Also the master switch
                for whether any signature is appended at all.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EmailSignatureSettingsEditor canEdit={canEdit} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add signature brand</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-brand-name">Name</Label>
              <Input
                id="new-brand-name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="e.g. Arnelia House"
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
