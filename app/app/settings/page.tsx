"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { InboundEmailSettings } from "@/components/inbound-email-settings"
import { BackupSettings } from "@/components/backup-settings"
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
import { Skeleton } from "@/components/ui/skeleton"
import { useSystemInfo } from "@/lib/use-data"
import { useRole } from "@/lib/role-context"
import {
  MAX_SESSION_TIMEOUT_MINUTES,
  MIN_SESSION_TIMEOUT_MINUTES,
} from "@/lib/session-timeout"
import type { Role } from "@/lib/types"
import { APP_VERSION } from "@/lib/version"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { AlertTriangle, Clock, KeyRound, MoreHorizontal, Pencil, ShieldCheck, Tag, Trash2, Upload, UserCheck, UserPlus, UserX } from "lucide-react"

interface AppUser {
  userId: string
  email: string
  firstName: string
  lastName: string
  clearanceLevel: Role
  isActive: boolean
  isCurrentUser: boolean
}

function userDisplayName(u: AppUser | null | undefined): string {
  if (!u) return ""
  return [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email
}

interface EditUserForm {
  name: string
  surname: string
  email: string
}

const EMPTY_EDIT_FORM: EditUserForm = { name: "", surname: "", email: "" }

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
  const [editTarget, setEditTarget] = useState<AppUser | null>(null)
  const [editForm, setEditForm] = useState<EditUserForm>(EMPTY_EDIT_FORM)
  const [editError, setEditError] = useState("")
  const [editingUser, setEditingUser] = useState(false)
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

  const handleConfirmEditDetails = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editTarget) return

    setEditError("")
    if (!editForm.name.trim()) {
      setEditError("Name is required")
      return
    }
    if (!editForm.email.trim()) {
      setEditError("Email is required")
      return
    }

    setEditingUser(true)
    setActionUserId(editTarget.userId)
    try {
      const res = await fetch(`/api/users/${editTarget.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          surname: editForm.surname.trim(),
          email: editForm.email.trim(),
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setEditError(data.error || "Failed to update user details")
        return
      }
      toast.success("User details updated")
      setEditTarget(null)
      await fetchUsers()
    } catch {
      setEditError("Failed to update user details")
    } finally {
      setEditingUser(false)
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
                      <p className="text-sm font-medium">{userDisplayName(u)}</p>
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
                        <DropdownMenuItem
                          onClick={() => {
                            setEditTarget(u)
                            setEditForm({ name: u.firstName, surname: u.lastName, email: u.email })
                            setEditError("")
                          }}
                          disabled={isBusy}
                        >
                          <Pencil className="h-4 w-4" />
                          Edit details
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
              Set a new password for {userDisplayName(setPasswordFor)}. They will
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

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit user details</DialogTitle>
            <DialogDescription>
              Update the name, surname, or email address for {userDisplayName(editTarget)}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleConfirmEditDetails} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-user-name">Name</Label>
              <Input
                id="edit-user-name"
                value={editForm.name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="First name"
                autoComplete="given-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-user-surname">Surname</Label>
              <Input
                id="edit-user-surname"
                value={editForm.surname}
                onChange={(e) => setEditForm((prev) => ({ ...prev, surname: e.target.value }))}
                placeholder="Surname"
                autoComplete="family-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-user-email">Email</Label>
              <Input
                id="edit-user-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="user@example.com"
                autoComplete="email"
              />
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditTarget(null)}
                disabled={editingUser}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={editingUser}>
                {editingUser ? "Saving..." : "Save changes"}
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
                ? `This will deactivate ${userDisplayName(statusTarget)}. They will no longer be able to sign in until reactivated.`
                : `This will reactivate ${userDisplayName(statusTarget)} and allow sign-in again.`}
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
              Update access for {userDisplayName(roleTarget)}. Current role:{" "}
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
              This will permanently remove {userDisplayName(deleteTarget)}. This action
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
  const [companyEmail, setCompanyEmail] = useState("")
  const [companyPhone, setCompanyPhone] = useState("")
  const [vatRate, setVatRate] = useState("")
  const [savingField, setSavingField] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/settings/company")
      .then((r) => r.json())
      .then((d) => {
        if (d.business_name) setBusinessName(d.business_name)
        if (d.company_email) setCompanyEmail(d.company_email)
        if (d.company_phone) setCompanyPhone(d.company_phone)
        if (d.vat_rate) setVatRate(d.vat_rate)
      })
      .catch(() => {})
  }, [])

  const handleSave = async (
    field: "business_name" | "company_email" | "company_phone" | "vat_rate",
    value: string,
    label: string
  ) => {
    setSavingField(field)
    try {
      const res = await fetch("/api/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: field === "vat_rate" ? Number(value) : value }),
      })
      if (!res.ok) throw new Error()
      toast.success(`${label} saved`)
    } catch {
      toast.error(`Failed to save ${label.toLowerCase()}`)
    } finally {
      setSavingField(null)
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
                <Button
                  size="sm"
                  onClick={() => handleSave("business_name", businessName, "Business name")}
                  disabled={savingField === "business_name" || !businessName.trim()}
                >
                  {savingField === "business_name" ? "Saving…" : "Save"}
                </Button>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <div className="flex gap-2 mt-1">
              <Input
                type="email"
                value={companyEmail}
                onChange={(e) => setCompanyEmail(e.target.value)}
                readOnly={!canEdit}
                placeholder="info@luxustravel.co.za"
              />
              {canEdit && (
                <Button
                  size="sm"
                  onClick={() => handleSave("company_email", companyEmail, "Email")}
                  disabled={savingField === "company_email" || !companyEmail.trim()}
                >
                  {savingField === "company_email" ? "Saving…" : "Save"}
                </Button>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Phone</label>
            <div className="flex gap-2 mt-1">
              <Input
                value={companyPhone}
                onChange={(e) => setCompanyPhone(e.target.value)}
                readOnly={!canEdit}
                placeholder="+27 12 345 6789"
              />
              {canEdit && (
                <Button
                  size="sm"
                  onClick={() => handleSave("company_phone", companyPhone, "Phone")}
                  disabled={savingField === "company_phone" || !companyPhone.trim()}
                >
                  {savingField === "company_phone" ? "Saving…" : "Save"}
                </Button>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">VAT Rate (%)</label>
            <div className="flex gap-2 mt-1">
              <Input
                type="number"
                min={0}
                max={100}
                step={0.01}
                inputMode="decimal"
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                readOnly={!canEdit}
                placeholder="15"
              />
              {canEdit && (
                <Button
                  size="sm"
                  onClick={() => handleSave("vat_rate", vatRate, "VAT rate")}
                  disabled={
                    savingField === "vat_rate" ||
                    vatRate.trim() === "" ||
                    !Number.isFinite(Number(vatRate))
                  }
                >
                  {savingField === "vat_rate" ? "Saving…" : "Save"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function DepositSettingsCard({ canEdit }: { canEdit: boolean }) {
  const [defaultDepositPercentage, setDefaultDepositPercentage] = useState("25")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetch("/api/settings/deposit")
      .then((response) => response.json())
      .then((data: { defaultDepositPercentage?: number }) => {
        if (!cancelled && typeof data.defaultDepositPercentage === "number") {
          setDefaultDepositPercentage(String(data.defaultDepositPercentage))
        }
      })
      .catch(() => {
        toast.error("Failed to load deposit settings")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const numericValue = Number(defaultDepositPercentage)
  const isValidPercentage =
    defaultDepositPercentage.trim() !== "" &&
    Number.isFinite(numericValue) &&
    numericValue >= 0 &&
    numericValue <= 100

  const handleSave = async () => {
    if (!isValidPercentage) return

    setSaving(true)
    try {
      const res = await fetch("/api/settings/deposit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultDepositPercentage: numericValue }),
      })
      if (!res.ok) throw new Error()

      const data = (await res.json()) as { defaultDepositPercentage: number }
      setDefaultDepositPercentage(String(data.defaultDepositPercentage))
      toast.success("Default deposit percentage saved")
    } catch {
      toast.error("Failed to save deposit percentage")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className={!canEdit ? "opacity-80" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Quote & Invoice Defaults</CardTitle>
        <CardDescription className="text-xs">
          Deposit invoice generation uses this percentage unless a job-specific override is entered.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid gap-2 sm:max-w-xs">
          <Label htmlFor="default-deposit-percentage" className="text-xs font-medium text-muted-foreground">
            Default Deposit Percentage
          </Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="default-deposit-percentage"
                type="number"
                min={0}
                max={100}
                step={0.01}
                inputMode="decimal"
                value={defaultDepositPercentage}
                onChange={(event) => setDefaultDepositPercentage(event.target.value)}
                readOnly={!canEdit}
                disabled={loading}
                aria-invalid={!isValidPercentage}
                className="pr-8"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                %
              </span>
            </div>
            {canEdit && (
              <Button size="sm" onClick={handleSave} disabled={loading || saving || !isValidPercentage}>
                {saving ? "Saving..." : "Save"}
              </Button>
            )}
          </div>
          {!canEdit && (
            <p className="text-xs text-muted-foreground">
              Salespeople can view this default; managers and admins can change it.
            </p>
          )}
          {!isValidPercentage && (
            <p className="text-xs text-destructive">Enter a value between 0 and 100.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function HotelDefaultTimesCard({ canEdit }: { canEdit: boolean }) {
  const [checkInTime, setCheckInTime] = useState("14:00")
  const [checkOutTime, setCheckOutTime] = useState("11:00")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetch("/api/settings/hotel-defaults")
      .then((response) => response.json())
      .then((data: { checkInTime?: string; checkOutTime?: string }) => {
        if (cancelled) return
        if (typeof data.checkInTime === "string") setCheckInTime(data.checkInTime)
        if (typeof data.checkOutTime === "string") setCheckOutTime(data.checkOutTime)
      })
      .catch(() => {
        toast.error("Failed to load hotel default times")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const isValid = checkInTime.trim() !== "" && checkOutTime.trim() !== ""

  const handleSave = async () => {
    if (!isValid) return

    setSaving(true)
    try {
      const res = await fetch("/api/settings/hotel-defaults", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkInTime, checkOutTime }),
      })
      if (!res.ok) throw new Error()

      const data = (await res.json()) as { checkInTime: string; checkOutTime: string }
      setCheckInTime(data.checkInTime)
      setCheckOutTime(data.checkOutTime)
      toast.success("Hotel default times saved")
    } catch {
      toast.error("Failed to save hotel default times")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className={!canEdit ? "opacity-80" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Hotel Defaults</CardTitle>
        <CardDescription className="text-xs">
          New hotel suppliers start with these check-in and check-out times; each hotel can override them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-2">
            <Label htmlFor="hotel-default-check-in" className="text-xs font-medium text-muted-foreground">
              Check-in time
            </Label>
            <Input
              id="hotel-default-check-in"
              type="time"
              value={checkInTime}
              onChange={(event) => setCheckInTime(event.target.value)}
              readOnly={!canEdit}
              disabled={loading}
              className="w-32"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="hotel-default-check-out" className="text-xs font-medium text-muted-foreground">
              Check-out time
            </Label>
            <Input
              id="hotel-default-check-out"
              type="time"
              value={checkOutTime}
              onChange={(event) => setCheckOutTime(event.target.value)}
              readOnly={!canEdit}
              disabled={loading}
              className="w-32"
            />
          </div>
          {canEdit && (
            <Button size="sm" onClick={handleSave} disabled={loading || saving || !isValid}>
              {saving ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
        {!canEdit && (
          <p className="text-xs text-muted-foreground">
            Salespeople can view these defaults; managers and admins can change them.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function DefaultAgeBandsCard({ canEdit }: { canEdit: boolean }) {
  const [infantMax, setInfantMax] = useState("2")
  const [childMax, setChildMax] = useState("12")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetch("/api/settings/age-bands")
      .then(async (response) => {
        if (!response.ok) throw new Error("load failed")
        return response.json()
      })
      .then((data: { infantMaxAge?: number; childMaxAge?: number }) => {
        if (cancelled) return
        if (typeof data.infantMaxAge === "number") setInfantMax(String(data.infantMaxAge))
        if (typeof data.childMaxAge === "number") setChildMax(String(data.childMaxAge))
      })
      .catch(() => {
        toast.error("Failed to load default age bands")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const infantValue = Number(infantMax)
  const childValue = Number(childMax)
  const isValid =
    Number.isInteger(infantValue) &&
    Number.isInteger(childValue) &&
    infantValue >= 0 &&
    infantValue <= 17 &&
    childValue >= 0 &&
    childValue <= 17 &&
    infantValue <= childValue

  const handleSave = async () => {
    if (!isValid) return
    setSaving(true)
    try {
      const res = await fetch("/api/settings/age-bands", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ infantMaxAge: infantValue, childMaxAge: childValue }),
      })
      if (!res.ok) throw new Error()
      const data = (await res.json()) as { infantMaxAge: number; childMaxAge: number }
      setInfantMax(String(data.infantMaxAge))
      setChildMax(String(data.childMaxAge))
      toast.success("Default age bands saved")
    } catch {
      toast.error("Failed to save default age bands")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className={!canEdit ? "opacity-80" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Passenger Age Bands</CardTitle>
        <CardDescription className="text-xs">
          Defaults used to classify passengers as infant, child or adult. Suppliers can override
          these on their own profile.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:max-w-md sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="default-infant-max" className="text-xs font-medium text-muted-foreground">
              Infant max age
            </Label>
            <Input
              id="default-infant-max"
              type="number"
              min={0}
              max={17}
              step={1}
              inputMode="numeric"
              value={infantMax}
              onChange={(event) => setInfantMax(event.target.value)}
              readOnly={!canEdit}
              disabled={loading}
              aria-invalid={!isValid}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="default-child-max" className="text-xs font-medium text-muted-foreground">
              Child max age
            </Label>
            <Input
              id="default-child-max"
              type="number"
              min={0}
              max={17}
              step={1}
              inputMode="numeric"
              value={childMax}
              onChange={(event) => setChildMax(event.target.value)}
              readOnly={!canEdit}
              disabled={loading}
              aria-invalid={!isValid}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Resolves to: Infant <span className="tabular-nums">0–{Number.isFinite(infantValue) ? infantValue : "?"}</span>,
          Child <span className="tabular-nums">{Number.isFinite(infantValue) ? infantValue + 1 : "?"}–{Number.isFinite(childValue) ? childValue : "?"}</span>,
          Adult <span className="tabular-nums">{Number.isFinite(childValue) ? childValue + 1 : "?"}+</span>
        </p>
        {canEdit && (
          <div>
            <Button size="sm" onClick={handleSave} disabled={loading || saving || !isValid}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
        {!canEdit && (
          <p className="text-xs text-muted-foreground">Only admins can change these defaults.</p>
        )}
        {!isValid && (
          <p className="text-xs text-destructive">
            Infant max must be ≤ child max, and both must be between 0 and 17.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function TrainChildPriceRatioCard({ canEdit }: { canEdit: boolean }) {
  const [percent, setPercent] = useState("50")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetch("/api/settings/train-child-price-ratio")
      .then(async (response) => {
        if (!response.ok) throw new Error("load failed")
        return response.json()
      })
      .then((data: { ratio?: number }) => {
        if (!cancelled && typeof data.ratio === "number") {
          setPercent(String(Math.round(data.ratio * 10000) / 100))
        }
      })
      .catch(() => {
        toast.error("Failed to load train child price ratio")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const numericValue = Number(percent)
  const isValid =
    percent.trim() !== "" &&
    Number.isFinite(numericValue) &&
    numericValue >= 0 &&
    numericValue <= 100

  const handleSave = async () => {
    if (!isValid) return

    setSaving(true)
    try {
      const res = await fetch("/api/settings/train-child-price-ratio", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratio: numericValue / 100 }),
      })
      if (!res.ok) throw new Error()

      const data = (await res.json()) as { ratio: number }
      setPercent(String(Math.round(data.ratio * 10000) / 100))
      toast.success("Train child price ratio saved")
    } catch {
      toast.error("Failed to save train child price ratio")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className={!canEdit ? "opacity-80" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Train Pricing Defaults</CardTitle>
        <CardDescription className="text-xs">
          When entering Adult prices on train rate cards, Child prices auto-fill to this
          percentage of Adult. Manual edits are preserved.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid gap-2 sm:max-w-xs">
          <Label
            htmlFor="train-child-price-ratio"
            className="text-xs font-medium text-muted-foreground"
          >
            Child price as % of Adult
          </Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="train-child-price-ratio"
                type="number"
                min={0}
                max={100}
                step={0.01}
                inputMode="decimal"
                value={percent}
                onChange={(event) => setPercent(event.target.value)}
                readOnly={!canEdit}
                disabled={loading}
                aria-invalid={!isValid}
                className="pr-8"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                %
              </span>
            </div>
            {canEdit && (
              <Button size="sm" onClick={handleSave} disabled={loading || saving || !isValid}>
                {saving ? "Saving..." : "Save"}
              </Button>
            )}
          </div>
          {!canEdit && (
            <p className="text-xs text-muted-foreground">
              Only admins can change this default.
            </p>
          )}
          {!isValid && (
            <p className="text-xs text-destructive">Enter a value between 0 and 100.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function SessionTimeoutSettingsCard({ canEdit }: { canEdit: boolean }) {
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState("30")
  const [warningMinutes, setWarningMinutes] = useState(5)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetch("/api/settings/session-timeout")
      .then((response) => response.json())
      .then((data: { sessionTimeoutMinutes?: number; warningMinutes?: number }) => {
        if (cancelled) return
        if (typeof data.sessionTimeoutMinutes === "number") {
          setSessionTimeoutMinutes(String(data.sessionTimeoutMinutes))
        }
        if (typeof data.warningMinutes === "number") {
          setWarningMinutes(data.warningMinutes)
        }
      })
      .catch(() => {
        toast.error("Failed to load session timeout settings")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const numericValue = Number(sessionTimeoutMinutes)
  const isValidTimeout =
    sessionTimeoutMinutes.trim() !== "" &&
    Number.isInteger(numericValue) &&
    numericValue >= MIN_SESSION_TIMEOUT_MINUTES &&
    numericValue <= MAX_SESSION_TIMEOUT_MINUTES

  const handleSave = async () => {
    if (!isValidTimeout) return

    setSaving(true)
    try {
      const res = await fetch("/api/settings/session-timeout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionTimeoutMinutes: numericValue }),
      })
      if (!res.ok) throw new Error()

      const data = (await res.json()) as { sessionTimeoutMinutes: number; warningMinutes: number }
      setSessionTimeoutMinutes(String(data.sessionTimeoutMinutes))
      setWarningMinutes(data.warningMinutes)
      toast.success("Session timeout saved")
    } catch {
      toast.error("Failed to save session timeout")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className={!canEdit ? "opacity-80" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Clock className="h-4 w-4" />
          Session Security
        </CardTitle>
        <CardDescription className="text-xs">
          Inactive users receive a warning before they are signed out automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid gap-2 sm:max-w-xs">
          <Label htmlFor="session-timeout-minutes" className="text-xs font-medium text-muted-foreground">
            Idle Timeout
          </Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="session-timeout-minutes"
                type="number"
                min={MIN_SESSION_TIMEOUT_MINUTES}
                max={MAX_SESSION_TIMEOUT_MINUTES}
                step={1}
                inputMode="numeric"
                value={sessionTimeoutMinutes}
                onChange={(event) => setSessionTimeoutMinutes(event.target.value)}
                readOnly={!canEdit}
                disabled={loading}
                aria-invalid={!isValidTimeout}
                className="pr-16"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                min
              </span>
            </div>
            {canEdit && (
              <Button size="sm" onClick={handleSave} disabled={loading || saving || !isValidTimeout}>
                {saving ? "Saving..." : "Save"}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Warning appears {warningMinutes} minute{warningMinutes === 1 ? "" : "s"} before logout.
          </p>
          {!canEdit && (
            <p className="text-xs text-muted-foreground">
              Only admins can change session timeout settings.
            </p>
          )}
          {!isValidTimeout && (
            <p className="text-xs text-destructive">
              Enter a whole number from {MIN_SESSION_TIMEOUT_MINUTES} to {MAX_SESSION_TIMEOUT_MINUTES}.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function QuoteFollowUpSettingsCard({ canEdit }: { canEdit: boolean }) {
  const [enabled, setEnabled] = useState(true)
  const [cadenceInput, setCadenceInput] = useState("3,7")
  const [emailTemplate, setEmailTemplate] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/settings/quote-follow-up")
      .then((r) => r.json())
      .then((d: { enabled?: boolean; cadence?: number[]; template?: string }) => {
        if (cancelled) return
        if (typeof d.enabled === "boolean") setEnabled(d.enabled)
        if (Array.isArray(d.cadence)) setCadenceInput(d.cadence.join(","))
        if (typeof d.template === "string") setEmailTemplate(d.template)
      })
      .catch(() => toast.error("Failed to load quote follow-up settings"))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const parsedCadence = cadenceInput
    .split(",")
    .map((v) => parseInt(v.trim(), 10))
    .filter((v) => Number.isInteger(v) && v > 0)
  const isCadenceValid = parsedCadence.length > 0

  const handleSave = async () => {
    if (!isCadenceValid) return
    setSaving(true)
    try {
      const res = await fetch("/api/settings/quote-follow-up", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, cadence: parsedCadence, template: emailTemplate }),
      })
      if (!res.ok) throw new Error()
      toast.success("Quote follow-up settings saved")
    } catch {
      toast.error("Failed to save quote follow-up settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className={!canEdit ? "opacity-80" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Quote Follow-Up</CardTitle>
        <CardDescription className="text-xs">
          Automatically email customers with outstanding quotes at configured intervals after the quote was sent.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch
            id="follow-up-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={!canEdit || loading}
            aria-label="Enable quote follow-up emails"
          />
          <Label htmlFor="follow-up-enabled" className="text-sm">
            {enabled ? "Follow-ups enabled" : "Follow-ups disabled"}
          </Label>
        </div>

        <div className="space-y-1">
          <Label htmlFor="follow-up-cadence" className="text-xs font-medium text-muted-foreground">
            Follow-up days after quote sent (comma-separated)
          </Label>
          <Input
            id="follow-up-cadence"
            value={cadenceInput}
            onChange={(e) => setCadenceInput(e.target.value)}
            placeholder="e.g. 3,7"
            readOnly={!canEdit}
            disabled={loading}
            aria-invalid={!isCadenceValid}
            className="sm:max-w-xs"
          />
          {!isCadenceValid && (
            <p className="text-xs text-destructive">Enter at least one positive integer.</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="follow-up-template" className="text-xs font-medium text-muted-foreground">
            Email body template (HTML — supports {"{{customerName}}"}, {"{{jobNumber}}"}, {"{{lastSentDate}}"})
          </Label>
          <Textarea
            id="follow-up-template"
            value={emailTemplate}
            onChange={(e) => setEmailTemplate(e.target.value)}
            readOnly={!canEdit}
            disabled={loading}
            rows={5}
            className="font-mono text-xs"
          />
        </div>

        {canEdit && (
          <Button
            size="sm"
            onClick={handleSave}
            disabled={loading || saving || !isCadenceValid}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        )}
        {!canEdit && (
          <p className="text-xs text-muted-foreground">
            Only managers and admins can change follow-up settings.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function QuoteValidityCard({ canEdit }: { canEdit: boolean }) {
  const [quoteValidityDays, setQuoteValidityDays] = useState("14")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetch("/api/settings/quote-validity")
      .then((response) => response.json())
      .then((data: { quoteValidityDays?: number }) => {
        if (!cancelled && typeof data.quoteValidityDays === "number") {
          setQuoteValidityDays(String(data.quoteValidityDays))
        }
      })
      .catch(() => {
        toast.error("Failed to load quote validity setting")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const numericValue = Number(quoteValidityDays)
  const isValidDays =
    quoteValidityDays.trim() !== "" &&
    Number.isInteger(numericValue) &&
    numericValue >= 1 &&
    numericValue <= 365

  const handleSave = async () => {
    if (!isValidDays) return

    setSaving(true)
    try {
      const res = await fetch("/api/settings/quote-validity", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteValidityDays: numericValue }),
      })
      if (!res.ok) throw new Error()

      const data = (await res.json()) as { quoteValidityDays: number }
      setQuoteValidityDays(String(data.quoteValidityDays))
      toast.success("Quote validity saved")
    } catch {
      toast.error("Failed to save quote validity")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className={!canEdit ? "opacity-80" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Quote Validity</CardTitle>
        <CardDescription className="text-xs">
          New quotes are valid for this many days from the day they are created.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid gap-2 sm:max-w-xs">
          <Label htmlFor="quote-validity-days" className="text-xs font-medium text-muted-foreground">
            Quote Validity (days)
          </Label>
          <div className="flex gap-2">
            <Input
              id="quote-validity-days"
              type="number"
              min={1}
              max={365}
              step={1}
              inputMode="numeric"
              value={quoteValidityDays}
              onChange={(event) => setQuoteValidityDays(event.target.value)}
              readOnly={!canEdit}
              disabled={loading}
              aria-invalid={!isValidDays}
              className="flex-1"
            />
            {canEdit && (
              <Button size="sm" onClick={handleSave} disabled={loading || saving || !isValidDays}>
                {saving ? "Saving..." : "Save"}
              </Button>
            )}
          </div>
          {!canEdit && (
            <p className="text-xs text-muted-foreground">
              Salespeople can view this default; managers and admins can change it.
            </p>
          )}
          {!isValidDays && (
            <p className="text-xs text-destructive">Enter a whole number of days between 1 and 365.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function SettingsPage() {
  const { can, role } = useRole()
  const { data: systemInfo } = useSystemInfo()
  const canEditSettings = can("edit:settings")
  const canEditDepositSettings = role === "admin" || role === "manager"

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">System configuration</p>
      </div>

      <CompanyInfoCard canEdit={canEditSettings} />

      <DepositSettingsCard canEdit={canEditDepositSettings} />

      <HotelDefaultTimesCard canEdit={canEditDepositSettings} />

      <QuoteValidityCard canEdit={canEditDepositSettings} />

      <TrainChildPriceRatioCard canEdit={role === "admin"} />

      <DefaultAgeBandsCard canEdit={role === "admin"} />

      <SessionTimeoutSettingsCard canEdit={canEditSettings} />

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

      {canEditSettings && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Rate Types</CardTitle>
            <CardDescription className="text-xs">
              Manage RAC / STO / NETT / Resident and other rate types used on supplier rate cards.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm" variant="outline" className="gap-2">
              <Link href="/app/settings/rate-types">
                <Tag className="h-4 w-4" />
                Manage Rate Types
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {canEditDepositSettings && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Error Log</CardTitle>
            <CardDescription className="text-xs">
              View and resolve system errors, warnings, and info events logged by the application.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm" variant="outline" className="gap-2">
              <Link href="/app/settings/error-log">
                <AlertTriangle className="h-4 w-4" />
                View Error Log
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {canEditDepositSettings && (
        <QuoteFollowUpSettingsCard canEdit={canEditDepositSettings} />
      )}

      {can("manage:users") && <UserManagementCard />}

      {canEditSettings && <InboundEmailSettings />}

      {canEditDepositSettings && <BackupSettings isAdmin={role === "admin"} />}

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
            {systemInfo ? (
              <Badge variant="secondary" className="text-xs">{systemInfo.dataMode}</Badge>
            ) : (
              <Skeleton className="h-4 w-36" />
            )}
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Email Provider</span>
            {systemInfo ? (
              <Badge variant="secondary" className="text-xs">{systemInfo.emailProvider}</Badge>
            ) : (
              <Skeleton className="h-4 w-36" />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
