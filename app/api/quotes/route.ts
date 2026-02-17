import { NextResponse } from "next/server"
import { getStore, nextId } from "@/lib/store"

export async function POST(req: Request) {
  const body = await req.json()
  const store = getStore()

  const quote = {
    id: nextId("q"),
    itineraryId: body.itineraryId,
    jobId: body.jobId,
    status: body.status || "draft" as const,
    validityUntil: body.validityUntil || new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
    lineItems: body.lineItems || [],
    subtotal: body.subtotal || 0,
    vat: body.vat || 0,
    total: body.total || 0,
  }
  store.quotes.push(quote as any)
  return NextResponse.json(quote)
}
