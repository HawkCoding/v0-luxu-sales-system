"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useRole } from "@/lib/role-context"
import { useAuth } from "@/lib/auth-context"
import type { BookingNote } from "@/lib/types"
import { formatDisplayDateTime } from "@/lib/date-format"
import { AlertCircle, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"

interface JobInternalNotesTabProps {
  bookingId: string
  notes: BookingNote[]
  loading?: boolean
  error?: Error | null
  onChange?: () => Promise<void> | void
}

export function JobInternalNotesTab({
  bookingId,
  notes,
  loading = false,
  error = null,
  onChange,
}: JobInternalNotesTabProps) {
  const { can } = useRole()
  const { user } = useAuth()
  const canCreate = can("create:notes")
  const canManageAny = can("manage:notes")
  const [draft, setDraft] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState("")
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!draft.trim()) {
      toast.error("Note cannot be empty")
      return
    }
    setSubmitting(true)
    try {
      const response = await fetch(`/api/bookings/${bookingId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        toast.error(typeof payload?.error === "string" ? payload.error : "Could not save note")
        return
      }
      setDraft("")
      await onChange?.()
    } finally {
      setSubmitting(false)
    }
  }

  const startEdit = (note: BookingNote) => {
    setEditingId(note.id)
    setEditingBody(note.body)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingBody("")
  }

  const saveEdit = async (id: string) => {
    if (!editingBody.trim()) {
      toast.error("Note cannot be empty")
      return
    }
    setSavingEdit(true)
    try {
      const response = await fetch(`/api/bookings/${bookingId}/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editingBody }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        toast.error(typeof payload?.error === "string" ? payload.error : "Could not update note")
        return
      }
      cancelEdit()
      await onChange?.()
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      const response = await fetch(`/api/bookings/${bookingId}/notes/${id}`, { method: "DELETE" })
      if (!response.ok && response.status !== 204) {
        const payload = await response.json().catch(() => null)
        toast.error(typeof payload?.error === "string" ? payload.error : "Could not delete note")
        return
      }
      toast.success("Note deleted")
      await onChange?.()
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-2">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="w-4 h-4" />
        <AlertTitle>Could not load notes</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>{error.message || "Something went wrong while loading notes."}</p>
          {onChange ? (
            <Button variant="outline" size="sm" onClick={() => void onChange()}>
              Retry
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-4">
      {canCreate ? (
        <Card>
          <CardContent className="p-4 space-y-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add an internal note..."
              rows={3}
              maxLength={5000}
              disabled={submitting}
            />
            <div className="flex justify-end">
              <Button onClick={handleCreate} disabled={submitting || !draft.trim()}>
                {submitting ? "Saving..." : "Add note"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {notes.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">No internal notes yet</div>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => {
            const isAuthor = user?.id === note.authorId
            const canEditThisNote = isAuthor || canManageAny
            const isEditing = editingId === note.id
            return (
              <Card key={note.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{note.authorName}</span>
                      <span> · {formatDisplayDateTime(note.createdAt)}</span>
                      {note.updatedAt !== note.createdAt ? <span> (edited)</span> : null}
                    </div>
                    {canEditThisNote && !isEditing ? (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(note)} aria-label="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleDelete(note.id)}
                          disabled={deletingId === note.id}
                          aria-label="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {isEditing ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editingBody}
                        onChange={(e) => setEditingBody(e.target.value)}
                        rows={3}
                        maxLength={5000}
                        disabled={savingEdit}
                      />
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={cancelEdit} disabled={savingEdit}>
                          Cancel
                        </Button>
                        <Button size="sm" onClick={() => void saveEdit(note.id)} disabled={savingEdit}>
                          {savingEdit ? "Saving..." : "Save"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap text-foreground">{note.body}</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
