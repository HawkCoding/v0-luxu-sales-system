import { NextResponse } from "next/server"
import { isAuthorizedWebhookRequest } from "@/lib/api/webhook-secret"
import { createServiceClient } from "@/lib/supabase/server"
import { logError } from "@/lib/error-log"
import type { Json } from "@/lib/supabase/types"

function extractFormId(payload: Json): string | null {
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "form_id" in payload) {
    const value = (payload as Record<string, unknown>).form_id
    return value == null ? null : String(value)
  }
  return null
}

// Raw intake only — field-to-column mapping into customers/bookings is a
// follow-up once the web dev confirms each form's field-ID layout.
//
// Parked as of 2026-08: the primary inbound channel is the Gravity Forms *email* notification,
// parsed by lib/import/parseEmailDraft.ts and imported by lib/inbound-email/sync.ts. This webhook
// receives the exact same submission over HTTP instead of email, but nothing maps its stored rows
// into customers/bookings yet (see gravity_forms_submissions migration), so it's disabled by
// default to keep it from having any effect on the system. Revisit within the next month or two;
// until then it 404s unless GRAVITY_FORMS_WEBHOOK_ENABLED=true is explicitly set.
export async function POST(request: Request): Promise<Response> {
  if (process.env.GRAVITY_FORMS_WEBHOOK_ENABLED !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (!isAuthorizedWebhookRequest(request, process.env.GRAVITY_FORMS_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let payload: Json
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const formId = extractFormId(payload)

  try {
    const supabase = createServiceClient()
    const { error } = await supabase.from("gravity_forms_submissions").insert({
      form_id: formId,
      payload,
    })

    if (error) throw error

    return NextResponse.json({ received: true }, { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to store Gravity Forms submission"
    void logError({
      severity: "Critical",
      source: "gravity-forms-webhook",
      message,
      details: { formId },
    })
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
