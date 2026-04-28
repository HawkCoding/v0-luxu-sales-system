import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"

const lineItemSchema = z.object({
  description: z.string().min(1),
  qty: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  total: z.number().nonnegative(),
})

const patchQuoteSchema = z.object({
  lineItems: z.array(lineItemSchema).min(1),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  let parsed
  try {
    parsed = patchQuoteSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id")
    .eq("id", id)
    .single()

  if (quoteError || !quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 })
  }

  const { error: deleteError } = await supabase
    .from("quote_line_items")
    .delete()
    .eq("quote_id", id)

  if (deleteError) {
    return NextResponse.json({ error: "Failed to replace line items" }, { status: 500 })
  }

  const { error: insertError } = await supabase.from("quote_line_items").insert(
    parsed.lineItems.map((li, idx) => ({
      quote_id: id,
      description: li.description,
      qty: li.qty,
      unit_price: li.unitPrice,
      total: li.total,
      sort_order: idx,
    })),
  )

  if (insertError) {
    return NextResponse.json({ error: "Failed to insert line items" }, { status: 500 })
  }

  const subtotal = parsed.lineItems.reduce((sum, li) => sum + li.total, 0)
  const vat = Math.round(subtotal * 0.15 * 100) / 100
  const total = Math.round((subtotal + vat) * 100) / 100

  const { error: updateError } = await supabase
    .from("quotes")
    .update({ subtotal, vat, total })
    .eq("id", id)

  if (updateError) {
    return NextResponse.json({ error: "Failed to update quote totals" }, { status: 500 })
  }

  return NextResponse.json({ id, subtotal, vat, total, lineItems: parsed.lineItems })
}
