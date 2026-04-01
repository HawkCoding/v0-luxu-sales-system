"use client"

import Link from "next/link"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { AlertCircle, CheckCircle2, FileText, X } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { LoadingState } from "@/components/ui/loading-state"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  ImportConflictResolutionModal,
  type ImportConflictGroup,
} from "@/components/import-conflict-resolution-modal"
import { useActiveSuppliers, useSupplierDetail } from "@/lib/use-data"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { mutate } from "swr"

const SUPPLIER_NONE_VALUE = "__none_supplier__"
const ROUTE_NONE_VALUE = "__none_route__"
const CHUNK_SIZE = 500
const AUTO_RETRY_ATTEMPTS = 1

/** Opaque tint matching former `bg-amber-500/10` / hover `15%` over `--background` (sticky cells cannot use alpha or scroll bleeds through). */
const IMPORT_CONFLICT_ROW_TINT =
  "bg-[color-mix(in_srgb,var(--background)_90%,rgb(245_158_11)_10%)] group-hover:bg-[color-mix(in_srgb,var(--background)_85%,rgb(245_158_11)_15%)]"

interface EditableImportRow {
  id: string
  selected: boolean
  title: string
  first_name: string
  last_name: string
  email: string
  phone: string
  country: string
  sourceLabel: string
}

interface ImportResult {
  createdCustomers: number
  matchedCustomers: number
  importedBookings: number
  skippedDuplicates: number
  enrichedProfiles: number
  conflictEmails: string[]
  skippedInvalid: number
  failedChunks: number
  successfulChunks: number
  totalChunks: number
  chunkErrors: Array<{ chunkNumber: number; message: string }>
}

type ChunkStatusState = "pending" | "processing" | "retrying" | "success" | "failed"

interface ChunkStatus {
  chunkNumber: number
  rowCount: number
  state: ChunkStatusState
  error?: string
}

interface ChunkImportResult {
  createdCustomers: number
  matchedCustomers: number
  importedBookings: number
  skippedDuplicates: number
  enrichedProfiles: number
  duplicates: string[]
}

interface ImportApiErrorPayload {
  error?: string
  phase?: string
  traceId?: string
  details?: {
    message?: string
    code?: string
  } | null
}

interface RetryableChunk {
  chunkNumber: number
  rows: EditableImportRow[]
  error: string
}

interface ImportRunConfig {
  supplierId: string | null
  routeId: string | null
}

interface PreImportCheckSummary {
  checkedCustomers: number
  existingCustomers: number
  newCustomers: number
  potentialDuplicateCustomers: number
  error?: string
}

interface PreImportCheckResponse {
  existing?: Array<{
    email?: string
    hasRouteBooking?: boolean
  }>
}

const REQUIRED_HEADERS = ["first_name", "last_name", "email"] as const
const HEADER_ALIASES: Record<string, "title" | "first_name" | "last_name" | "email" | "phone" | "country"> = {
  title: "title",
  name: "first_name",
  first_name: "first_name",
  firstname: "first_name",
  surname: "last_name",
  last_name: "last_name",
  lastname: "last_name",
  email: "email",
  email_email: "email",
  contact_number: "phone",
  phone: "phone",
  country: "country",
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function customerSignature(row: Pick<EditableImportRow, "title" | "first_name" | "last_name" | "email" | "phone" | "country">): string {
  return JSON.stringify({
    title: row.title.trim() || null,
    first_name: row.first_name.trim(),
    last_name: row.last_name.trim(),
    email: normalizeEmail(row.email),
    phone: row.phone.trim() || null,
    country: row.country.trim() || null,
  })
}

function getConflictGroups(rows: EditableImportRow[]): ImportConflictGroup[] {
  const grouped = new Map<string, EditableImportRow[]>()
  rows.forEach((row) => {
    const email = normalizeEmail(row.email)
    if (!email) return
    const list = grouped.get(email) ?? []
    list.push(row)
    grouped.set(email, list)
  })

  const conflicts: ImportConflictGroup[] = []
  grouped.forEach((groupRows, email) => {
    if (groupRows.length < 2) return
    const signatures = new Set(groupRows.map((row) => customerSignature(row)))
    if (signatures.size > 1) conflicts.push({ email, rows: groupRows })
  })
  return conflicts
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === "," && !inQuotes) {
      values.push(current.trim())
      current = ""
    } else {
      current += char
    }
  }
  values.push(current.trim())
  return values
}

function isEmail(value: string): boolean {
  return /^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(value.trim())
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function getUniqueCustomerCount(rows: EditableImportRow[]): number {
  return new Set(rows.map((row) => normalizeEmail(row.email))).size
}

function isRowValid(row: EditableImportRow): boolean {
  return row.first_name.trim().length > 0 && row.last_name.trim().length > 0 && isEmail(row.email)
}

function newRowId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `${Date.now()}-${Math.random()}`
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/** Lets React commit loading UI and the browser paint before heavy synchronous work. */
function yieldForLoadingPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

function toImportPayloadRows(rows: EditableImportRow[]) {
  return rows.map((row) => ({
    source_row_id: row.id,
    title: row.title.trim() || null,
    first_name: row.first_name.trim(),
    last_name: row.last_name.trim(),
    email: normalizeEmail(row.email),
    phone: row.phone.trim() || null,
    country: row.country.trim() || null,
  }))
}

function toFriendlyChunkError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return "Unable to upload this chunk. Please check your network connection or retry at a later time."
}

function parseImportApiErrorPayload(payload: unknown): ImportApiErrorPayload {
  if (!payload || typeof payload !== "object") return {}
  const candidate = payload as ImportApiErrorPayload
  return {
    error: typeof candidate.error === "string" ? candidate.error : undefined,
    phase: typeof candidate.phase === "string" ? candidate.phase : undefined,
    traceId: typeof candidate.traceId === "string" ? candidate.traceId : undefined,
    details: candidate.details ?? null,
  }
}

function formatImportApiError(payload: ImportApiErrorPayload): string {
  const baseMessage =
    payload.error?.trim() ||
    payload.details?.message?.trim() ||
    "Unable to upload this chunk. Please check your network connection or retry at a later time."

  const suffixParts: string[] = []
  if (payload.phase) suffixParts.push(`phase: ${payload.phase}`)
  if (payload.traceId) suffixParts.push(`trace: ${payload.traceId}`)

  return suffixParts.length > 0 ? `${baseMessage} (${suffixParts.join(", ")})` : baseMessage
}

interface ReviewTableProps {
  rows: EditableImportRow[]
  selectedConflictEmailSet: Set<string>
  onToggleSelected: (id: string, selected: boolean) => void
  removeRow: (id: string) => void
}

const ReviewTable = memo(function ReviewTable({
  rows,
  selectedConflictEmailSet,
  onToggleSelected,
  removeRow,
}: ReviewTableProps) {
  return (
    <div className="import-review-scroll max-h-[45vh] w-full min-w-0 rounded-md border">
      <table className="caption-bottom w-full min-w-[980px] table-fixed text-sm">
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 top-0 z-[30] w-10 bg-background">Use</TableHead>
            <TableHead className="sticky left-[40px] top-0 z-[30] w-24 bg-background">Title</TableHead>
            <TableHead className="sticky left-[136px] top-0 z-[30] w-36 bg-background">First</TableHead>
            <TableHead className="sticky left-[280px] top-0 z-[30] w-36 bg-background shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
              Last
            </TableHead>
            <TableHead className="sticky top-0 z-20 w-72 bg-background">Email</TableHead>
            <TableHead className="sticky top-0 z-20 w-40 bg-background">Phone</TableHead>
            <TableHead className="sticky top-0 z-20 w-32 bg-background">Country</TableHead>
            <TableHead className="sticky top-0 z-20 w-56 bg-background">Source</TableHead>
            <TableHead className="sticky top-0 z-20 w-24 bg-background">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const valid = isRowValid(row)
            const hasConflict = row.selected && selectedConflictEmailSet.has(normalizeEmail(row.email))
            // Sticky cells must use opaque backgrounds so horizontally scrolled content does not show through.
            const stickyFrozenBg = !valid
              ? "bg-red-50 group-hover:bg-red-100 dark:bg-red-950 dark:group-hover:bg-red-900"
              : hasConflict
                ? IMPORT_CONFLICT_ROW_TINT
                : "bg-background group-hover:bg-muted"

            return (
              <TableRow
                key={row.id}
                className={cn(
                  "group",
                  !valid ? "bg-destructive/5" : "",
                  hasConflict ? IMPORT_CONFLICT_ROW_TINT : "",
                )}
              >
                <TableCell
                  className={cn(
                    "sticky left-0 z-10 w-10",
                    stickyFrozenBg,
                  )}
                >
                  <Checkbox
                    checked={row.selected}
                    onCheckedChange={(checked) => onToggleSelected(row.id, checked === true)}
                  />
                </TableCell>
                <TableCell
                  className={cn(
                    "sticky left-[40px] z-10 w-24",
                    stickyFrozenBg,
                  )}
                >
                  <span className="block truncate text-sm text-foreground">{row.title.trim() || "—"}</span>
                </TableCell>
                <TableCell
                  className={cn(
                    "sticky left-[136px] z-10 w-36",
                    stickyFrozenBg,
                  )}
                >
                  <span className={cn("block truncate text-sm", row.first_name.trim().length > 0 ? "text-foreground" : "text-destructive")}>
                    {row.first_name.trim() || "Missing first name"}
                  </span>
                </TableCell>
                <TableCell
                  className={cn(
                    "sticky left-[280px] z-10 w-36 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]",
                    stickyFrozenBg,
                  )}
                >
                  <span className={cn("block truncate text-sm", row.last_name.trim().length > 0 ? "text-foreground" : "text-destructive")}>
                    {row.last_name.trim() || "Missing last name"}
                  </span>
                </TableCell>
                <TableCell className={cn("w-72", isEmail(row.email) ? "text-foreground" : "text-destructive")}>
                  <span className="block truncate text-sm">{row.email.trim() || "Missing email"}</span>
                </TableCell>
                <TableCell className="w-40">
                  <span className="block truncate text-sm text-foreground">{row.phone.trim() || "—"}</span>
                </TableCell>
                <TableCell className="w-32">
                  <span className="block truncate text-sm text-foreground">{row.country.trim() || "—"}</span>
                </TableCell>
                <TableCell className="w-56 truncate text-xs text-muted-foreground" title={row.sourceLabel}>
                  {row.sourceLabel}
                </TableCell>
                <TableCell className="w-24">
                  <Button variant="ghost" size="sm" onClick={() => removeRow(row.id)}>
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </table>
    </div>
  )
})

interface CustomerBulkImportPanelProps {
  discardRequestToken?: number
  onDiscardHandled?: () => void
  onDirtyStateChange?: (dirty: boolean) => void
}

export function CustomerBulkImportPanel({
  discardRequestToken,
  onDiscardHandled,
  onDirtyStateChange,
}: CustomerBulkImportPanelProps = {}) {
  const { data: suppliers = [] } = useActiveSuppliers()
  const [files, setFiles] = useState<File[]>([])
  const [rows, setRows] = useState<EditableImportRow[]>([])
  const [result, setResult] = useState<ImportResult | null>(null)
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null)
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPreparingConflicts, setIsPreparingConflicts] = useState(false)
  const [conflictPrepMessage, setConflictPrepMessage] = useState("")
  const [chunkStatuses, setChunkStatuses] = useState<ChunkStatus[]>([])
  const [retryableChunks, setRetryableChunks] = useState<RetryableChunk[]>([])
  const [conflictModalOpen, setConflictModalOpen] = useState(false)
  const [pendingRowsForImport, setPendingRowsForImport] = useState<EditableImportRow[] | null>(null)
  const [pendingConflicts, setPendingConflicts] = useState<ImportConflictGroup[]>([])
  const [isCheckingExistingCustomers, setIsCheckingExistingCustomers] = useState(false)
  const [preImportCheckSummary, setPreImportCheckSummary] = useState<PreImportCheckSummary | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const importRunConfigRef = useRef<ImportRunConfig | null>(null)
  const frozenPreImportCheckRef = useRef<PreImportCheckSummary | null>(null)
  const lastDiscardRequestTokenRef = useRef<number | undefined>(undefined)

  const selectedSupplierSlug = useMemo(
    () => suppliers.find((supplier) => supplier.id === selectedSupplierId)?.slug ?? "",
    [selectedSupplierId, suppliers],
  )
  const { data: supplierDetail } = useSupplierDetail(selectedSupplierSlug)

  const routeOptions = useMemo(() => {
    if (!supplierDetail || "error" in supplierDetail) return []
    return supplierDetail.packages.flatMap((pkg) =>
      pkg.routes.map((route) => ({
        id: route.id,
        label: `${route.name} (${pkg.name})`,
      })),
    )
  }, [supplierDetail])

  const selectedValidRows = useMemo(() => rows.filter((row) => row.selected && isRowValid(row)), [rows])
  const selectedInvalidCount = useMemo(() => rows.filter((row) => row.selected && !isRowValid(row)).length, [rows])
  const selectedConflictGroups = useMemo(() => getConflictGroups(selectedValidRows), [selectedValidRows])
  const selectedConflictEmailSet = useMemo(
    () => new Set(selectedConflictGroups.map((group) => group.email)),
    [selectedConflictGroups],
  )
  const selectedValidUniqueEmailCount = useMemo(
    () => getUniqueCustomerCount(selectedValidRows),
    [selectedValidRows],
  )

  const completedChunks = useMemo(
    () => chunkStatuses.filter((chunk) => chunk.state === "success" || chunk.state === "failed").length,
    [chunkStatuses],
  )
  const progressValue = chunkStatuses.length > 0 ? Math.round((completedChunks / chunkStatuses.length) * 100) : 0
  const displayPreImportCheckSummary =
    (isSubmitting || result) ? (frozenPreImportCheckRef.current ?? preImportCheckSummary) : preImportCheckSummary
  const preImportSummaryIsFrozen = (isSubmitting || Boolean(result)) && Boolean(displayPreImportCheckSummary)

  const handleSupplierChange = (value: string) => {
    const nextSupplierId = value === SUPPLIER_NONE_VALUE ? null : value
    setSelectedSupplierId(nextSupplierId)
    setSelectedRouteId(null)
  }

  const handleRouteChange = (value: string) => {
    setSelectedRouteId(value === ROUTE_NONE_VALUE ? null : value)
  }

  const handleFiles = useCallback((incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return
    setResult(null)
    setChunkStatuses([])
    setRetryableChunks([])
    importRunConfigRef.current = null
    setFiles([incoming[0]])
  }, [])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    handleFiles(e.dataTransfer.files ?? null)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files ?? null)
    e.target.value = ""
  }

  const handleReset = useCallback(() => {
    setFiles([])
    setRows([])
    setResult(null)
    setSelectedSupplierId(null)
    setSelectedRouteId(null)
    setIsPreparingConflicts(false)
    setConflictPrepMessage("")
    setChunkStatuses([])
    setRetryableChunks([])
    setConflictModalOpen(false)
    setPendingRowsForImport(null)
    setPendingConflicts([])
    setIsCheckingExistingCustomers(false)
    setPreImportCheckSummary(null)
    importRunConfigRef.current = null
    frozenPreImportCheckRef.current = null
    if (inputRef.current) inputRef.current.value = ""
  }, [])

  const hasUnsavedImportData = rows.length > 0 && !result

  useEffect(() => {
    onDirtyStateChange?.(hasUnsavedImportData)
  }, [hasUnsavedImportData, onDirtyStateChange])

  useEffect(() => {
    if (discardRequestToken === undefined) return
    if (discardRequestToken === lastDiscardRequestTokenRef.current) return
    lastDiscardRequestTokenRef.current = discardRequestToken
    handleReset()
    onDiscardHandled?.()
  }, [discardRequestToken, handleReset, onDiscardHandled])

  useEffect(() => {
    if (isSubmitting || isPreparingConflicts || conflictModalOpen) {
      setIsCheckingExistingCustomers(false)
      return
    }

    if (selectedValidRows.length === 0) {
      setPreImportCheckSummary(null)
      setIsCheckingExistingCustomers(false)
      return
    }

    let cancelled = false
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setIsCheckingExistingCustomers(true)
      try {
        const response = await fetch("/api/customers/import/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            emails: Array.from(new Set(selectedValidRows.map((row) => normalizeEmail(row.email)))),
            routeId: selectedRouteId,
          }),
        })

        let payload: PreImportCheckResponse | null = null
        try {
          payload = (await response.json()) as PreImportCheckResponse
        } catch {
          payload = null
        }

        if (!response.ok) {
          const fallbackMessage = "Could not check existing customers before import."
          if (!cancelled) {
            setPreImportCheckSummary({
              checkedCustomers: selectedValidUniqueEmailCount,
              existingCustomers: 0,
              newCustomers: selectedValidUniqueEmailCount,
              potentialDuplicateCustomers: 0,
              error: fallbackMessage,
            })
          }
          return
        }

        const existingRows = Array.isArray(payload?.existing) ? payload.existing : []
        const existingCustomers = existingRows.length
        const potentialDuplicateCustomers = existingRows.filter((row) => row.hasRouteBooking === true).length
        const newCustomers = Math.max(0, selectedValidUniqueEmailCount - existingCustomers)

        if (!cancelled) {
          setPreImportCheckSummary({
            checkedCustomers: selectedValidUniqueEmailCount,
            existingCustomers,
            newCustomers,
            potentialDuplicateCustomers,
          })
        }
      } catch (error) {
        if (!cancelled && !(error instanceof DOMException && error.name === "AbortError")) {
          setPreImportCheckSummary({
            checkedCustomers: selectedValidUniqueEmailCount,
            existingCustomers: 0,
            newCustomers: selectedValidUniqueEmailCount,
            potentialDuplicateCustomers: 0,
            error: "Could not check existing customers before import.",
          })
        }
      } finally {
        if (!cancelled) setIsCheckingExistingCustomers(false)
      }
    }, 350)

    return () => {
      cancelled = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [conflictModalOpen, isPreparingConflicts, isSubmitting, selectedRouteId, selectedValidRows, selectedValidUniqueEmailCount])

  const parseCsvFile = async (file: File): Promise<EditableImportRow[]> => {
    const text = await file.text()
    const lines = text
      .replace(/\r/g, "")
      .split("\n")
      .filter(Boolean)
    if (lines.length < 2) return []

    const rawHeaders = parseCsvLine(lines[0]).map((header) => normalizeHeader(header))
    const mappedHeaders = rawHeaders.map((header) => HEADER_ALIASES[header] ?? null)
    const missingHeaders = REQUIRED_HEADERS.filter((header) => !mappedHeaders.includes(header))
    if (missingHeaders.length > 0) throw new Error(`CSV headers must include ${missingHeaders.join(", ")}`)

    const headerIndex = new Map<string, number>()
    mappedHeaders.forEach((header, index) => {
      if (header) headerIndex.set(header, index)
    })
    const getValue = (values: string[], header: keyof EditableImportRow) =>
      values[headerIndex.get(header) ?? -1]?.trim() ?? ""

    return lines.slice(1).map((line, index) => {
      const values = parseCsvLine(line)
      return {
        id: newRowId(),
        selected: true,
        title: getValue(values, "title"),
        first_name: getValue(values, "first_name"),
        last_name: getValue(values, "last_name"),
        email: normalizeEmail(getValue(values, "email")),
        phone: getValue(values, "phone"),
        country: getValue(values, "country"),
        sourceLabel: `${file.name} row ${index + 2}`,
      }
    })
  }

  const handlePrepareRows = async () => {
    if (files.length === 0) return
    setIsProcessing(true)
    setResult(null)
    setChunkStatuses([])
    setRetryableChunks([])
    importRunConfigRef.current = null
    try {
      const nextRows = await parseCsvFile(files[0])
      if (nextRows.length === 0) {
        toast.error("No records found", { description: "Please check the uploaded file content." })
        return
      }
      setRows(nextRows)
      toast.success("Records extracted", {
        description: `${getUniqueCustomerCount(nextRows)} customers and ${nextRows.length} historical bookings ready for review.`,
      })
    } catch (error) {
      toast.error("Failed to process file(s)", {
        description: error instanceof Error ? error.message : "Please try another file format.",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const toggleRowSelected = useCallback((id: string, selected: boolean) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, selected } : row)))
  }, [])

  const removeRow = useCallback((id: string) => {
    setRows((current) => current.filter((row) => row.id !== id))
  }, [])

  const updateChunkStatus = (chunkNumber: number, patch: Partial<ChunkStatus>) => {
    setChunkStatuses((current) =>
      current.map((chunk) => (chunk.chunkNumber === chunkNumber ? { ...chunk, ...patch } : chunk)),
    )
  }

  const postChunk = async (
    chunkRowsData: EditableImportRow[],
    runConfig: ImportRunConfig,
  ): Promise<ChunkImportResult> => {
    const response = await fetch("/api/customers/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId: runConfig.supplierId,
        routeId: runConfig.routeId,
        rows: toImportPayloadRows(chunkRowsData),
      }),
    })

    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }

    const parsedPayload = parseImportApiErrorPayload(payload)
    if (!response.ok) throw new Error(formatImportApiError(parsedPayload))

    return {
      createdCustomers:
        typeof (payload as { createdCustomers?: unknown })?.createdCustomers === "number"
          ? (payload as { createdCustomers: number }).createdCustomers
          : 0,
      matchedCustomers:
        typeof (payload as { matchedCustomers?: unknown })?.matchedCustomers === "number"
          ? (payload as { matchedCustomers: number }).matchedCustomers
          : 0,
      importedBookings:
        typeof (payload as { importedBookings?: unknown })?.importedBookings === "number"
          ? (payload as { importedBookings: number }).importedBookings
          : 0,
      skippedDuplicates:
        typeof (payload as { skippedDuplicates?: unknown })?.skippedDuplicates === "number"
          ? (payload as { skippedDuplicates: number }).skippedDuplicates
          : 0,
      enrichedProfiles:
        typeof (payload as { enrichedProfiles?: unknown })?.enrichedProfiles === "number"
          ? (payload as { enrichedProfiles: number }).enrichedProfiles
          : 0,
      duplicates: Array.isArray((payload as { duplicates?: unknown })?.duplicates)
        ? ((payload as { duplicates: string[] }).duplicates ?? [])
        : [],
    }
  }

  const runChunkImport = useCallback(async (
    rowsToImport: EditableImportRow[],
    conflictEmailsFromPrescan: string[],
    invalidSkipped: number,
  ) => {
    frozenPreImportCheckRef.current = preImportCheckSummary
    const runConfig: ImportRunConfig = {
      supplierId: selectedSupplierId,
      routeId: selectedRouteId,
    }
    importRunConfigRef.current = runConfig

    setIsSubmitting(true)
    setResult(null)
    setRetryableChunks([])
    await yieldForLoadingPaint()
    try {
      const chunks = chunkArray(rowsToImport, CHUNK_SIZE)
      setChunkStatuses(
        chunks.map((chunk, index) => ({
          chunkNumber: index + 1,
          rowCount: chunk.length,
          state: "pending",
        })),
      )

      let createdCustomers = 0
      let matchedCustomers = 0
      let importedBookings = 0
      let skippedDuplicates = 0
      let enrichedProfiles = 0
      const serverConflictEmails = new Set<string>()
      const failed: RetryableChunk[] = []
      const chunkErrors: Array<{ chunkNumber: number; message: string }> = []

      for (let index = 0; index < chunks.length; index++) {
        const chunkNumber = index + 1
        const chunk = chunks[index]

        let success = false
        let attempts = 0

        while (!success && attempts <= AUTO_RETRY_ATTEMPTS) {
          updateChunkStatus(chunkNumber, { state: attempts > 0 ? "retrying" : "processing", error: undefined })

          try {
            const invalidInChunk = chunk.some((row) => !isRowValid(row))
            if (invalidInChunk) throw new Error("Chunk contains invalid rows. Please review extracted data and retry.")

            const next = await postChunk(chunk, runConfig)
            createdCustomers += next.createdCustomers
            matchedCustomers += next.matchedCustomers
            importedBookings += next.importedBookings
            skippedDuplicates += next.skippedDuplicates
            enrichedProfiles += next.enrichedProfiles
            next.duplicates.forEach((email) => serverConflictEmails.add(email))
            updateChunkStatus(chunkNumber, { state: "success" })
            success = true
          } catch (error) {
            const message = toFriendlyChunkError(error)
            if (attempts < AUTO_RETRY_ATTEMPTS) {
              attempts += 1
              updateChunkStatus(chunkNumber, { state: "retrying", error: message })
              await sleep(1200)
              continue
            }

            failed.push({ chunkNumber, rows: chunk, error: message })
            chunkErrors.push({ chunkNumber, message })
            updateChunkStatus(chunkNumber, { state: "failed", error: message })
            break
          }
        }
      }

      const conflictEmails = Array.from(new Set([...conflictEmailsFromPrescan, ...Array.from(serverConflictEmails)]))
      const nextResult: ImportResult = {
        createdCustomers,
        matchedCustomers,
        importedBookings,
        skippedDuplicates,
        enrichedProfiles,
        conflictEmails,
        skippedInvalid: invalidSkipped,
        failedChunks: failed.length,
        successfulChunks: chunks.length - failed.length,
        totalChunks: chunks.length,
        chunkErrors,
      }

      setResult(nextResult)
      setRetryableChunks(failed)
      if (failed.length === 0) importRunConfigRef.current = null
      if (importedBookings > 0 || createdCustomers > 0) await mutate("/api/data")

      if (failed.length > 0) {
        toast.error("Import partially complete", {
          description: `${nextResult.successfulChunks} of ${nextResult.totalChunks} chunks succeeded. ${failed.length} chunk${failed.length === 1 ? "" : "s"} failed.`,
        })
      } else if (conflictEmails.length > 0) {
        toast.success("Customer and booking import complete", {
          description:
            `${createdCustomers} customers created, ` +
            `${matchedCustomers} duplicate customer${matchedCustomers === 1 ? "" : "s"}, ` +
            `${importedBookings} historical bookings imported, ` +
            `${skippedDuplicates} duplicate booking${skippedDuplicates === 1 ? "" : "s"} from customers skipped. ` +
            `${conflictEmails.length} duplicate emails were resolved.`,
        })
      } else {
        toast.success("Customer and booking import complete", {
          description:
            `${createdCustomers} customers created, ${matchedCustomers} duplicate customer${matchedCustomers === 1 ? "" : "s"}, ${importedBookings} historical bookings imported, ` +
            `${skippedDuplicates} duplicate booking${skippedDuplicates === 1 ? "" : "s"} from customers skipped.`,
        })
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [preImportCheckSummary, selectedRouteId, selectedSupplierId])

  const handleRetryFailedChunks = async () => {
    if (retryableChunks.length === 0 || !result) return
    const runConfig = importRunConfigRef.current
    if (!runConfig) {
      toast.error("Retry context unavailable", {
        description: "Please start the import again to retry failed chunks safely.",
      })
      return
    }

    setIsSubmitting(true)
    await yieldForLoadingPaint()
    try {
      let createdDelta = 0
      let matchedDelta = 0
      let importedDelta = 0
      let skippedDuplicatesDelta = 0
      let enrichedProfilesDelta = 0
      const remainingFailed: RetryableChunk[] = []
      const retryErrors: Array<{ chunkNumber: number; message: string }> = []

      for (const failedChunk of retryableChunks) {
        let success = false
        let attempts = 0

        while (!success && attempts <= AUTO_RETRY_ATTEMPTS) {
          updateChunkStatus(failedChunk.chunkNumber, { state: attempts > 0 ? "retrying" : "processing", error: undefined })
          try {
            const next = await postChunk(failedChunk.rows, runConfig)
            createdDelta += next.createdCustomers
            matchedDelta += next.matchedCustomers
            importedDelta += next.importedBookings
            skippedDuplicatesDelta += next.skippedDuplicates
            enrichedProfilesDelta += next.enrichedProfiles
            updateChunkStatus(failedChunk.chunkNumber, { state: "success", error: undefined })
            success = true
          } catch (error) {
            const message = toFriendlyChunkError(error)
            if (attempts < AUTO_RETRY_ATTEMPTS) {
              attempts += 1
              updateChunkStatus(failedChunk.chunkNumber, { state: "retrying", error: message })
              await sleep(1200)
              continue
            }
            const failedAgain = { ...failedChunk, error: message }
            remainingFailed.push(failedAgain)
            retryErrors.push({ chunkNumber: failedChunk.chunkNumber, message })
            updateChunkStatus(failedChunk.chunkNumber, { state: "failed", error: message })
            break
          }
        }
      }

      setRetryableChunks(remainingFailed)
      if (remainingFailed.length === 0) importRunConfigRef.current = null
      if (importedDelta > 0 || createdDelta > 0) await mutate("/api/data")

      setResult((current) => {
        if (!current) return current
        const mergedErrors = [
          ...current.chunkErrors.filter((entry) => !retryableChunks.some((retry) => retry.chunkNumber === entry.chunkNumber)),
          ...retryErrors,
        ]
        return {
          ...current,
          createdCustomers: current.createdCustomers + createdDelta,
          matchedCustomers: current.matchedCustomers + matchedDelta,
          importedBookings: current.importedBookings + importedDelta,
          skippedDuplicates: current.skippedDuplicates + skippedDuplicatesDelta,
          enrichedProfiles: current.enrichedProfiles + enrichedProfilesDelta,
          failedChunks: remainingFailed.length,
          successfulChunks: current.totalChunks - remainingFailed.length,
          chunkErrors: mergedErrors,
        }
      })

      if (remainingFailed.length > 0) {
        toast.error("Some chunks still failed", {
          description:
            "Unable to upload one or more chunks. Please check your network connection or retry at a later time.",
        })
      } else {
        toast.success("Failed chunks imported", {
          description: "All previously failed chunks were imported successfully.",
        })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleImport = async () => {
    if (selectedValidRows.length === 0) {
      toast.error("No valid rows selected", {
        description: "Fix invalid rows or select at least one valid customer row.",
      })
      return
    }

    if (selectedConflictGroups.length > 0) {
      flushSync(() => {
        setConflictPrepMessage("Preparing conflict resolution...")
        setIsPreparingConflicts(true)
      })
      await yieldForLoadingPaint()
      setPendingRowsForImport(selectedValidRows)
      setPendingConflicts(selectedConflictGroups)

      flushSync(() => {
        setConflictPrepMessage("Ready - opening conflict resolution...")
      })
      await sleep(500)

      setConflictModalOpen(true)
      setIsPreparingConflicts(false)
      setConflictPrepMessage("")
      return
    }

    await runChunkImport(selectedValidRows, [], selectedInvalidCount)
  }

  const handleConflictModalOpenChange = useCallback((open: boolean) => {
    setConflictModalOpen(open)
    if (!open) {
      setIsPreparingConflicts(false)
      setConflictPrepMessage("")
      setPendingRowsForImport(null)
      setPendingConflicts([])
    }
  }, [])

  const handleConfirmConflictResolution = useCallback(async (selections: Record<string, string>) => {
    if (!pendingRowsForImport || pendingConflicts.length === 0) return

    const conflictEmails = pendingConflicts.map((group) => group.email)

    const selectedRowsByEmail = new Map<
      string,
      Pick<EditableImportRow, "title" | "first_name" | "last_name" | "phone" | "country">
    >()
    pendingConflicts.forEach((group) => {
      const selectedId = selections[group.email]
      const selectedRow = group.rows.find((row) => row.id === selectedId) ?? group.rows[0]
      if (selectedRow) selectedRowsByEmail.set(group.email, selectedRow)
    })

    const resolveCustomerFields = (row: EditableImportRow): EditableImportRow => {
      const selectedForEmail = selectedRowsByEmail.get(normalizeEmail(row.email))
      if (!selectedForEmail) return row
      return {
        ...row,
        title: selectedForEmail.title,
        first_name: selectedForEmail.first_name,
        last_name: selectedForEmail.last_name,
        phone: selectedForEmail.phone,
        country: selectedForEmail.country,
      }
    }

    const resolvedRowsForImport = pendingRowsForImport.map(resolveCustomerFields)
    setRows((current) => current.map(resolveCustomerFields))
    setConflictModalOpen(false)
    setPendingRowsForImport(null)
    setPendingConflicts([])

    await runChunkImport(resolvedRowsForImport, conflictEmails, selectedInvalidCount)
  }, [pendingConflicts, pendingRowsForImport, runChunkImport, selectedInvalidCount])

  return (
    <div className="relative space-y-4">
      {(isProcessing || isSubmitting || isPreparingConflicts) && (
        <LoadingState
          variant="overlay"
          message={
            isPreparingConflicts
              ? conflictPrepMessage
              : isProcessing
                ? "Extracting rows from CSV..."
                : "Importing customers and bookings..."
          }
          progress={isSubmitting ? progressValue : undefined}
        />
      )}
      <div>
        <h2 className="text-lg font-semibold text-foreground">Supplier Leads Bulk Import</h2>
        <p className="text-sm text-muted-foreground">
          Upload one CSV file with customer details from supplier exports, review the rows, then import historical booking records.
        </p>
      </div>

      {!result ? (
        <>
          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            Required CSV fields are first name, surname/last name, and email. Supported headers include template headers and supplier headers like
            Title, Name, Surname, Contact Number, Email (Email), Country.
          </div>

      <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Supplier (optional)</p>
          <Select value={selectedSupplierId ?? SUPPLIER_NONE_VALUE} onValueChange={handleSupplierChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select supplier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SUPPLIER_NONE_VALUE}>No supplier selected</SelectItem>
              {suppliers.map((supplier) => (
                <SelectItem key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Route (optional)</p>
          <Select
            value={selectedRouteId ?? ROUTE_NONE_VALUE}
            onValueChange={handleRouteChange}
            disabled={!selectedSupplierId}
          >
            <SelectTrigger>
              <SelectValue placeholder={selectedSupplierId ? "Select route" : "Select supplier first"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ROUTE_NONE_VALUE}>No route selected</SelectItem>
              {routeOptions.map((route) => (
                <SelectItem key={route.id} value={route.id}>
                  {route.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="CSV file drop area"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer select-none flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors",
          isDragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/40",
        )}
      >
        <FileText className={cn("h-9 w-9 transition-colors", isDragOver ? "text-primary" : "text-muted-foreground")} />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            {isDragOver ? "Release to drop CSV" : "Drag & drop your CSV file"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use the template for best results:{" "}
            <a href="/customer-import-template.csv" download className="text-primary underline" onClick={(e) => e.stopPropagation()}>
              Download template
            </a>
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple={false}
        accept=".csv,text/csv"
        className="sr-only"
        onChange={handleInputChange}
        aria-hidden="true"
        tabIndex={-1}
      />

      {files.length > 0 && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{files.length} file(s) selected</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={isProcessing || isSubmitting || isPreparingConflicts}
            >
              <X className="mr-1 h-4 w-4" />
              Clear
            </Button>
          </div>
          <div className="max-h-32 space-y-1 overflow-auto">
            {files.map((selectedFile) => (
              <div key={`${selectedFile.name}-${selectedFile.size}`} className="text-xs text-muted-foreground">
                {selectedFile.name} ({formatBytes(selectedFile.size)})
              </div>
            ))}
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              Review extracted import rows ({getUniqueCustomerCount(rows)} customers, {rows.length} bookings)
            </p>
            <p className="text-xs text-muted-foreground">
              Valid selected: {selectedValidRows.length} | Invalid selected: {selectedInvalidCount}
            </p>
          </div>

          {selectedConflictGroups.length > 0 ? (
            <Alert className="border-amber-500/30 bg-amber-500/10">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertTitle>Duplicate email details detected</AlertTitle>
              <AlertDescription>
                {selectedConflictGroups.length} email{selectedConflictGroups.length === 1 ? "" : "s"} appear more than once with different details.
                Click import to resolve them before any records are sent.
              </AlertDescription>
            </Alert>
          ) : null}

          {conflictModalOpen ? (
            <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
              Conflict resolution is open. Row editing is temporarily paused to keep the modal responsive.
            </div>
          ) : (
            <ReviewTable
              rows={rows}
              selectedConflictEmailSet={selectedConflictEmailSet}
              onToggleSelected={toggleRowSelected}
              removeRow={removeRow}
            />
          )}
        </div>
      )}

          {displayPreImportCheckSummary ? (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <p className="text-sm font-medium">Pre-import customer match check</p>
              {preImportSummaryIsFrozen ? (
                <p className="text-xs text-muted-foreground">Captured before import started.</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Checked customers: {displayPreImportCheckSummary.checkedCustomers} | New customers: {displayPreImportCheckSummary.newCustomers} |
                Existing customers: {displayPreImportCheckSummary.existingCustomers}
              </p>
              {selectedRouteId && displayPreImportCheckSummary.potentialDuplicateCustomers > 0 ? (
                <Alert className="border-amber-500/30 bg-amber-500/10">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertTitle>Potential duplicate route bookings found</AlertTitle>
                  <AlertDescription>
                    {displayPreImportCheckSummary.potentialDuplicateCustomers} existing customer
                    {displayPreImportCheckSummary.potentialDuplicateCustomers === 1 ? "" : "s"} already have a historical supplier import
                    for this route. Those rows will be skipped during import.
                  </AlertDescription>
                </Alert>
              ) : null}
              {displayPreImportCheckSummary.error ? <p className="text-xs text-destructive">{displayPreImportCheckSummary.error}</p> : null}
              {isCheckingExistingCustomers ? <p className="text-xs text-muted-foreground">Checking existing customers...</p> : null}
            </div>
          ) : null}
        </>
      ) : null}

      {chunkStatuses.length > 0 ? (
        <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Import progress</p>
            <span className="text-xs text-muted-foreground">
              {completedChunks}/{chunkStatuses.length} chunks complete
            </span>
          </div>
          <Progress value={progressValue} />
          <div className="max-h-40 space-y-1 overflow-y-auto rounded border bg-background/80 p-2">
            {chunkStatuses.map((chunk) => (
              <div key={chunk.chunkNumber} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {chunk.state === "success" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  ) : chunk.state === "failed" ? (
                    <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                  ) : (
                    <Spinner className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span>
                    Chunk {chunk.chunkNumber}: {chunk.rowCount} row{chunk.rowCount === 1 ? "" : "s"}
                  </span>
                </div>
                <span className="text-muted-foreground capitalize">{chunk.state}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
          <div className="flex items-start gap-3 rounded-md border bg-background/80 p-3">
            {result.failedChunks > 0 ? (
              <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
            )}
            <div className="space-y-1">
              <p className="text-sm font-semibold">
                {result.failedChunks > 0 ? "Import partially complete" : "Import complete"}
              </p>
              <p className="text-xs text-muted-foreground">
                {result.createdCustomers} customers and {result.importedBookings} bookings imported. {result.successfulChunks}/
                {result.totalChunks} chunks succeeded.
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-md border bg-background/70 p-2">
              <p className="text-lg font-semibold text-foreground">{result.createdCustomers}</p>
              <p className="text-xs text-muted-foreground">Customers created</p>
            </div>
            <div className="rounded-md border bg-background/70 p-2">
              <p className="text-lg font-semibold text-foreground">{result.matchedCustomers}</p>
              <p className="text-xs text-muted-foreground">Duplicates matched</p>
            </div>
            <div className="rounded-md border bg-background/70 p-2">
              <p className="text-lg font-semibold text-foreground">{result.importedBookings}</p>
              <p className="text-xs text-muted-foreground">Bookings imported</p>
            </div>
            <div className="rounded-md border bg-background/70 p-2">
              <p className="text-lg font-semibold text-foreground">{result.skippedDuplicates}</p>
              <p className="text-xs text-muted-foreground">Duplicate bookings skipped</p>
            </div>
            <div className="rounded-md border bg-background/70 p-2">
              <p className="text-lg font-semibold text-foreground">{result.enrichedProfiles}</p>
              <p className="text-xs text-muted-foreground">Profiles enriched</p>
            </div>
            <div className="rounded-md border bg-background/70 p-2">
              <p className="text-lg font-semibold text-foreground">{result.skippedInvalid}</p>
              <p className="text-xs text-muted-foreground">Invalid skipped</p>
            </div>
          </div>

          {result.conflictEmails.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Duplicate emails with differing details: {result.conflictEmails.length}. The selected version was used for each customer record.
              </p>
              <p className="break-all text-xs">
                {result.conflictEmails.map((email) => (
                  <Link key={email} href={`/app/customers?search=${encodeURIComponent(email)}`} className="text-primary underline mr-2">
                    {email}
                  </Link>
                ))}
              </p>
            </div>
          ) : null}

          {result.chunkErrors.length > 0 ? (
            <div className="space-y-1 rounded border border-destructive/20 bg-destructive/5 p-2">
              {result.chunkErrors.map((error) => (
                <p key={error.chunkNumber} className="text-xs text-destructive">
                  Chunk {error.chunkNumber}: {error.message}
                </p>
              ))}
            </div>
          ) : null}

        </div>
      ) : null}

      {result ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {retryableChunks.length > 0 ? (
              <Button
                size="sm"
                variant="outline"
                disabled={isSubmitting || isPreparingConflicts}
                onClick={handleRetryFailedChunks}
              >
                Retry failed chunks
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Import finished. You can review customers now or start another import.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/app/customers">View Customers</Link>
            </Button>
            <Button size="sm" onClick={handleReset}>
              Start New Import
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={files.length === 0 || isProcessing || isSubmitting || isPreparingConflicts}
            onClick={handlePrepareRows}
          >
            {isProcessing ? (
              <>
                <Spinner className="size-4" aria-hidden="true" />
                Processing...
              </>
            ) : (
              "Extract Rows"
            )}
          </Button>
          <Button
            size="sm"
            disabled={selectedValidRows.length === 0 || isSubmitting || isProcessing || isPreparingConflicts}
            onClick={handleImport}
          >
            {isSubmitting || isPreparingConflicts ? (
              <>
                <Spinner className="size-4" aria-hidden="true" />
                {isPreparingConflicts ? "Preparing conflict resolution..." : "Importing customers and bookings..."}
              </>
            ) : (
              "Import Customers"
            )}
          </Button>
        </div>
      )}

      <ImportConflictResolutionModal
        open={conflictModalOpen}
        conflicts={pendingConflicts}
        onOpenChange={handleConflictModalOpenChange}
        onConfirm={handleConfirmConflictResolution}
      />
    </div>
  )
}
