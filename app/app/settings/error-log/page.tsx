"use client"

import { useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { toast } from "sonner"
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useRole } from "@/lib/role-context"
import { cn } from "@/lib/utils"
import { formatDisplayDate } from "@/lib/date-format"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Severity = "Critical" | "Warning" | "Info"

interface ErrorLog {
  id: string
  severity: Severity
  source: string
  message: string
  details: Record<string, unknown> | null
  resolved: boolean
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
}

function severityBadge(severity: Severity) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-semibold",
        severity === "Critical" && "border-red-500 text-red-600 bg-red-50",
        severity === "Warning" && "border-amber-500 text-amber-600 bg-amber-50",
        severity === "Info" && "border-blue-500 text-blue-600 bg-blue-50",
      )}
    >
      {severity}
    </Badge>
  )
}

export default function ErrorLogPage() {
  const { role } = useRole()
  const canResolve = role === "admin" || role === "manager"

  const [severityFilter, setSeverityFilter] = useState<string>("all")
  const [showResolved, setShowResolved] = useState(false)
  const [resolving, setResolving] = useState<string | null>(null)

  const params = new URLSearchParams()
  if (severityFilter !== "all") params.set("severity", severityFilter)
  params.set("resolved", showResolved ? "true" : "false")

  const { data, error, isLoading, mutate } = useSWR<{ errorLogs: ErrorLog[] }>(
    `/api/error-logs?${params.toString()}`,
    fetcher,
  )

  async function handleResolve(id: string) {
    setResolving(id)
    try {
      const res = await fetch(`/api/error-logs/${id}/resolve`, { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? "Failed to resolve error log")
        return
      }
      toast.success("Error log marked as resolved")
      await mutate()
    } finally {
      setResolving(null)
    }
  }

  const logs = data?.errorLogs ?? []

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon-sm">
          <Link href="/app/settings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Error Log</h1>
          <p className="text-sm text-muted-foreground mt-0.5">System errors, warnings, and info events</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue placeholder="All severities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="Critical">Critical</SelectItem>
                <SelectItem value="Warning">Warning</SelectItem>
                <SelectItem value="Info">Info</SelectItem>
              </SelectContent>
            </Select>

            <Button
              size="sm"
              variant={showResolved ? "default" : "outline"}
              className="h-8 text-xs"
              onClick={() => setShowResolved((v) => !v)}
            >
              {showResolved ? "Showing resolved" : "Unresolved only"}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-6 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              Failed to load error logs.
            </div>
          )}

          {!isLoading && !error && logs.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <span>No error logs found.</span>
            </div>
          )}

          {!isLoading && !error && logs.length > 0 && (
            <div className="divide-y divide-border">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start justify-between gap-4 px-6 py-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {severityBadge(log.severity)}
                      <span className="text-xs text-muted-foreground font-mono">{log.source}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDisplayDate(log.created_at.slice(0, 10))}
                      </span>
                    </div>
                    <p className="text-sm text-foreground">{log.message}</p>
                    {log.details && (
                      <pre className="text-xs text-muted-foreground bg-muted rounded p-2 overflow-x-auto max-h-24 mt-1">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                    {log.resolved && log.resolved_at && (
                      <p className="text-xs text-green-600">
                        Resolved {formatDisplayDate(log.resolved_at.slice(0, 10))}
                      </p>
                    )}
                  </div>

                  {canResolve && !log.resolved && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-shrink-0 h-7 text-xs"
                      disabled={resolving === log.id}
                      onClick={() => handleResolve(log.id)}
                    >
                      {resolving === log.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "Resolve"
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
