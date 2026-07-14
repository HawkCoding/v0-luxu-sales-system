"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Activity, Archive, ChevronLeft, ChevronRight, Download } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuditLogs } from "@/lib/use-data"
import { getAuditDisplay, isDuplicateStageUpdate } from "@/lib/audit-display"

interface AuditLogViewProps {
  scope: "active" | "archive"
}

const PAGE_SIZE = 50
const ENTITY_TYPES = [
  "AuditLog",
  "Booking",
  "Customer",
  "CustomerLinkedAccount",
  "Location",
  "Package",
  "PackageLeg",
  "Payment",
  "Quote",
  "QuoteLineItem",
  "Supplier",
  "SupplierEmailLabel",
  "Traveller",
  "UserProfile",
]

function buildAuditQuery(params: {
  scope: "active" | "archive"
  page?: number
  pageSize?: number
  entityType?: string
  from?: string
  to?: string
}) {
  const query = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "" && value !== "all") {
      query.set(key, String(value))
    }
  })

  return query.toString()
}

export function AuditLogView({ scope }: AuditLogViewProps) {
  const [page, setPage] = useState(1)
  const [entityType, setEntityType] = useState("all")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const filters = useMemo(
    () => ({
      scope,
      page,
      pageSize: PAGE_SIZE,
      entityType,
      from,
      to,
    }),
    [entityType, from, page, scope, to],
  )

  const { data, error, isLoading } = useAuditLogs(filters)
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const isArchive = scope === "archive"
  const title = isArchive ? "Audit Archive" : "Audit Log"
  const description = isArchive
    ? "Entries older than 24 months"
    : "Entries from the last 24 months"

  const handleFilterChange = (setter: (value: string) => void) => (value: string) => {
    setter(value)
    setPage(1)
  }

  const handleExport = () => {
    const query = buildAuditQuery({ scope, entityType, from, to })
    window.location.href = `/api/audit/export?${query}`
  }

  return (
    <div className="p-6 space-y-4 max-w-6xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {description} Â· {total} entries
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          {isArchive ? (
            <Button asChild type="button" variant="outline" size="sm">
              <Link href="/app/audit">Active log</Link>
            </Button>
          ) : (
            <Button asChild type="button" variant="outline" size="sm">
              <Link href="/app/audit/archive">
                <Archive className="h-4 w-4" />
                Archive
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[220px_160px_160px]">
        <Select value={entityType} onValueChange={handleFilterChange(setEntityType)}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="Entity type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entity types</SelectItem>
            {ENTITY_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DatePicker
          value={from}
          onChange={(value) => handleFilterChange(setFrom)(value ?? "")}
          placeholder="From date"
          buttonClassName="h-9 text-sm"
          aria-label="From date"
        />
        <DatePicker
          value={to}
          onChange={(value) => handleFilterChange(setTo)(value ?? "")}
          placeholder="To date"
          buttonClassName="h-9 text-sm"
          aria-label="To date"
        />
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Failed to load audit logs.
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-lg bg-secondary" />
          ))}
        </div>
      )}

      {!isLoading && data?.logs.length === 0 && (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No audit entries match the current filters.
        </div>
      )}

      <div className="space-y-3">
        {data?.logs
          .filter((log) => !isDuplicateStageUpdate(log, data.logs))
          .map((log) => {
            const display = getAuditDisplay(log)

            return (
              <Card key={log.id} className="border-l-4 border-l-primary/70">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 gap-3">
                      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Activity className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-5 text-foreground">
                          {display.title}
                        </p>
                        {display.description && display.description !== "Stage change" && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {display.description}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary" className="text-[10px]">{log.entityType}</Badge>
                          <Badge variant="outline" className="text-[10px]">{display.actorLabel}</Badge>
                          <Badge variant="outline" className="text-[10px]">{log.action.replace(/_/g, " ")}</Badge>
                        </div>
                        {log.metaJson && (
                          <code className="mt-2 block w-fit max-w-full overflow-hidden text-ellipsis rounded bg-secondary px-1 py-0.5 text-[10px] text-muted-foreground">
                            {log.metaJson}
                          </code>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0 whitespace-nowrap">
                      {log.createdAtDisplay}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Page {page} of {totalPages}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
