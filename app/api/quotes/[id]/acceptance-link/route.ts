import { NextRequest } from "next/server"
import { requireRole } from "@/lib/api/auth"
import { jsonError, safeSupabaseError } from "@/lib/api/responses"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { supabase } = auth.value
  const { id } = await params

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, status, validity_until, quote_number")
    .eq("id", id)
    .single()

  if (quoteError || !quote) {
    return jsonError("Quote not found", 404)
  }

  if (quote.status !== "sent") {
    return jsonError("Acceptance links can only be generated for sent quotes", 400)
  }

  if (!quote.validity_until) {
    return jsonError("Quote has no validity date", 400)
  }

  const today = new Date().toISOString().slice(0, 10)
  if (quote.validity_until < today) {
    return jsonError("Quote has expired — revise it before generating an acceptance link", 400)
  }

  // Invalidate any existing unused token for this quote
  await supabase
    .from("quote_acceptance_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("quote_id", id)
    .is("used_at", null)

  const expiresAt = new Date(`${quote.validity_until}T23:59:59Z`).toISOString()

  const { data: token, error: tokenError } = await supabase
    .from("quote_acceptance_tokens")
    .insert({
      quote_id: id,
      expires_at: expiresAt,
      created_by: auth.value.user.id,
    })
    .select("id, token, expires_at")
    .single()

  if (tokenError || !token) {
    return safeSupabaseError("acceptance-link:insert-token", tokenError)
  }

  const origin = req.headers.get("origin") ?? req.nextUrl.origin
  const url = `${origin}/accept-quote/${token.token}`

  return Response.json({
    url,
    token: token.token,
    expiresAt: token.expires_at,
    quoteNumber: quote.quote_number,
  })
}
