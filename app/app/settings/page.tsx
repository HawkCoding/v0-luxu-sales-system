"use client"

import Link from "next/link"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { RefreshCw, CheckCircle2, AlertCircle, Loader2, KeyRound, Upload } from "lucide-react"
import { useRole } from "@/lib/role-context"

// ---------------------------------------------------------------------------
// Sync result shape returned by the API
// ---------------------------------------------------------------------------
interface SyncCounts {
  locations: number
  suppliers: number
  packages: number
  routes: number
  suiteTypes: number
  rateCards: number
}

interface SyncResult {
  ok: boolean
  startedAt?: string
  completedAt?: string
  counts?: SyncCounts
  warnings?: string[]
  error?: string
}

// ---------------------------------------------------------------------------
// Supplier Sync card (only rendered when user can sync:suppliers)
// ---------------------------------------------------------------------------
function SupplierSyncCard() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)

  const runSync = async () => {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch("/api/suppliers/sync-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      const json = (await res.json()) as SyncResult
      setResult(json)
      if (json.ok && json.completedAt) {
        setLastSyncAt(json.completedAt)
      }
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : "Network error" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Supplier Data</CardTitle>
        <CardDescription className="text-xs">
          Pull the latest pricing and schedules from SA-Rail (Rovos Rail &amp; The Blue
          Train) into the supplier database.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">SA-Rail pricing sync</p>
            {lastSyncAt ? (
              <p className="text-xs text-muted-foreground">
                Last synced: {new Date(lastSyncAt).toLocaleString()}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Never synced in this session</p>
            )}
          </div>
          <Button
            size="sm"
            onClick={runSync}
            disabled={loading}
            className="gap-2 min-w-[140px]"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {loading ? "Syncing…" : "Sync pricing"}
          </Button>
        </div>

        {/* Result banner */}
        {result && (
          <div
            className={
              result.ok
                ? "rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950"
                : "rounded-md border border-destructive/30 bg-destructive/10 p-3"
            }
          >
            <div className="flex items-start gap-2">
              {result.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              )}
              <div className="space-y-1 text-xs">
                {result.ok ? (
                  <>
                    <p className="font-medium text-green-800 dark:text-green-300">
                      Sync completed successfully
                    </p>
                    {result.counts && (
                      <ul className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-green-700 dark:text-green-400 pt-0.5">
                        <li>Locations: <strong>{result.counts.locations}</strong></li>
                        <li>Suppliers: <strong>{result.counts.suppliers}</strong></li>
                        <li>Packages: <strong>{result.counts.packages}</strong></li>
                        <li>Routes: <strong>{result.counts.routes}</strong></li>
                        <li>Suite types: <strong>{result.counts.suiteTypes}</strong></li>
                        <li>Rate cards: <strong>{result.counts.rateCards}</strong></li>
                      </ul>
                    )}
                    {result.warnings && result.warnings.length > 0 && (
                      <div className="pt-1">
                        <p className="font-medium text-amber-700 dark:text-amber-400">Warnings:</p>
                        <ul className="list-disc pl-4 space-y-0.5 text-amber-700 dark:text-amber-400">
                          {result.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="font-medium text-destructive">
                    Sync failed: {result.error}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Syncing will create or update suppliers, packages, routes, suite types and rate
          cards. Existing bookings and quotes are not affected.
        </p>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// User management (admin only)
// ---------------------------------------------------------------------------
interface AppUser {
  userId: string
  email: string
  name: string
  clearanceLevel: string
}

function UserManagementCard() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [setPasswordFor, setSetPasswordFor] = useState<AppUser | null>(null)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [submitError, setSubmitError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function fetchUsers() {
      try {
        const res = await fetch("/api/users")
        if (!res.ok) {
          if (!cancelled) setError("Failed to load users")
          return
        }
        const json = (await res.json()) as { users: AppUser[] }
        if (!cancelled) setUsers(json.users ?? [])
      } catch {
        if (!cancelled) setError("Failed to load users")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchUsers()
    return () => { cancelled = true }
  }, [])

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError("")
    if (!setPasswordFor) return
    if (newPassword.length < 6) {
      setSubmitError("Password must be at least 6 characters")
      return
    }
    if (newPassword !== confirmPassword) {
      setSubmitError("Passwords do not match")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/users/${setPasswordFor.userId}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setSubmitError(data.error || "Failed to update password")
        return
      }
      setSetPasswordFor(null)
      setNewPassword("")
      setConfirmPassword("")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Users</CardTitle>
          <CardDescription className="text-xs">
            Set or reset passwords for app users. They will receive an email notification.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && <p className="text-sm text-muted-foreground">Loading users…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!loading && !error && users.length === 0 && (
            <p className="text-sm text-muted-foreground">No users found.</p>
          )}
          {!loading && !error && users.length > 0 && (
            <ul className="space-y-2">
              {users.map((u) => (
                <li
                  key={u.userId}
                  className="flex items-center justify-between gap-4 rounded-md border px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{u.name || u.email}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                    <Badge variant="secondary" className="mt-1 text-xs capitalize">
                      {u.clearanceLevel}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => {
                      setSetPasswordFor(u)
                      setNewPassword("")
                      setConfirmPassword("")
                      setSubmitError("")
                    }}
                  >
                    <KeyRound className="w-4 h-4" />
                    Set password
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!setPasswordFor} onOpenChange={(open) => !open && setSetPasswordFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set password</DialogTitle>
            <DialogDescription>
              Set a new password for {setPasswordFor?.name || setPasswordFor?.email}. They will
              receive an email notifying them who reset it.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 6 characters"
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                autoComplete="new-password"
              />
            </div>
            {submitError && (
              <p className="text-sm text-destructive">{submitError}</p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSetPasswordFor(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Updating…" : "Update password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function SettingsPage() {
  const { can } = useRole()

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">System configuration</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Company Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Company Name</label>
              <Input defaultValue="Luxus Travel & Tours" className="mt-1" readOnly />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <Input defaultValue="info@luxustravel.co.za" className="mt-1" readOnly />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Phone</label>
              <Input defaultValue="+27 12 345 6789" className="mt-1" readOnly />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">VAT Rate</label>
              <Input defaultValue="15%" className="mt-1" readOnly />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Banking Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Bank</label>
              <Input defaultValue="First National Bank" className="mt-1" readOnly />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Account Name</label>
              <Input defaultValue="Luxus Travel & Tours" className="mt-1" readOnly />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Account Number</label>
              <Input defaultValue="62XXXXXXXX" className="mt-1" readOnly />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Branch Code</label>
              <Input defaultValue="250655" className="mt-1" readOnly />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Supplier sync — only visible to admin and manager */}
      {can("sync:suppliers") && <SupplierSyncCard />}

      {can("import:customers") && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Customer Data</CardTitle>
            <CardDescription className="text-xs">
              Import customer records in bulk using a CSV template.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm" className="gap-2">
              <Link href="/app/settings/customer-import">
                <Upload className="h-4 w-4" />
                Bulk Import Customers
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* User management — admin only */}
      {can("manage:users") && <UserManagementCard />}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">System</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Application Version</span>
            <Badge variant="outline" className="text-xs">1.0.0-demo</Badge>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Data Mode</span>
            <Badge variant="secondary" className="text-xs">In-Memory (Seeded)</Badge>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Email Provider</span>
            <Badge variant="secondary" className="text-xs">Mock (90% success rate)</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
