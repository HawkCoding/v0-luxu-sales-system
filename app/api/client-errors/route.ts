import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"
import { logError } from "@/lib/error-log"

/**
 * Sink for browser-side errors. Without this the app has no client-side error
 * trail at all, so a UI lockup or render crash has to be reconstructed from
 * audit-log timestamps after the fact.
 */
const clientErrorSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  stack: z.string().max(20_000).optional(),
  url: z.string().max(2000).optional(),
  componentStack: z.string().max(20_000).optional(),
})

export async function POST(request: Request) {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = clientErrorSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid error report" }, { status: 400 })
  }

  await logError({
    severity: "Warning",
    source: "client",
    message: parsed.data.message,
    details: {
      userId: user.id,
      url: parsed.data.url ?? null,
      stack: parsed.data.stack ?? null,
      componentStack: parsed.data.componentStack ?? null,
      userAgent: request.headers.get("user-agent"),
    },
  })

  return NextResponse.json({ ok: true })
}
