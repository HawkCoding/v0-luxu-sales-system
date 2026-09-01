"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { mutate } from "swr"
import { toast } from "sonner"
import { AppLogo } from "@/components/app-logo"
import { EmailAccountsSettings } from "@/components/email-accounts-settings"
import { BackupSettings } from "@/components/backup-settings"
import { InvoiceStatusSettingsEditor } from "@/components/invoice-status-settings-editor"
import { BACKUPS_ENABLED } from "@/lib/feature-flags"
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
import { AlertTriangle, ArrowRight, Clock, FlaskConical, KeyRound, ListChecks, MoreHorizontal, Pencil, ShieldCheck, SlidersHorizontal, Tag, Trash2, Upload, UserCheck, UserPlus, UserX } from "lucide-react"

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

const ROLE_OPTIONS: Role[] = ["admin", "manager", "consultant"]

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
    if (newPassword.length < 10) {
      setSubmitError("Password must be at least 10 characters")
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
    if (createForm.password.length < 10) {
      setCreateError("Password must be at least 10 characters")
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
                placeholder="Minimum 10 characters"
                minLength={10}
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
                placeholder="Minimum 10 characters"
                minLength={10}
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

function CompanyInfoCard({ canEdit, canEditLogo }: { canEdit: boolean; canEditLogo: boolean }) {
  const [businessName, setBusinessName] = useState("")
  const [companyEmail, setCompanyEmail] = useState("")
  const [companyPhone, setCompanyPhone] = useState("")
  const [vatRate, setVatRate] = useState("")
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [savingField, setSavingField] = useState<string | null>(null)
  const [logoBusy, setLogoBusy] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch("/api/settings/company")
      .then((r) => r.json())
      .then((d) => {
        if (d.business_name) setBusinessName(d.business_name)
        if (d.company_email) setCompanyEmail(d.company_email)
        if (d.company_phone) setCompanyPhone(d.company_phone)
        if (d.vat_rate) setVatRate(d.vat_rate)
        setLogoUrl(d.app_logo_url || null)
      })
      .catch(() => {})
  }, [])

  const handleLogoUpload = async (file: File) => {
    if (file.type !== "image/png") {
      toast.error("The logo must be a PNG image.")
      return
    }

    // Best-effort square check — a favicon crops oddly otherwise. Doesn't
    // block the upload, just warns.
    try {
      const bitmap = await createImageBitmap(file)
      const diff = Math.abs(bitmap.width - bitmap.height) / Math.max(bitmap.width, bitmap.height)
      if (diff > 0.1) {
        toast.warning("Logo isn't square — it may crop oddly in the browser tab icon.")
      }
      bitmap.close()
    } catch {
      // Non-fatal: some browsers can't decode via createImageBitmap for all inputs.
    }

    setLogoBusy(true)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/settings/app-logo", { method: "POST", body })
      if (!res.ok) {
        const { error: message } = await res.json().catch(() => ({ error: "" }))
        throw new Error(message || "upload failed")
      }
      const { url } = (await res.json()) as { url: string }
      setLogoUrl(url)
      toast.success("Logo uploaded. The tab icon updates after a page reload.")
      mutate("/api/settings/company")
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Failed to upload logo")
    } finally {
      setLogoBusy(false)
      if (logoInputRef.current) logoInputRef.current.value = ""
    }
  }

  const handleLogoRemove = async () => {
    setLogoBusy(true)
    try {
      const res = await fetch("/api/settings/app-logo", { method: "DELETE" })
      if (!res.ok) throw new Error()
      setLogoUrl(null)
      toast.success("Logo removed")
      mutate("/api/settings/company")
    } catch {
      toast.error("Failed to remove logo")
    } finally {
      setLogoBusy(false)
    }
  }

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
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            App Logo (sidebar, browser tab, login screen)
          </label>
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded border bg-secondary/40 overflow-hidden">
              {logoUrl ? (
                <AppLogo logoUrl={logoUrl} businessName={businessName} size={80} />
              ) : (
                <span className="text-[10px] text-muted-foreground text-center px-1">No logo</span>
              )}
            </div>
            {canEditLogo && (
              <div className="flex flex-col gap-1">
                <input
                  id="app-logo-input"
                  ref={logoInputRef}
                  type="file"
                  accept="image/png"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void handleLogoUpload(file)
                  }}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={logoBusy}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {logoBusy ? "Working…" : "Upload logo"}
                  </Button>
                  {logoUrl && (
                    <Button size="sm" variant="ghost" disabled={logoBusy} onClick={handleLogoRemove}>
                      Remove
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground max-w-xs">
                  PNG, up to 5 MB, square recommended. Without a logo the app shows the
                  company name's initials. The browser tab icon updates on next reload;
                  removing it clears the tab icon entirely.
                </p>
              </div>
            )}
          </div>
        </div>
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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/settings/quote-follow-up")
      .then((r) => r.json())
      .then((d: { enabled?: boolean; cadence?: number[] }) => {
        if (cancelled) return
        if (typeof d.enabled === "boolean") setEnabled(d.enabled)
        if (Array.isArray(d.cadence)) setCadenceInput(d.cadence.join(","))
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
        body: JSON.stringify({ enabled, cadence: parsedCadence }),
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

        <p className="text-xs text-muted-foreground">
          The follow-up email wording is edited on the{" "}
          <Link href="/app/templates" className="underline underline-offset-2 hover:text-foreground">
            Templates page
          </Link>{" "}
          (Follow Up template).
        </p>

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

function EmailTestModeCard({ canEdit }: { canEdit: boolean }) {
  const [enabled, setEnabled] = useState(false)
  const [recipientInput, setRecipientInput] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/settings/email-test-mode")
      .then((r) => r.json())
      .then((d: { enabled?: boolean; recipients?: string[] }) => {
        if (cancelled) return
        if (typeof d.enabled === "boolean") setEnabled(d.enabled)
        if (Array.isArray(d.recipients)) setRecipientInput(d.recipients.join(", "))
      })
      .catch(() => toast.error("Failed to load email test mode"))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const parsedRecipients = recipientInput
    .split(/[,;]/)
    .map((value) => value.trim())
    .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
  const hasRecipient = parsedRecipients.length > 0
  // Turning it on without a destination would block sending outright, so the
  // API rejects it — mirror that rule here instead of failing after a click.
  const isValid = !enabled || hasRecipient

  const handleSave = async () => {
    if (!isValid) return
    setSaving(true)
    try {
      const res = await fetch("/api/settings/email-test-mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, recipient: recipientInput }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload?.error ?? "")
      setRecipientInput((payload?.recipients ?? parsedRecipients).join(", "))
      toast.success(
        enabled
          ? "Test mode on — customer emails are being redirected"
          : "Test mode off — emails now go to customers",
      )
      mutate("/api/settings/email-test-mode")
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Failed to save email test mode")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className={!canEdit ? "opacity-80" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <FlaskConical className="h-4 w-4" />
          Email Test Mode
        </CardTitle>
        <CardDescription className="text-xs">
          Redirects every outbound email — quotes, invoices, reminders, vouchers and automatic
          follow-ups — to a test inbox instead of the customer. Everything else behaves exactly as
          it does live, so the full pipeline can be run through end to end. Switch it off to go live.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch
            id="email-test-mode-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={!canEdit || loading}
            aria-label="Enable email test mode"
          />
          <Label htmlFor="email-test-mode-enabled" className="text-sm">
            {enabled ? "Test mode on — customers receive nothing" : "Test mode off — emails go to customers"}
          </Label>
        </div>

        <div className="space-y-1">
          <Label htmlFor="email-test-mode-recipient" className="text-xs font-medium text-muted-foreground">
            Test inbox (comma-separated for several)
          </Label>
          <Input
            id="email-test-mode-recipient"
            type="text"
            value={recipientInput}
            onChange={(e) => setRecipientInput(e.target.value)}
            placeholder="e.g. testing@luxustravel.co.za"
            readOnly={!canEdit}
            disabled={loading}
            aria-invalid={!isValid}
            className="sm:max-w-md"
          />
          {!isValid && (
            <p className="text-xs text-destructive">
              Enter a valid test inbox address before turning test mode on.
            </p>
          )}
        </div>

        {enabled && hasRecipient && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
            Every email is delivered to {parsedRecipients.join(", ")} with the real recipient shown in
            the subject line as <span className="font-mono">[TEST -&gt; customer@example.com]</span>.
          </p>
        )}

        {canEdit && (
          <Button size="sm" onClick={handleSave} disabled={loading || saving || !isValid}>
            {saving ? "Saving..." : "Save"}
          </Button>
        )}
        {!canEdit && (
          <p className="text-xs text-muted-foreground">
            Only managers and admins can change email test mode.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export default function SettingsPage() {
  const { can } = useRole()
  const { data: systemInfo } = useSystemInfo()
  const canEditSettings = can("edit:settings")

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">System configuration</p>
      </div>

      {!canEditSettings && (
        <p className="rounded-md border border-muted bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          You can view these settings, but only admins and managers can change them.
        </p>
      )}

      <CompanyInfoCard canEdit={canEditSettings} canEditLogo={canEditSettings} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Payment Methods</CardTitle>
          <CardDescription className="text-xs">
            Bank and company details shown on invoice PDFs and in invoice/reminder emails ({"{{bankingDetails}}"}{" "}
            template token). Configure several and switch between them per invoice or send.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/app/settings/payment-methods">
            <Button variant="outline" size="sm">
              {canEditSettings ? "Manage payment methods" : "View payment methods"}
              <ArrowRight data-icon="inline-end" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Invoice Statuses</CardTitle>
          <CardDescription className="text-xs">
            Labels shown in the invoice header. Each status is applied automatically as the booking
            progresses — only the wording is configurable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InvoiceStatusSettingsEditor canEdit={canEditSettings} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Defaults</CardTitle>
          <CardDescription className="text-xs">
            Deposit percentage, commission, hotel check-in/out times, train child pricing and
            passenger age bands applied to new quotes, invoices and bookings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="sm" variant="outline" className="gap-2">
            <Link href="/app/settings/defaults">
              <SlidersHorizontal className="h-4 w-4" />
              {canEditSettings ? "Manage defaults" : "View defaults"}
            </Link>
          </Button>
        </CardContent>
      </Card>

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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Outcome Reasons</CardTitle>
          <CardDescription className="text-xs">
            Manage the selectable reasons shown when a booking outcome is set to Lost or Cancelled.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="sm" variant="outline" className="gap-2">
            <Link href="/app/settings/outcome-reasons">
              <ListChecks className="h-4 w-4" />
              Manage Outcome Reasons
            </Link>
          </Button>
        </CardContent>
      </Card>

      <QuoteFollowUpSettingsCard canEdit={canEditSettings} />

      <EmailTestModeCard canEdit={canEditSettings} />

      {can("manage:users") && <UserManagementCard />}

      <EmailAccountsSettings
        canManageOutbound={canEditSettings}
        canManageInbound={canEditSettings}
      />

      {BACKUPS_ENABLED && canEditSettings && <BackupSettings />}

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
          {/* Data mode and email provider are infrastructure detail — admins only, so the
              "limited information" caption above is actually true for everyone else. */}
          {canEditSettings && (
            <>
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
