import { NextResponse } from "next/server"
import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { buildPackageQuoteLineItems } from "@/lib/quotes/build-from-package"
import { loadPackageDetail } from "../helpers"

const applyPackageSchema = z.object({
  jobId: z.string().uuid(),
  quoteId: z.string().uuid(),
  travelDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  selections: z.array(
    z.object({
      legId: z.string().uuid(),
      selected: z.boolean().default(true),
      routeId: z.string().uuid().optional(),
      suiteTypeId: z.string().uuid().optional(),
    }),
  ).default([]),
})

interface RouteParams {
  params: Promise<{ slug: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { supabase } = auth.value
  const { slug } = await params

  let parsed: z.infer<typeof applyPackageSchema>
  try {
    parsed = applyPackageSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const existing = await loadPackageDetail(supabase, slug)
  if ("error" in existing) {
    return existing.error!
  }

  try {
    const { lineItems } = await buildPackageQuoteLineItems({
      supabase,
      packageDetail: existing.detail,
      jobId: parsed.jobId,
      travelDate: parsed.travelDate,
      selections: parsed.selections,
    })

    return NextResponse.json({ lineItems })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build package line items"
    const status = message === "Job not found" ? 404 : 400

    return NextResponse.json({ error: message }, { status })
  }
}
