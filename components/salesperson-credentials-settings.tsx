"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, Loader2, MailCheck, Plus, Settings2, Trash2, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Credential {
  id: string
  profile_id: string
  email_address: string
  smtp_host: string
  smtp_port: number
  smtp_encryption: string
  imap_host: string
  imap_port: number
  imap_encryption: string
  imap_sent_folder: string
  created_at: string
  updated_at: string
}

interface AppUser {
  userId: string
  name: string
  email: string
}

interface CredentialForm {
  profile_id: string
  email_address: string
  smtp_host: string
  smtp_port: string
  smtp_encryption: string
  imap_host: string
  imap_port: string
  imap_encryption: string
  imap_sent_folder: string
  password: string
}

const EMPTY_FORM: CredentialForm = {
  profile_id: "",
  email_address: "",
  smtp_host: "mail.sa-rail.co.za",
  smtp_port: "465",
  smtp_encryption: "ssl",
  imap_host: "mail.sa-rail.co.za",
  imap_port: "993",
  imap_encryption: "ssl",
  imap_sent_folder: "Sent",
  password: "",
}

interface TestResult {
  smtp: "ok" | "error" | null
  imap: "ok" | "error" | null
  smtpError?: string
  imapError?: string
}

export function SalespersonCredentialsSettings() {
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editTarget, setEditTarget] = useState<Credential | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState<CredentialForm>(EMPTY_FORM)
  const [formError, setFormError] = useState("")
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Credential | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [credRes, userRes] = await Promise.all([
        fetch("/api/settings/salesperson-credentials"),
        fetch("/api/users"),
      ])
      if (!credRes.ok) throw new Error("Failed to load credentials")
      const credData = (await credRes.json()) as { credentials: Credential[] }
      setCredentials(credData.credentials ?? [])

      if (userRes.ok) {
        const userData = (await userRes.json()) as { users: AppUser[] }
        setUsers(userData.users ?? [])
      }
    } catch {
      setError("Failed to load salesperson mailboxes")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  function openAdd() {
    setForm(EMPTY_FORM)
    setFormError("")
    setEditTarget(null)
    setAddOpen(true)
  }

  function openEdit(cred: Credential) {
    setForm({
      profile_id: cred.profile_id,
      email_address: cred.email_address,
      smtp_host: cred.smtp_host,
      smtp_port: String(cred.smtp_port),
      smtp_encryption: cred.smtp_encryption,
      imap_host: cred.imap_host,
      imap_port: String(cred.imap_port),
      imap_encryption: cred.imap_encryption,
      imap_sent_folder: cred.imap_sent_folder,
      password: "",
    })
    setFormError("")
    setEditTarget(cred)
    setAddOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError("")
    if (!form.profile_id) { setFormError("Select a user"); return }
    if (!form.email_address) { setFormError("Email address is required"); return }

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        profile_id: form.profile_id,
        email_address: form.email_address,
        smtp_host: form.smtp_host,
        smtp_port: Number(form.smtp_port),
        smtp_encryption: form.smtp_encryption,
        imap_host: form.imap_host,
        imap_port: Number(form.imap_port),
        imap_encryption: form.imap_encryption,
        imap_sent_folder: form.imap_sent_folder,
      }
      if (form.password) body.password = form.password

      const url = editTarget
        ? `/api/settings/salesperson-credentials/${editTarget.id}`
        : "/api/settings/salesperson-credentials"
      const method = editTarget ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setFormError(data.error ?? "Failed to save")
        return
      }
      toast.success(editTarget ? "Mailbox updated" : "Mailbox added")
      setAddOpen(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/settings/salesperson-credentials/${deleteTarget.id}`, {
        method: "DELETE",
      })
      if (!res.ok) { toast.error("Failed to delete mailbox"); return }
      toast.success("Mailbox removed")
      setDeleteTarget(null)
      await load()
    } finally {
      setDeleting(false)
    }
  }

  const handleTest = async (id: string) => {
    setTestingId(id)
    setTestResults((prev) => ({ ...prev, [id]: { smtp: null, imap: null } }))
    try {
      const res = await fetch("/api/settings/salesperson-credentials/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const data = (await res.json()) as TestResult & { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? "Test failed")
        return
      }
      setTestResults((prev) => ({ ...prev, [id]: data }))
    } catch {
      toast.error("Connection test failed")
    } finally {
      setTestingId(null)
    }
  }

  const userOptions = users.filter((u) => u.email)

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-medium">Salesperson Mailboxes</CardTitle>
              <CardDescription className="text-xs mt-1">
                Per-salesperson SMTP/IMAP credentials for outbound email on{" "}
                <span className="font-mono">mail.sa-rail.co.za</span>. Passwords are encrypted at
                rest and never returned to the browser.
              </CardDescription>
            </div>
            <Button size="sm" className="gap-1.5" onClick={openAdd}>
              <Plus className="h-4 w-4" />
              Add mailbox
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!loading && !error && credentials.length === 0 && (
            <p className="text-sm text-muted-foreground">No mailboxes configured.</p>
          )}
          {!loading && !error && credentials.length > 0 && (
            <ul className="space-y-2">
              {credentials.map((cred) => {
                const result = testResults[cred.id]
                const isTesting = testingId === cred.id
                const linkedUser = users.find((u) => u.userId === cred.profile_id)
                return (
                  <li
                    key={cred.id}
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{cred.email_address}</p>
                      {linkedUser && (
                        <p className="text-xs text-muted-foreground">{linkedUser.name || linkedUser.email}</p>
                      )}
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-xs font-mono">
                          SMTP {cred.smtp_host}:{cred.smtp_port}
                        </Badge>
                        {result && (
                          <>
                            <ConnectionBadge label="SMTP" status={result.smtp} error={result.smtpError} />
                            <ConnectionBadge label="IMAP" status={result.imap} error={result.imapError} />
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => handleTest(cred.id)}
                        disabled={isTesting}
                        aria-label="Test connection"
                      >
                        {isTesting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <MailCheck className="h-3.5 w-3.5" />
                        )}
                        Test
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(cred)}
                        aria-label="Edit mailbox"
                      >
                        <Settings2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteTarget(cred)}
                        aria-label="Delete mailbox"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit mailbox" : "Add mailbox"}</DialogTitle>
            <DialogDescription>
              {editTarget
                ? "Update the SMTP/IMAP settings. Leave password blank to keep the existing password."
                : "Configure the salesperson's outbound SMTP and IMAP Sent-folder settings."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sc-user">Salesperson</Label>
              <Select
                value={form.profile_id}
                onValueChange={(v) => setForm((p) => ({ ...p, profile_id: v }))}
                disabled={!!editTarget}
              >
                <SelectTrigger id="sc-user" className="w-full">
                  <SelectValue placeholder="Select salesperson" />
                </SelectTrigger>
                <SelectContent>
                  {userOptions.map((u) => (
                    <SelectItem key={u.userId} value={u.userId}>
                      {u.name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sc-email">Salesperson email address</Label>
              <Input
                id="sc-email"
                type="email"
                value={form.email_address}
                onChange={(e) => setForm((p) => ({ ...p, email_address: e.target.value }))}
                placeholder="reservations@sa-rail.co.za"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="sc-smtp-host">SMTP host</Label>
                <Input
                  id="sc-smtp-host"
                  value={form.smtp_host}
                  onChange={(e) => setForm((p) => ({ ...p, smtp_host: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sc-smtp-port">Port</Label>
                <Input
                  id="sc-smtp-port"
                  type="number"
                  value={form.smtp_port}
                  onChange={(e) => setForm((p) => ({ ...p, smtp_port: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sc-smtp-enc">SMTP encryption</Label>
              <Select
                value={form.smtp_encryption}
                onValueChange={(v) => setForm((p) => ({ ...p, smtp_encryption: v }))}
              >
                <SelectTrigger id="sc-smtp-enc" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ssl">SSL/TLS (recommended)</SelectItem>
                  <SelectItem value="starttls">STARTTLS</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="sc-imap-host">IMAP host</Label>
                <Input
                  id="sc-imap-host"
                  value={form.imap_host}
                  onChange={(e) => setForm((p) => ({ ...p, imap_host: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sc-imap-port">Port</Label>
                <Input
                  id="sc-imap-port"
                  type="number"
                  value={form.imap_port}
                  onChange={(e) => setForm((p) => ({ ...p, imap_port: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="sc-imap-enc">IMAP encryption</Label>
                <Select
                  value={form.imap_encryption}
                  onValueChange={(v) => setForm((p) => ({ ...p, imap_encryption: v }))}
                >
                  <SelectTrigger id="sc-imap-enc" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ssl">SSL/TLS</SelectItem>
                    <SelectItem value="starttls">STARTTLS</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sc-imap-sent">Sent folder</Label>
                <Input
                  id="sc-imap-sent"
                  value={form.imap_sent_folder}
                  onChange={(e) => setForm((p) => ({ ...p, imap_sent_folder: e.target.value }))}
                  placeholder="Sent"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sc-password">
                {editTarget ? "New password (leave blank to keep existing)" : "Password"}
              </Label>
              <Input
                id="sc-password"
                type="password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                placeholder={editTarget ? "••••••••" : "SMTP/IMAP password"}
                autoComplete="new-password"
              />
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editTarget ? "Save changes" : "Add mailbox"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove mailbox?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the mailbox configuration for{" "}
              <span className="font-semibold">{deleteTarget?.email_address}</span>. Outbound emails
              for this salesperson will stop working until a new mailbox is configured.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function ConnectionBadge({
  label,
  status,
  error,
}: {
  label: string
  status: "ok" | "error" | null
  error?: string
}) {
  if (status === null) return null
  return (
    <Badge
      variant={status === "ok" ? "default" : "destructive"}
      className="gap-1 text-xs"
      title={status === "error" && error ? error : undefined}
    >
      {status === "ok" ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <XCircle className="h-3 w-3" />
      )}
      {label}
    </Badge>
  )
}
