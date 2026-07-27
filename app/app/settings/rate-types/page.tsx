"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Archive, ArchiveRestore, Check, Loader2, Pencil, Plus, X } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SUPPLIER_KIND_LABELS, type RateType, type SupplierKind, type SupplierKindDefaultRateType } from "@/lib/types"

const SUPPLIER_KINDS = Object.keys(SUPPLIER_KIND_LABELS) as SupplierKind[]

interface RateTypesResponse {
  rateTypes: RateType[]
  canEdit: boolean
}

function SupplierDefaultRatesCard({
  rateTypes,
  canEdit,
}: {
  rateTypes: RateType[]
  canEdit: boolean
}) {
  const [defaults, setDefaults] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/rate-types/supplier-defaults")
      .then((r) => r.json())
      .then((d: { defaults?: SupplierKindDefaultRateType[] }) => {
        if (cancelled) return
        const map: Record<string, string> = {}
        for (const entry of d.defaults ?? []) map[entry.kind] = entry.rateTypeId
        setDefaults(map)
      })
      .catch(() => toast.error("Failed to load default rates"))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const globalDefault = rateTypes.find((rt) => rt.isDefault)

  const save = async () => {
    const payload = SUPPLIER_KINDS.filter((kind) => defaults[kind]).map((kind) => ({
      kind,
      rateTypeId: defaults[kind],
    }))
    if (payload.length === 0) return
    setSaving(true)
    try {
      const res = await fetch("/api/rate-types/supplier-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaults: payload }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        toast.error(detail?.error ?? "Failed to save default rates")
        return
      }
      toast.success("Default rates saved")
    } catch {
      toast.error("Failed to save default rates")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Default rate per supplier type</CardTitle>
        <CardDescription>
          The rate a new supplier (and its rate matrix) starts on. Unset types fall back to the
          global default{globalDefault ? ` (${globalDefault.name})` : ""}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-3">
            {SUPPLIER_KINDS.map((kind) => (
              <div key={kind} className="flex items-center justify-between gap-3">
                <Label className="text-sm">{SUPPLIER_KIND_LABELS[kind]}</Label>
                <Select
                  value={defaults[kind] ?? ""}
                  onValueChange={(value) => setDefaults((prev) => ({ ...prev, [kind]: value }))}
                  disabled={!canEdit}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Global default" />
                  </SelectTrigger>
                  <SelectContent>
                    {rateTypes.map((rt) => (
                      <SelectItem key={rt.id} value={rt.id}>
                        {rt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            {canEdit && (
              <Button size="sm" onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                Save
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function RateTypesPage() {
  const [rateTypes, setRateTypes] = useState<RateType[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addCode, setAddCode] = useState("")
  const [addName, setAddName] = useState("")
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/rate-types")
      if (!res.ok) {
        toast.error("Failed to load rate types")
        return
      }
      const data = (await res.json()) as RateTypesResponse
      setRateTypes(data.rateTypes)
      setCanEdit(data.canEdit)
    } catch {
      toast.error("Failed to load rate types")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const patch = async (id: string, body: Record<string, unknown>, successLabel: string) => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/rate-types/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        toast.error(detail?.error ?? "Failed to update rate type")
        return
      }
      await load()
      toast.success(successLabel)
    } catch {
      toast.error("Failed to update rate type")
    } finally {
      setBusyId(null)
    }
  }

  const startEdit = (rt: RateType) => {
    setEditingId(rt.id)
    setEditName(rt.name)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName("")
  }

  const saveEdit = async (id: string) => {
    const trimmed = editName.trim()
    if (!trimmed) return
    await patch(id, { name: trimmed }, "Rate type renamed")
    setEditingId(null)
    setEditName("")
  }

  const create = async () => {
    if (!addCode.trim() || !addName.trim()) return
    setAdding(true)
    try {
      const res = await fetch("/api/rate-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: addCode.trim().toUpperCase(), name: addName.trim() }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        toast.error(detail?.error ?? "Failed to add rate type")
        return
      }
      setAddOpen(false)
      setAddCode("")
      setAddName("")
      await load()
      toast.success("Rate type added")
    } catch {
      toast.error("Failed to add rate type")
    } finally {
      setAdding(false)
    }
  }

  const active = rateTypes.filter((rt) => !rt.archivedAt)
  const archived = rateTypes.filter((rt) => rt.archivedAt)

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/app/settings">
          <Button variant="ghost" size="sm" aria-label="Back to settings">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold">Rate Types</h1>
          <p className="text-sm text-muted-foreground">
            Configure the rate types (e.g. RAC, STO, NETT, Resident) shown as tabs on supplier rate cards.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Active</CardTitle>
              <CardDescription>The default rate type is used when a quote line does not pick one.</CardDescription>
            </div>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : active.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No rate types yet.</p>
          ) : (
            <ul className="space-y-2">
              {active.map((rt) => (
                <li key={rt.id} className="flex items-center justify-between gap-3 py-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground shrink-0">
                      {rt.code}
                    </span>
                    {editingId === rt.id ? (
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void saveEdit(rt.id)
                          if (e.key === "Escape") cancelEdit()
                        }}
                        maxLength={100}
                        className="h-8 w-48"
                        autoFocus
                      />
                    ) : (
                      <span className="text-foreground truncate">{rt.name}</span>
                    )}
                    {rt.isStandard && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        Standard
                      </Badge>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0">
                      {editingId === rt.id ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyId === rt.id || !editName.trim()}
                            onClick={() => void saveEdit(rt.id)}
                            aria-label={`Save name for ${rt.name}`}
                          >
                            {busyId === rt.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyId === rt.id}
                            onClick={cancelEdit}
                            aria-label="Cancel rename"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyId === rt.id}
                            onClick={() => startEdit(rt)}
                            aria-label={`Rename ${rt.name}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          {!rt.isDefault && !rt.isStandard && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busyId === rt.id}
                              onClick={() => void patch(rt.id, { archived: true }, "Rate type archived")}
                              aria-label={`Archive ${rt.name}`}
                            >
                              {busyId === rt.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Archive className="w-4 h-4" />
                              )}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <SupplierDefaultRatesCard rateTypes={active} canEdit={canEdit} />

      {archived.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Archived</CardTitle>
            <CardDescription>
              Historical quote lines still render archived rate types from their snapshot.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {archived.map((rt) => (
                <li key={rt.id} className="flex items-center justify-between gap-3 py-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-secondary/50 text-muted-foreground line-through shrink-0">
                      {rt.code}
                    </span>
                    {editingId === rt.id ? (
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void saveEdit(rt.id)
                          if (e.key === "Escape") cancelEdit()
                        }}
                        maxLength={100}
                        className="h-8 w-48"
                        autoFocus
                      />
                    ) : (
                      <span className="text-muted-foreground line-through truncate">{rt.name}</span>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0">
                      {editingId === rt.id ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyId === rt.id || !editName.trim()}
                            onClick={() => void saveEdit(rt.id)}
                            aria-label={`Save name for ${rt.name}`}
                          >
                            {busyId === rt.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyId === rt.id}
                            onClick={cancelEdit}
                            aria-label="Cancel rename"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyId === rt.id}
                            onClick={() => startEdit(rt)}
                            aria-label={`Rename ${rt.name}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyId === rt.id}
                            onClick={() => void patch(rt.id, { archived: false }, "Rate type restored")}
                            aria-label={`Restore ${rt.name}`}
                          >
                            {busyId === rt.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <ArchiveRestore className="w-4 h-4" />
                            )}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Rate Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="rt-code">Code</Label>
              <Input
                id="rt-code"
                value={addCode}
                onChange={(e) => setAddCode(e.target.value.toUpperCase())}
                placeholder="e.g. TRADE"
                maxLength={32}
              />
              <p className="text-xs text-muted-foreground">Uppercase letters, digits, or underscores.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rt-name">Display name</Label>
              <Input
                id="rt-name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="e.g. Trade Rate"
                maxLength={100}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>
              Cancel
            </Button>
            <Button onClick={() => void create()} disabled={!addCode.trim() || !addName.trim() || adding}>
              {adding ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
