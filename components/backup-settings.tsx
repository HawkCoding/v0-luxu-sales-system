"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, Database, Download, Loader2, Plus, Trash2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { BackupRecord } from "@/lib/types"

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

interface BackupRecordWithCreator extends BackupRecord {
  created_by_name?: string
}

export function BackupSettings({ isAdmin }: { isAdmin: boolean }) {
  const [backups, setBackups] = useState<BackupRecordWithCreator[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<BackupRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [restoreTarget, setRestoreTarget] = useState<BackupRecord | null>(null)
  const [restoring, setRestoring] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/backups")
      if (!res.ok) throw new Error("Failed to load backups")
      const data = (await res.json()) as { backups: BackupRecordWithCreator[] }
      setBackups(data.backups ?? [])
    } catch {
      setError("Failed to load backups")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const handleCreate = async () => {
    setCreating(true)
    try {
      const res = await fetch("/api/backups", { method: "POST" })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) { toast.error(data.error ?? "Backup failed"); return }
      toast.success("Backup created")
      await load()
    } catch {
      toast.error("Backup failed")
    } finally {
      setCreating(false)
    }
  }

  const handleDownload = async (backup: BackupRecord) => {
    try {
      const res = await fetch(`/api/backups/${backup.id}`)
      const data = (await res.json()) as { downloadUrl?: string; error?: string }
      if (!res.ok || !data.downloadUrl) {
        toast.error(data.error ?? "Failed to get download link")
        return
      }
      window.open(data.downloadUrl, "_blank", "noopener,noreferrer")
    } catch {
      toast.error("Failed to download backup")
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/backups/${deleteTarget.id}`, { method: "DELETE" })
      if (!res.ok) { toast.error("Failed to delete backup"); return }
      toast.success("Backup deleted")
      setDeleteTarget(null)
      await load()
    } finally {
      setDeleting(false)
    }
  }

  const handleRestore = async () => {
    if (!restoreTarget) return
    setRestoring(true)
    try {
      const res = await fetch("/api/backups/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupId: restoreTarget.id, confirm: true }),
      })
      const data = (await res.json()) as { warning?: string; error?: string }
      if (!res.ok) {
        toast.error(data.error ?? "Restore failed")
        return
      }
      toast.warning(data.warning ?? "Restore initiated — check the audit log for status")
      setRestoreTarget(null)
    } finally {
      setRestoring(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Database className="h-4 w-4" />
                Backup & Restore
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Daily snapshots are stored in a private Supabase Storage bucket and retained for 14
                days. Restore requires admin confirmation.
              </CardDescription>
            </div>
            <Button size="sm" className="gap-1.5" onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {creating ? "Creating..." : "Backup now"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && <p className="text-sm text-muted-foreground">Loading backups...</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!loading && !error && backups.length === 0 && (
            <p className="text-sm text-muted-foreground">No backups found. Create the first backup above.</p>
          )}
          {!loading && !error && backups.length > 0 && (
            <ul className="space-y-2">
              {backups.map((backup) => (
                <li
                  key={backup.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{formatDate(backup.created_at)}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {formatBytes(backup.size_bytes)}
                      </Badge>
                      {backup.retained_until && (
                        <span className="text-xs text-muted-foreground">
                          Expires {formatDate(backup.retained_until)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => handleDownload(backup)}
                      aria-label="Download backup"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </Button>
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
                        onClick={() => setRestoreTarget(backup)}
                        aria-label="Restore from backup"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Restore
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeleteTarget(backup)}
                      aria-label="Delete backup"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete backup?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the backup from{" "}
              <span className="font-semibold">
                {deleteTarget ? formatDate(deleteTarget.created_at) : ""}
              </span>
              . This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete backup"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!restoreTarget} onOpenChange={(open) => !open && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Restore from backup?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  You are about to restore from the backup created on{" "}
                  <span className="font-semibold">
                    {restoreTarget ? formatDate(restoreTarget.created_at) : ""}
                  </span>
                  .
                </p>
                <p className="font-semibold text-destructive">
                  Warning: the entire database will roll back to this snapshot. All changes made
                  after this backup was created will be permanently lost.
                </p>
                <p>
                  This action is audited and cannot be undone. Make sure this is the correct backup
                  before proceeding.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestore}
              disabled={restoring}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {restoring ? "Initiating restore..." : "Yes, restore this backup"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
