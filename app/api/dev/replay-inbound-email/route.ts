import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import { parseEmailDraft } from "@/lib/import/parseEmailDraft"
import { assessEnquiryPlausibility, getEmailImportReviewMetadata } from "@/lib/inbound-email/review"
import { createEmailBookingFromParsedDraft } from "@/lib/inbound-email/import-booking"
import { createServiceClient } from "@/lib/supabase/server"
import { requireSettingsWrite } from "@/lib/settings-access"

const DEMO_ACCOUNT_ID = "00000000-0000-0000-0000-00000000ea01"
const FIXTURE_DIR = path.join(process.cwd(), "supabase/seeds/inbound-email-fixtures")
const DEFAULT_FIXTURE = "new-enquiry"

/** Fixture name from the request body, restricted to a bare file stem so the path can't escape
 *  the fixture directory. Anything else falls back to the default. */
function resolveFixturePath(name: unknown): string {
  const stem = typeof name === "string" && /^[a-z0-9-]+$/i.test(name) ? name : DEFAULT_FIXTURE
  return path.join(FIXTURE_DIR, `${stem}.json`)
}

export async function POST(req: Request): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // The production guard alone let anyone who could reach a dev or preview host write real
  // customers, bookings and quotes with no login at all. Same admin gate as every other inbound-
  // email endpoint -- it writes the same rows the real importer does.
  const auth = await requireSettingsWrite()
  if (!auth.ok) return auth.response

  const body = await req.json().catch(() => ({}) as Record<string, unknown>)
  const fixturePath = resolveFixturePath((body as { fixture?: unknown }).fixture)
  if (!fs.existsSync(fixturePath)) {
    return NextResponse.json({ error: "Fixture not found" }, { status: 404 })
  }

  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as {
    from: string
    to: string
    subject: string
    text: string
    html: string
    date: string
  }

  const supabase = createServiceClient()
  // Same pool and the same subject scan the real sync path uses -- a fixture whose supplier is
  // named only in the subject (every Kruger Shalati enquiry) must behave here as it does live.
  const { data: standaloneSupplierRows } = await supabase
    .from("suppliers")
    .select("name, kind, email_match_phrases")
    .eq("sells_standalone", true)
    .eq("active", true)

  const rawText = fixture.text || ""
  const parsedDraft = parseEmailDraft(rawText, {
    subject: fixture.subject,
    standaloneSuppliers: (standaloneSupplierRows ?? []).map((row) => ({
      name: row.name,
      kind: row.kind,
      emailMatchPhrases: row.email_match_phrases,
    })),
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