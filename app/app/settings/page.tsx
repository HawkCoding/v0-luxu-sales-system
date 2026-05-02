"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { InboundEmailSettings } from "@/components/inbound-email-settings"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { useRole } from "@/lib/role-context"
import type { Role } from "@/lib/types"
import { APP_VERSION } from "@/lib/version"
import { KeyRound, MoreHorizontal, ShieldCheck, Trash2, Upload, UserCheck, UserPlus, UserX } from "lucide-react"

interface AppUser {
  userId: string
  email: string
  name: string
  clearanceLevel: Role
  isActive: boolean
  isCurrentUser: boolean
}

interface CreateUserForm {
  name: string
  surname: string
  email: string
  clearanceLevel: Role
  password: string
  confirmPassword: string
}

const ROLE_OPTIONS: Role[] = ["admin", "manager", "consultant", "readonly"]

const EMPTY_CREATE_FORM: CreateUserForm = {
  name: "",
  surname: "",
  email: "",
  clearanceLevel: "consultant",
  password: "",
  confirmPassword: "",
}

function formatRoleLabel(role: Role) {
  return role.charAt(0).toUpperCase() + role.slice(1)
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

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<CreateUserForm>(EMPTY_CREATE_FORM)
  const [createError, setCreateError] = useState("")
  const [creatingUser, setCreatingUser] = useState(false)

  const [statusTarget, setStatusTarget] = useState<AppUser | null>(null)
  const [roleTarget, setRoleTarget] = useState<AppUser | null>(null)
  const [selectedRole, setSelectedRole] = useState<Role>("consultant")
  const [roleError, setRoleError] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null)
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("")
  const [actionUserId, setActionUserId] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/users")
      if (!res.ok) {
        setError("Failed to load users")
        return
      }
      const json = (await res.json()) as { users?: AppUser[] }
      setUsers(json.users ?? [])
    } catch {
      setError("Failed to load users")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchUsers()
  }, [fetchUsers])

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
      toast.success("Password updated")
      setSetPasswordFor(null)
      setNewPassword("")
      setConfirmPassword("")
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError("")

    if (!createForm.name.trim()) {
      setCreateError("Name is required")
      return
    }
    if (!createForm.email.trim()) {
      setCreateError("Email is required")
      return
    }
    if (createForm.password.length < 6) {
      setCreateError("Password must be at least 6 characters")
      return
    }
    if (createForm.password !== createForm.confirmPassword) {
      setCreateError("Passwords do not match")
      return
    }

    setCreatingUser(true)
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createForm.name.trim(),
          surname: createForm.surname.trim() || undefined,
          email: createForm.email.trim(),
          clearanceLevel: createForm.clearanceLevel,
          password: createForm.password,
        }),
      })

      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setCreateError(data.error || "Failed to create user")
        return
      }

      toast.success("User created")
      setCreateOpen(false)
      setCreateForm(EMPTY_CREATE_FORM)
      await fetchUsers()
    } catch {
      setCreateError("Failed to create user")
    } finally {
      setCreatingUser(false)
    }
  }

  const handleConfirmStatusChange = async () => {
    if (!statusTarget) return

    const nextIsActive = !statusTarget.isActive
    setActionUserId(statusTarget.userId)
    try {
      const res = await fetch(`/api/users/${statusTarget.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextIsActive }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        toast.error(data.error || "Failed to update user status")
        return
      }
      toast.success(nextIsActive ? "User reactivated" : "User deactivated")
      setStatusTarget(null)
      await fetchUsers()
    } catch {
      toast.error("Failed to update user status")
    } finally {
      setActionUserId(null)
    }
  }

  const handleConfirmRoleChange = async () => {
    if (!roleTarget) return

    setRoleError("")
    setActionUserId(roleTarget.userId)
    try {
      const res = await fetch(`/api/users/${roleTarget.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearanceLevel: selectedRole }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setRoleError(data.error || "Failed to update user role")
        return
      }
      toast.success("User role updated")
      setRoleTarget(null)
      await fetchUsers()
    } catch {
      setRoleError("Failed to update user role")
    } finally {
      setActionUserId(null)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return

    setActionUserId(deleteTarget.userId)
    try {
      const res = await fetch(`/api/users/${deleteTarget.userId}`, {
        method: "DELETE",
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        toast.error(data.error || "Failed to delete user")
        return
      }
      toast.success("User permanently deleted")
      setDeleteTarget(null)
      await fetchUsers()
    } catch {
      toast.error("Failed to delete user")
    } finally {
      setActionUserId(null)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-medium">Users</CardTitle>
              <CardDescription className="text-xs mt-1">
                Add users, manage roles, reset passwords, deactivate accounts, or permanently delete users.
              </CardDescription>
            </div>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setCreateForm(EMPTY_CREATE_FORM)
                setCreateError("")
                setCreateOpen(true)
              }}
            >
              <UserPlus className="h-4 w-4" />
              Add user
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && <p className="text-sm text-muted-foreground">Loading users...</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!loading && !error && users.length === 0 && (
            <p className="text-sm text-muted-foreground">No users found.</p>
          )}
          {!loading && !error && users.length > 0 && (
            <ul className="space-y-2">
              {users.map((u) => {
                const isBusy = actionUserId === u.userId
                return (
                  <li
                    key={u.userId}
                    className={`flex items-center justify-between gap-4 rounded-md border px-3 py-2 ${u.isActive ? "" : "opacity-60"}`}
                  >
                    <div>
                      <p className="text-sm font-medium">{u.name || u.email}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-xs capitalize">
                          {u.clearanceLevel}
                        </Badge>
                        {!u.isActive && (
                          <Badge variant="destructive" className="text-xs">
                            Inactive
                          </Badge>
                        )}
                        {u.isCurrentUser && (
                          <Badge variant="outline" className="text-xs">
                            You
                          </Badge>
                        )}
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="User actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setSetPasswordFor(u)
                            setNewPassword("")
                            setConfirmPassword("")
                            setSubmitError("")
                          }}
                          disabled={isBusy}
                        >
                          <KeyRound className="h-4 w-4" />
                          Set password
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setStatusTarget(u)}
                          disabled={u.isCurrentUser || isBusy}
                        >
                          {u.isActive ? (
                            <>
                              <UserX className="h-4 w-4" />
                              Deactivate
                            </>
                          ) : (
                            <>
                              <UserCheck className="h-4 w-4" />
                              Reactivate
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setRoleTarget(u)
                            setSelectedRole(u.clearanceLevel)
                            setRoleError("")
                          }}
                          disabled={u.isCurrentUser || isBusy}
                        >
                          <ShieldCheck className="h-4 w-4" />
                          Change role
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => {
                            setDeleteTarget(u)
                            setDeleteConfirmationText("")
                          }}
                          disabled={u.isCurrentUser || isBusy}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete permanently
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>
              Create a new user with an initial password and role assignment.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-user-name">Name</Label>
              <Input
                id="new-user-name"
                value={createForm.name}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="First name"
                autoComplete="given-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-user-surname">Surname (optional)</Label>
              <Input
                id="new-user-surname"
                value={createForm.surname}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, surname: e.target.value }))}
                placeholder="Surname"
                autoComplete="family-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-user-email">Email</Label>
              <Input
                id="new-user-email"
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="user@example.com"
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-user-role">Role</Label>
              <Select
                value={createForm.clearanceLevel}
                onValueChange={(value: Role) =>
                  setCreateForm((prev) => ({ ...prev, clearanceLevel: value }))
                }
              >
                <SelectTrigger id="new-user-role" className="w-full">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((role) => (
                    <SelectItem key={role} value={role}>
                      {formatRoleLabel(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-user-password">Password</Label>
              <Input
                id="new-user-password"
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="Min 6 characters"
                minLength={6}
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-user-confirm-password">Confirm password</Label>
              <Input
                id="new-user-confirm-password"
                type="password"
                value={createForm.confirmPassword}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, confirmPassword: e.target.value }))
                }
                placeholder="Repeat password"
                autoComplete="new-password"
              />
            </div>

            {createError && <p className="text-sm text-destructive">{createError}</p>}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={creatingUser}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creatingUser}>
                {creatingUser ? "Creating..." : "Create user"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
            {submitError && <p className="text-sm text-destructive">{submitError}</p>}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSetPasswordFor(null)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Updating..." : "Update password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!statusTarget} onOpenChange={(open) => !open && setStatusTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusTarget?.isActive ? "Deactivate user?" : "Reactivate user?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusTarget?.isActive
                ? `This will deactivate ${statusTarget?.name || statusTarget?.email}. They will no longer be able to sign in until reactivated.`
                : `This will reactivate ${statusTarget?.name || statusTarget?.email} and allow sign-in again.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionUserId === statusTarget?.userId}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmStatusChange}
              disabled={actionUserId === statusTarget?.userId}
              className={statusTarget?.isActive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            >
              {actionUserId === statusTarget?.userId
                ? "Saving..."
                : statusTarget?.isActive
                  ? "Deactivate"
                  : "Reactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!!roleTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRoleTarget(null)
            setRoleError("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription>
              Update access for {roleTarget?.name || roleTarget?.email}. Current role:{" "}
              {roleTarget ? formatRoleLabel(roleTarget.clearanceLevel) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="user-role-select">Role</Label>
            <Select value={selectedRole} onValueChange={(value: Role) => setSelectedRole(value)}>
              <SelectTrigger id="user-role-select" className="w-full">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((role) => (
                  <SelectItem key={role} value={role}>
                    {formatRoleLabel(role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {roleError && <p className="text-sm text-destructive">{roleError}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRoleTarget(null)}
              disabled={actionUserId === roleTarget?.userId}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmRoleChange} disabled={actionUserId === roleTarget?.userId}>
              {actionUserId === roleTarget?.userId ? "Saving..." : "Save role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
            setDeleteConfirmationText("")
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {deleteTarget?.name || deleteTarget?.email}. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-confirmation">
              Type <span className="font-semibold">{deleteTarget?.email}</span> to confirm
            </Label>
            <Input
              id="delete-confirmation"
              value={deleteConfirmationText}
              onChange={(e) => setDeleteConfirmationText(e.target.value)}
              placeholder={deleteTarget?.email ?? ""}
              autoComplete="off"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionUserId === deleteTarget?.userId}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={
                actionUserId === deleteTarget?.userId ||
                deleteConfirmationText.trim().toLowerCase() !== deleteTarget?.email.toLowerCase()
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionUserId === deleteTarget?.userId ? "Deleting..." : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function CompanyInfoCard({ canEdit }: { canEdit: boolean }) {
  const [businessName, setBusinessName] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/settings/company")
      .then((r) => r.json())
      .then((d) => { if (d.business_name) setBusinessName(d.business_name) })
      .catch(() => {})
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_name: businessName }),
      })
      if (!res.ok) throw new Error()
      toast.success("Business name saved")
    } catch {
      toast.error("Failed to save business name")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Company Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Company Name</label>
            <div className="flex gap-2 mt-1">
              <Input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                readOnly={!canEdit}
                placeholder="Luxus Travel"
              />
              {canEdit && (
                <Button size="sm" onClick={handleSave} disabled={saving || !businessName.trim()}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              )}
            </div>
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
  )
}

export default function SettingsPage() {
  const { can } = useRole()
  const canEditSettings = can("edit:settings")

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">System configuration</p>
      </div>

      <CompanyInfoCard canEdit={canEditSettings} />

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

      {can("manage:users") && <UserManagementCard />}

      {canEditSettings && <InboundEmailSettings />}

      <Card className={canEditSettings ? undefined : "opacity-70"}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">System</CardTitle>
          {!canEditSettings && (
            <CardDescription className="text-xs">
              Limited system information is shown here for non-admin users.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Application Version</span>
            <Badge variant="outline" className="text-xs">
              v{APP_VERSION}
            </Badge>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Data Mode</span>
            <Badge variant="secondary" className="text-xs">
              In-Memory (Seeded)
            </Badge>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Email Provider</span>
            <Badge variant="secondary" className="text-xs">
              Mock (90% success rate)
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
