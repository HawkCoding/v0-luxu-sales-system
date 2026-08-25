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
import type { RateType } from "@/lib/types"

const AUDIENCE_LABELS: Record<"international" | "resident", string> = {
  international: "International",
  resident: "Resident",
}

interface RateTypesResponse {
  rateTypes: RateType[]
  canEdit: boolean
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
  const [editAudience, setEditAudience] = useState<"any" | "international" | "resident">("any")
  const [editClientLabel, setEditClientLabel] = useState("")

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
    setEditAudience(rt.audience ?? "any")
    setEditClientLabel(rt.clientLabel ?? "")
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName("")
    setEditAudience("any")
    setEditClientLabel("")
  }

  const saveEdit = async (id: string) => {
    const trimmed = editName.trim()
    if (!trimmed) return
    await patch(
      id,
      {
        name: trimmed,
        audience: editAudience === "any" ? null : editAudience,
        clientLabel: editClientLabel.trim() || null,
      },
      "Rate type updated",
    )
    setEditingId(null)
    setEditName("")
    setEditAudience("any")
    setEditClientLabel("")
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
              <CardDescription>
                The default rate type is the last fallback, used when neither the quote line nor
                the supplier names a rate. Each supplier picks its own base and quoted rate.
              </CardDescription>
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
                <li
                  key={rt.id}
                  className={editingId === rt.id ? "flex flex-col gap-2 py-1.5" : "flex items-center justify-between gap-3 py-1"}
                >
                  <div className="flex items-center justify-between gap-3">
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
                      {editingId !== rt.id && rt.audience && (
                        <Badge variant="outline" className="text-xs shrink-0">
                          {AUDIENCE_LABELS[rt.audience]}
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
                              aria-label={`Save ${rt.name}`}
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
                              aria-label="Cancel edit"
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
                              aria-label={`Edit ${rt.name}`}
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
                  </div>
                  {editingId === rt.id && (
                    <div className="flex items-center gap-2 pl-9">
                      <div className="space-y-1">
                        <Label htmlFor={`rt-audience-${rt.id}`} className="text-xs text-muted-foreground">
                          Audience
                        </Label>
                        <Select
                          value={editAudience}
                          onValueChange={(value) => setEditAudience(value as typeof editAudience)}
                        >
                          <SelectTrigger id={`rt-audience-${rt.id}`} className="h-8 w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">Any</SelectItem>
                            <SelectItem value="international">International</SelectItem>
                            <SelectItem value="resident">Resident</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1 flex-1">
                        <Label htmlFor={`rt-client-label-${rt.id}`} className="text-xs text-muted-foreground">
                          Client-facing name
                        </Label>
                        <Input
                          id={`rt-client-label-${rt.id}`}
                          value={editClientLabel}
                          onChange={(e) => setEditClientLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveEdit(rt.id)
                            if (e.key === "Escape") cancelEdit()
                          }}
                          placeholder={rt.name}
                          maxLength={100}
                          className="h-8"
                        />
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

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
