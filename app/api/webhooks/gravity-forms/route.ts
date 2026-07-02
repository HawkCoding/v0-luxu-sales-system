import { NextResponse } from "next/server"
import { createHash, timingSafeEqual } from "node:crypto"
import { createServiceClient } from "@/lib/supabase/server"
import { logError } from "@/lib/error-log"
import type { Json } from "@/lib/supabase/types"

function secretsMatch(provided: string, expected: string): boolean {
  const providedHash = createHash("sha256").update(provided).digest()
  const expectedHash = createHash("sha256").update(expected).digest()
  return timingSafeEqual(providedHash, expectedHash)
}

function extractFormId(payload: Json): string | null {
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "form_id" in payload) {
    const value = (payload as Record<string, unknown>).form_id
    return value == null ? null : String(value)
  }
  return null
}

// Raw intake only — field-to-column mapping into customers/bookings is a
// follow-up once the web dev confirms each form's field-ID layout.
export async function POST(request: Request): Promise<Response> {
  const expectedSecret = process.env.GRAVITY_FORMS_WEBHOOK_SECRET
  const providedSecret = request.headers.get("x-webhook-secret")

  if (!expectedSecret || !providedSecret || !secretsMatch(providedSecret, expectedSecret)) {
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
