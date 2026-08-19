import { NextResponse } from "next/server"
import { requireSettingsWrite } from "@/lib/settings-access"

// Most-recent-first log of what a mailbox sync actually did with each message, including which
// body part it read (body_part) and a preview of whichever candidate lost (alt_body_preview) --
// see 20260818150000_inbound_email_body_part.sql. Without this, diagnosing a mailbox-shaped
// parsing regression meant reading raw_text off an already-created booking by hand.
const MESSAGE_LOG_LIMIT = 25

function mapMessage(row: {
  id: string
  uid: number
  subject: string
  from_address: string | null
  received_at: string | null
  status: string
  filing_status: string
  body_part: string | null
  alt_body_preview: string | null
  missing_fields: string[] | null
  warnings: string[] | null
  error: string | null
  booking_id: string | null
  created_at: string
}) {
  return {
    id: row.id,
    uid: row.uid,
    subject: row.subject,
    fromAddress: row.from_address,
    receivedAt: row.received_at,
    status: row.status,
    filingStatus: row.filing_status,
    bodyPart: row.body_part,
    // Trimmed further for the settings list -- the full alt_body_preview (up to 5000 chars) is a
    // diagnostic artifact meant for a direct DB query, not this summary view.
    altBodyExcerpt: row.alt_body_preview ? row.alt_body_preview.slice(0, 300) : null,
    missingFields: row.missing_fields ?? [],
    warnings: row.warnings ?? [],
    error: row.error,
    bookingId: row.booking_id,
    createdAt: row.created_at,
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requireSettingsWrite()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.value.supabase
    .from("inbound_email_messages")
    .select(
      "id, uid, subject, from_address, received_at, status, filing_status, body_part, alt_body_preview, missing_fields, warnings, error, booking_id, created_at",
    )
    .eq("email_account_id", id)
    .order("created_at", { ascending: false })
    .limit(MESSAGE_LOG_LIMIT)

  if (error) {
    return NextResponse.json({ error: "Failed to load message log" }, { status: 500 })
  }

  return NextResponse.json({ messages: (data ?? []).map(mapMessage) })
}
