import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import { parseEmailDraft } from "@/lib/import/parseEmailDraft"
import { getEmailImportReviewMetadata } from "@/lib/inbound-email/review"
import { createEmailBookingFromParsedDraft } from "@/lib/inbound-email/import-booking"
import { createServiceClient } from "@/lib/supabase/server"

const DEMO_ACCOUNT_ID = "00000000-0000-0000-0000-00000000ea01"
const FIXTURE_PATH = path.join(
  process.cwd(),
  "supabase/seeds/inbound-email-fixtures/new-enquiry.json",
)

export async function POST(): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

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