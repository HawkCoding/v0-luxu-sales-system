import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import { parseEmailDraft } from "@/lib/import/parseEmailDraft"
import { assessEnquiryPlausibility, getEmailImportReviewMetadata } from "@/lib/inbound-email/review"
import { createEmailBookingFromParsedDraft } from "@/lib/inbound-email/import-booking"
import { createServiceClient } from "@/lib/supabase/server"
import { requireAdminSettingsAccess } from "@/lib/settings-access"

const DEMO_ACCOUNT_ID = "00000000-0000-0000-0000-00000000ea01"
const FIXTURE_PATH = path.join(
  process.cwd(),
  "supabase/seeds/inbound-email-fixtures/new-enquiry.json",
)

export async function POST(): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // The production guard alone let anyone who could reach a dev or preview host write real
  // customers, bookings and quotes with no login at all. Same admin gate as every other inbound-
  // email endpoint -- it writes the same rows the real importer does.
  const auth = await requireAdminSettingsAccess()
  if (!auth.ok) return auth.response

  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as {
    from: string
    to: string
    subject: string
    text: string
    html: string
    date: string
  }

  const supabase = createServiceClient()
  const { data: trainOperators } = await supabase
    .from("suppliers")
    .select("name")
    .eq("kind", "train_operator")
    .eq("active", true)

  const rawText = fixture.text || ""
  const parsedDraft = parseEmailDraft(rawText, {
    trainOperatorNames: (trainOperators ?? []).map((row) => row.name),
  })
  const review = getEmailImportReviewMetadata(parsedDraft)

  // Same content gate as the real sync path, so replaying a fixture behaves like receiving it.
  const plausibility = assessEnquiryPlausibility(parsedDraft)
  if (!plausibility.importable) {
    return NextResponse.json(
      { skipped: true, reason: plausibility.reason, completed: plausibility.completed },
      { status: 200 },
    )
  }

  const created = await createEmailBookingFromParsedDraft(parsedDraft, {
    emailAccountId: DEMO_ACCOUNT_ID,
    mailboxEmail: fixture.to,
    subject: fixture.subject,
    receivedAt: fixture.date,
    rawText,
    missingFields: review.missingFields,
    warnings: review.warnings,
  })

  return NextResponse.json({
    jobId: created.id,
    bookingNumber: created.bookingNumber,
    duplicateOf: created.duplicateOfBookingId,
  })
}