import { NextResponse } from "next/server"
import {
  auditListQuerySchema,
  listAuditLogs,
  requireAuditAccess,
} from "@/lib/audit"
import { exportAuditToCsv } from "@/lib/export-audit"
import type { AuditLog } from "@/lib/types"

const EXPORT_PAGE_SIZE = 250
const MAX_EXPORT_ROWS = 10000

export async function GET(req: Request) {
  const auth = await requireAuditAccess()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const parsed = auditListQuerySchema.safeParse({
    ...Object.fromEntries(url.searchParams),
    page: 1,
    pageSize: EXPORT_PAGE_SIZE,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid audit export query", details: parsed.error.flatten() }, { status: 400 })
  }

  const logs: AuditLog[] = []
  let page = 1
  let total = 0

  try {
    do {
      const result = await listAuditLogs(auth.value, {
        ...parsed.data,
        page,
        pageSize: EXPORT_PAGE_SIZE,
      })

      total = result.total
      logs.push(...result.logs)
      page += 1
    } while (logs.length < total && logs.length < MAX_EXPORT_ROWS)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export audit logs" },
      { status: 500 },
    )
  }

  const csv = exportAuditToCsv(logs.slice(0, MAX_EXPORT_ROWS))
  const filenameScope = parsed.data.scope === "archive" ? "audit-archive" : "audit-active"

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameScope}-${Date.now()}.csv"`,
      "X-Audit-Export-Total": String(total),
      "X-Audit-Export-Limit": String(MAX_EXPORT_ROWS),
    },
  })
}
