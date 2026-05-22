"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Plus, ToggleLeft, ToggleRight } from "lucide-react"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useRole } from "@/lib/role-context"

interface OutcomeReason {
  id: string
  label: string
  appliesTo: "Lost" | "Cancelled" | "Both"
  active: boolean
  createdAt: string
}

type AppliesTo = "Lost" | "Cancelled" | "Both"

export default function OutcomeReasonsPage() {
  const { role } = useRole()
  const isManager = role === "manager" || role === "admin"

  const [reasons, setReasons] = useState<OutcomeReason[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addLabel, setAddLabel] = useState("")
  const [addAppliesTo, setAddAppliesTo] = useState<AppliesTo>("Lost")
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/settings/outcome-reasons")
      if (!res.ok) {
        toast.error("Failed to load outcome reasons")
        return
      }
      const data = (await res.json()) as OutcomeReason[]
      setReasons(data)
    } catch {
      toast.error("Failed to load outcome reasons")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const toggle = async (reason: OutcomeReason) => {
    setToggling(reason.id)
    try {
      const res = await fetch(`/api/settings/outcome-reasons/${reason.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !reason.active }),
      })
      if (!res.ok) {
        toast.error("Failed to update reason")
        return
      }
      await load()
      toast.success(reason.active ? "Reason deactivated" : "Reason activated")
    } catch {
      toast.error("Failed to update reason")
    } finally {
      setToggling(null)
    }
  }

  const addReason = async () => {
    if (!addLabel.trim()) return
    setAdding(true)
    try {
      const res = await fetch("/api/settings/outcome-reasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: addLabel.trim(), appliesTo: addAppliesTo }),
      })
      if (!res.ok) {
        toast.error("Failed to add reason")
        return
      }
      setAddOpen(false)
      setAddLabel("")
      setAddAppliesTo("Lost")
      await load()
      toast.success("Outcome reason added")
    } catch {
      toast.error("Failed to add reason")
    } finally {
      setAdding(false)
    }
  }

  const grouped: Record<AppliesTo, OutcomeReason[]> = {
    Lost: reasons.filter((r) => r.appliesTo === "Lost" || r.appliesTo === "Both"),
    Cancelled: reasons.filter((r) => r.appliesTo === "Cancelled" || r.appliesTo === "Both"),
    Both: reasons.filter((r) => r.appliesTo === "Both"),
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/app/settings">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold">Outcome Reasons</h1>
          <p className="text-sm text-muted-foreground">
            Manage the selectable reasons for Lost and Cancelled outcomes.
          </p>
        </div>
      </div>

      {(["Lost", "Cancelled"] as AppliesTo[]).map((category) => (
        <Card key={category}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">{category} Reasons</CardTitle>
                <CardDescription>Shown when outcome is set to {category}</CardDescription>
              </div>
              {isManager && (
                <Button size="sm" variant="outline" onClick={() => { setAddAppliesTo(category); setAddOpen(true) }}>
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
            ) : grouped[category].length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No reasons configured.</p>
            ) : (
              <ul className="space-y-2">
                {grouped[category].map((reason) => (
                  <li key={reason.id} className="flex items-center justify-between gap-3 py-1">
                    <div className="flex items-center gap-2">
                      <span className={reason.active ? "text-foreground" : "text-muted-foreground line-through"}>
                        {reason.label}
                      </span>
                      {!reason.active && (
                        <Badge variant="secondary" className="text-xs">Inactive</Badge>
                      )}
                      {reason.appliesTo === "Both" && (
                        <Badge variant="outline" className="text-xs">Both</Badge>
                      )}
                    </div>
                    {isManager && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={toggling === reason.id}
                        onClick={() => void toggle(reason)}
                        aria-label={reason.active ? `Deactivate ${reason.label}` : `Activate ${reason.label}`}
                      >
                        {toggling === reason.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : reason.active ? (
                          <ToggleRight className="w-4 h-4 text-green-600" />
                        ) : (
                          <ToggleLeft className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className="sr-only">{reason.active ? "Deactivate" : "Activate"}</span>
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Outcome Reason</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="add-label">Label</Label>
              <Input
                id="add-label"
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
                placeholder="e.g. Budget constraints"
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-applies-to">Applies to</Label>
              <Select value={addAppliesTo} onValueChange={(v) => setAddAppliesTo(v as AppliesTo)}>
                <SelectTrigger id="add-applies-to">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Lost">Lost</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                  <SelectItem value="Both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>
              Cancel
            </Button>
            <Button onClick={() => void addReason()} disabled={!addLabel.trim() || adding}>
              {adding ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
