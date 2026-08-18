"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { ChevronDown, ChevronUp, Eye, EyeOff, Inbox, Play, PlugZap, Plus, Save, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface InboundAccount {
  id: string
  email: string
  host: string
  port: number
  tlsMode: "ssl_tls" | "starttls" | "none"
  username: string
  inboxFolder: string
  processedFolder: string
  needsReviewFolder: string
  enabled: boolean
  firstSyncCompleted: boolean
  lastSyncedAt: string | null
}

interface InboundMessage {
  id: string
  uid: number
  subject: string
  fromAddress: string | null
  receivedAt: string | null
  status: string
  filingStatus: string
  /** Which body part getMessageBody() chose: "text", "html", "none", or null (row predates this). */
  bodyPart: string | null
  /** Preview of the body candidate that was NOT chosen, when both existed. */
  altBodyExcerpt: string | null
  missingFields: string[]
  warnings: string[]
  error: string | null
  bookingId: string | null
  createdAt: string
}

interface InboundRule {
  id: string
  name: string
  subjectPattern: string
  matchType: "contains" | "exact" | "regex"
  active: boolean
}

interface AccountForm {
  email: string
  host: string
  port: string
  tlsMode: "ssl_tls" | "starttls" | "none"
  username: string
  password: string
  inboxFolder: string
  processedFolder: string
  needsReviewFolder: string
  enabled: boolean
}

interface RuleForm {
  name: string
  subjectPattern: string
  matchType: "contains" | "exact" | "regex"
  active: boolean
}

const EMPTY_ACCOUNT: AccountForm = {
  email: "",
  host: "",
  port: "993",
  tlsMode: "ssl_tls",
  username: "",
  password: "",
  inboxFolder: "INBOX",
  processedFolder: "Processed",
  needsReviewFolder: "Needs Review",
  enabled: true,
}

const EMPTY_RULE: RuleForm = {
  name: "",
  subjectPattern: "",
  matchType: "contains",
  active: true,
}

export function InboundEmailSettings() {
  const [accounts, setAccounts] = useState<InboundAccount[]>([])
  const [rules, setRules] = useState<InboundRule[]>([])
  const [accountForm, setAccountForm] = useState<AccountForm>(EMPTY_ACCOUNT)
  const [ruleForm, setRuleForm] = useState<RuleForm>(EMPTY_RULE)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [savingAccount, setSavingAccount] = useState(false)
  const [savingRule, setSavingRule] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null)
  const [messagesByAccount, setMessagesByAccount] = useState<Record<string, InboundMessage[]>>({})
  const [loadingMessages, setLoadingMessages] = useState(false)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    try {
      const [accountResponse, ruleResponse] = await Promise.all([
        fetch("/api/settings/inbound-email/accounts"),
        fetch("/api/settings/inbound-email/rules"),
      ])

      if (!accountResponse.ok || !ruleResponse.ok) {
        toast.error("Failed to load inbound email settings")
        return
      }

      const accountJson = (await accountResponse.json()) as { accounts: InboundAccount[] }
      const ruleJson = (await ruleResponse.json()) as { rules: InboundRule[] }
      setAccounts(accountJson.accounts)
      setRules(ruleJson.rules)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  const createAccount = async (event: React.FormEvent) => {
    event.preventDefault()
    setSavingAccount(true)
    try {
      const response = await fetch("/api/settings/inbound-email/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...accountForm,
          port: Number(accountForm.port),
        }),
      })

      const body = (await response.json()) as { error?: string }
      if (!response.ok) {
        toast.error(body.error || "Failed to add mailbox")
        return
      }

      toast.success("Inbound mailbox added")
      setAccountForm(EMPTY_ACCOUNT)
      await loadSettings()
    } finally {
      setSavingAccount(false)
    }
  }

  const createRule = async (event: React.FormEvent) => {
    event.preventDefault()
    setSavingRule(true)
    try {
      const response = await fetch("/api/settings/inbound-email/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ruleForm),
      })

      const body = (await response.json()) as { error?: string }
      if (!response.ok) {
        toast.error(body.error || "Failed to add rule")
        return
      }

      toast.success("Inbound rule added")
      setRuleForm(EMPTY_RULE)
      await loadSettings()
    } finally {
      setSavingRule(false)
    }
  }

  const toggleAccount = async (account: InboundAccount) => {
    setBusyId(account.id)
    try {
      await fetch(`/api/settings/inbound-email/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !account.enabled }),
      })
      await loadSettings()
    } finally {
      setBusyId(null)
    }
  }

  const toggleRule = async (rule: InboundRule) => {
    setBusyId(rule.id)
    try {
      await fetch(`/api/settings/inbound-email/rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !rule.active }),
      })
      await loadSettings()
    } finally {
      setBusyId(null)
    }
  }

  const deleteAccount = async (accountId: string) => {
    setBusyId(accountId)
    try {
      await fetch(`/api/settings/inbound-email/accounts/${accountId}`, { method: "DELETE" })
      toast.success("Mailbox removed")
      await loadSettings()
    } finally {
      setBusyId(null)
    }
  }

  const deleteRule = async (ruleId: string) => {
    setBusyId(ruleId)
    try {
      await fetch(`/api/settings/inbound-email/rules/${ruleId}`, { method: "DELETE" })
      toast.success("Rule removed")
      await loadSettings()
    } finally {
      setBusyId(null)
    }
  }

  const testAccount = async (accountId: string) => {
    setBusyId(accountId)
    try {
      const response = await fetch(`/api/settings/inbound-email/accounts/${accountId}/test`, {
        method: "POST",
      })
      const body = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok || !body.ok) {
        toast.error(body.error || "Connection failed")
        return
      }
      toast.success("Connection succeeded")
    } finally {
      setBusyId(null)
    }
  }

  const toggleMessageLog = async (accountId: string) => {
    if (expandedAccountId === accountId) {
      setExpandedAccountId(null)
      return
    }
    setExpandedAccountId(accountId)
    if (messagesByAccount[accountId]) return

    setLoadingMessages(true)
    try {
      const response = await fetch(`/api/settings/inbound-email/accounts/${accountId}/messages`)
      if (!response.ok) {
        toast.error("Failed to load message log")
        return
      }
      const body = (await response.json()) as { messages: InboundMessage[] }
      setMessagesByAccount((prev) => ({ ...prev, [accountId]: body.messages }))
    } finally {
      setLoadingMessages(false)
    }
  }

  const syncAccount = async (accountId: string) => {
    setBusyId(accountId)
    try {
      const response = await fetch(`/api/settings/inbound-email/accounts/${accountId}/sync`, {
        method: "POST",
      })
      const body = (await response.json()) as { error?: string; summary?: { importedCount: number; needsReviewCount: number } }
      if (!response.ok) {
        toast.error(body.error || "Sync failed")
        return
      }
      toast.success("Mailbox synced", {
        description: `${body.summary?.importedCount ?? 0} imported, ${body.summary?.needsReviewCount ?? 0} needs review`,
      })
      // Drop the cached log so it's re-fetched with this run's rows next time it's opened.
      setMessagesByAccount((prev) => {
        const { [accountId]: _dropped, ...rest } = prev
        return rest
      })
      await loadSettings()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Inbound Email Accounts</CardTitle>
          <CardDescription className="text-xs">
            IMAP mailboxes used to import matching enquiry form submissions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={createAccount} className="grid gap-3 sm:grid-cols-2">
            <Field label="Mailbox email">
              <Input
                type="email"
                value={accountForm.email}
                onChange={(event) => setAccountForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="enquiries@example.com"
                required
              />
            </Field>
            <Field label="Host">
              <Input
                value={accountForm.host}
                onChange={(event) => setAccountForm((prev) => ({ ...prev, host: event.target.value }))}
                placeholder="mail.example.com"
                required
              />
            </Field>
            <Field label="Port">
              <Input
                inputMode="numeric"
                value={accountForm.port}
                onChange={(event) => setAccountForm((prev) => ({ ...prev, port: event.target.value }))}
                required
              />
            </Field>
            <Field label="SSL/TLS mode">
              <Select
                value={accountForm.tlsMode}
                onValueChange={(value: AccountForm["tlsMode"]) =>
                  setAccountForm((prev) => ({ ...prev, tlsMode: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ssl_tls">SSL/TLS</SelectItem>
                  <SelectItem value="starttls">STARTTLS</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Username">
              <Input
                value={accountForm.username}
                onChange={(event) => setAccountForm((prev) => ({ ...prev, username: event.target.value }))}
                required
              />
            </Field>
            <Field label="Password">
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={accountForm.password}
                  onChange={(event) => setAccountForm((prev) => ({ ...prev, password: event.target.value }))}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-r-md"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            <Field label="INBOX folder">
              <Input
                value={accountForm.inboxFolder}
                onChange={(event) => setAccountForm((prev) => ({ ...prev, inboxFolder: event.target.value }))}
              />
            </Field>
            <Field label="Processed folder">
              <Input
                value={accountForm.processedFolder}
                onChange={(event) => setAccountForm((prev) => ({ ...prev, processedFolder: event.target.value }))}
              />
            </Field>
            <Field label="Needs-review folder">
              <Input
                value={accountForm.needsReviewFolder}
                onChange={(event) => setAccountForm((prev) => ({ ...prev, needsReviewFolder: event.target.value }))}
              />
            </Field>
            <div className="flex items-end justify-between gap-3">
              <div className="flex items-center gap-2 pb-2">
                <Switch
                  checked={accountForm.enabled}
                  onCheckedChange={(checked) => setAccountForm((prev) => ({ ...prev, enabled: checked }))}
                />
                <span className="text-sm">Enabled</span>
              </div>
              <Button type="submit" disabled={savingAccount} className="gap-2">
                <Plus className="h-4 w-4" />
                {savingAccount ? "Adding..." : "Add mailbox"}
              </Button>
            </div>
          </form>

          <div className="space-y-2">
            {loading && <p className="text-sm text-muted-foreground">Loading mailboxes...</p>}
            {!loading && accounts.length === 0 && (
              <p className="text-sm text-muted-foreground">No inbound mailboxes configured.</p>
            )}
            {accounts.map((account) => (
              <div key={account.id} className="rounded-md border">
              <div className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Inbox className="h-4 w-4 text-muted-foreground" />
                    <p className="truncate text-sm font-medium">{account.email}</p>
                    <Badge variant={account.enabled ? "secondary" : "outline"} className="text-xs">
                      {account.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {account.host}:{account.port} {"->"} {account.processedFolder} / {account.needsReviewFolder}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={busyId === account.id}
                        onClick={() => toggleAccount(account)}
                        aria-label={account.enabled ? "Disable mailbox" : "Enable mailbox"}
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{account.enabled ? "Disable mailbox" : "Enable mailbox"}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={busyId === account.id}
                        onClick={() => testAccount(account.id)}
                        aria-label="Test connection"
                      >
                        <PlugZap className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Test connection</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={busyId === account.id}
                        onClick={() => syncAccount(account.id)}
                        aria-label="Sync now"
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Sync now</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => toggleMessageLog(account.id)}
                        aria-label={expandedAccountId === account.id ? "Hide recent messages" : "Show recent messages"}
                        aria-expanded={expandedAccountId === account.id}
                      >
                        {expandedAccountId === account.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Recent messages</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={busyId === account.id}
                        onClick={() => deleteAccount(account.id)}
                        aria-label="Delete mailbox"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete mailbox</TooltipContent>
                  </Tooltip>
                </div>
              </div>
              {expandedAccountId === account.id && (
                <div className="border-t p-3">
                  <MessageLog messages={messagesByAccount[account.id]} loading={loadingMessages} />
                </div>
              )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Inbound Email Rules</CardTitle>
          <CardDescription className="text-xs">
            Only emails whose subject matches an active rule are imported.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={createRule} className="grid gap-3 sm:grid-cols-[1fr_1fr_150px_auto]">
            <Field label="Rule name">
              <Input
                value={ruleForm.name}
                onChange={(event) => setRuleForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Website enquiry"
                required
              />
            </Field>
            <Field label="Subject pattern">
              <Input
                value={ruleForm.subjectPattern}
                onChange={(event) => setRuleForm((prev) => ({ ...prev, subjectPattern: event.target.value }))}
                placeholder="New enquiry"
                required
              />
            </Field>
            <Field label="Match">
              <Select
                value={ruleForm.matchType}
                onValueChange={(value: RuleForm["matchType"]) =>
                  setRuleForm((prev) => ({ ...prev, matchType: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">Contains</SelectItem>
                  <SelectItem value="exact">Exact</SelectItem>
                  <SelectItem value="regex">Regex</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-end">
              <Button type="submit" disabled={savingRule} className="gap-2">
                <Plus className="h-4 w-4" />
                Add rule
              </Button>
            </div>
          </form>

          <div className="space-y-2">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{rule.name}</p>
                    <Badge variant="outline" className="text-xs">{rule.matchType}</Badge>
                    <Badge variant={rule.active ? "secondary" : "outline"} className="text-xs">
                      {rule.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{rule.subjectPattern}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Switch
                    checked={rule.active}
                    disabled={busyId === rule.id}
                    onCheckedChange={() => toggleRule(rule)}
                    aria-label={rule.active ? "Disable rule" : "Enable rule"}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={busyId === rule.id}
                        onClick={() => deleteRule(rule.id)}
                        aria-label="Delete rule"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete rule</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ))}
            {!loading && rules.length === 0 && (
              <p className="text-sm text-muted-foreground">No subject rules configured.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}

const BODY_PART_LABEL: Record<string, string> = {
  text: "text/plain",
  html: "html (fallback)",
  none: "empty",
}

function MessageLog({ messages, loading }: { messages: InboundMessage[] | undefined; loading: boolean }) {
  if (loading && !messages) {
    return <p className="text-sm text-muted-foreground">Loading recent messages...</p>
  }
  if (!messages || messages.length === 0) {
    return <p className="text-sm text-muted-foreground">No messages recorded yet for this mailbox.</p>
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Last {messages.length} message(s) seen by this mailbox, most recent first.</p>
      <div className="space-y-2">
        {messages.map((message) => (
          <div key={message.id} className="rounded-md border p-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium">{message.subject}</span>
              <Badge variant="outline" className="text-[10px]">{message.status}</Badge>
              {message.bodyPart && (
                <Badge variant="secondary" className="text-[10px]">
                  body: {BODY_PART_LABEL[message.bodyPart] ?? message.bodyPart}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-muted-foreground">
              {message.fromAddress ?? "unknown sender"}
              {message.receivedAt ? ` · ${new Date(message.receivedAt).toLocaleString()}` : ""}
            </p>
            {message.missingFields.length > 0 && (
              <p className="mt-1 text-amber-600 dark:text-amber-400">Missing: {message.missingFields.join(", ")}</p>
            )}
            {message.error && <p className="mt-1 text-destructive">{message.error}</p>}
            {message.altBodyExcerpt && (
              <details className="mt-1">
                <summary className="cursor-pointer text-muted-foreground">
                  Show the body part that was NOT used
                </summary>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2">
                  {message.altBodyExcerpt}
                </pre>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
