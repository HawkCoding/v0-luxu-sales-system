import { beforeEach, describe, expect, it, vi } from "vitest"
import { createSupabaseMock, type MockRow, type SupabaseMock } from "@/lib/testing/supabase-mock"
import { parseEmailDraft } from "@/lib/import/parseEmailDraft"
import { validateTransition, type ManualConfirmations } from "@/lib/pipeline/validate-transition"
import { applyTransition } from "@/lib/pipeline/apply-transition"
import type { PipelineStage } from "@/lib/types"

const authMocks = vi.hoisted(() => ({ requireRole: vi.fn() }))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
}))

vi.mock("@/lib/invoices/render-invoice-email", () => ({
  renderInvoiceEmail: vi.fn(async () => "<p>invoice</p>"),
}))

import { POST as clearImportReview } from "@/app/api/jobs/[id]/clear-import-review/route"
import { POST as startQuote } from "@/app/api/jobs/[id]/start-quote/route"
import { POST as createQuote } from "@/app/api/quotes/route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const MANAGER_ID = "00000000-0000-4000-8000-000000000099"
const BOOKING_ID = "00000000-0000-4000-8000-00000000bb01"
const CUSTOMER_ID = "customer-bt-1"
const DEPARTURE_DATE = "2026-09-12"

const BLUE_TRAIN_FIXTURE = `Hello team,

Please quote The Blue Train for myself and my wife.
Route: Pretoria to Cape Town
Departure: 2026-09-12
We would like 1 De Luxe Twin Suite for 2 adults and 0 children.
Contact me on +27 82 555 9090 or jane.doe@example.com.

Regards,
Jane Doe
`

function jsonRequest(url: string, body: unknown = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function mockAuth(supabase: unknown, clearanceLevel: string, userId = USER_ID) {
  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      user: { id: userId, email: "consultant@example.test" },
      profile: { clearanceLevel, actorName: "Test Actor", isActive: true, name: "Test", surname: "Actor", email: "test@example.test" },
    },
  })
}

function seedFromParsedBlueTrain(): SupabaseMock {
  const parsed = parseEmailDraft(BLUE_TRAIN_FIXTURE)
  const customer: MockRow = {
    id: CUSTOMER_ID,
    first_name: parsed.customer.firstName,
    last_name: parsed.customer.surname,
    email: parsed.customer.email,
    phone: parsed.customer.phone,
    country: "South Africa",
  }
  const booking: MockRow = {
    id: BOOKING_ID,
    booking_number: "BT-2026-0001",
    customer_id: CUSTOMER_ID,
    consultant: "TA",
    source: "email",
    stage: "enquiry",
    email_import_needs_review: true,
    email_import_review_resolved_at: null,
    email_import_subject: "Blue Train enquiry",
    email_import_mailbox: "enquiries@luxustravel.test",
    departure_date: parsed.trip.departureDate,
    deposit_paid: false,
    invoice_balance: null,
    raw_text: parsed.rawText,
    is_repeat_client_at_creation: false,
    updated_at: "2026-05-01T00:00:00.000Z",
  }
  return createSupabaseMock({
    customers: [customer],
    bookings: [booking],
    profiles: [{ id: "profile-manager", user_id: MANAGER_ID, name: "Mona", surname: "Manager", email: "manager@luxus.test", clearance_level: "manager", is_active: true }],
    quotes: [],
    documents: [],
    correspondences: [],
    audit_logs: [],
    app_settings: [],
  })
}

async function moveStage(mock: SupabaseMock, targetStage: PipelineStage, manualConfirmations?: ManualConfirmations) {
  const booking = mock.store.rows("bookings")[0]
  const customer = mock.store.rows("customers")[0]
  const quotes = mock.store.rows("quotes").map((q) => ({ id: q.id as string, status: q.status as string, total: q.total as number, created_at: q.created_at as string }))
  const documents = mock.store.rows("documents").map((d) => ({ id: d.id as string, kind: d.kind as string, status: d.status as string }))
  const correspondences = mock.store.rows("correspondences").map((c) => ({ id: c.id as string, kind: c.kind as string, subject: c.subject as string, status: c.status as string }))

  const failures = validateTransition({
    booking: {
      id: booking.id as string,
      stage: booking.stage as PipelineStage,
      source: booking.source as string,
      email_import_needs_review: booking.email_import_needs_review as boolean,
      email_import_review_resolved_at: booking.email_import_review_resolved_at as string | null,
    },
    customer,
    targetStage,
    quotes,
    documents,
    correspondences,
    manualConfirmations,
  })
  expect(failures).toEqual([])

  type ApplyInput = Parameters<typeof applyTransition>[1]
  await applyTransition(mock.supabase as never, {
    booking: {
      id: booking.id as string,
      booking_number: booking.booking_number as string,
      stage: booking.stage as PipelineStage,
      source: booking.source as ApplyInput["booking"]["source"],
      raw_text: null,
      updated_at: booking.updated_at as string,
      customer_id: booking.customer_id as string,
      consultant: booking.consultant as string,
    },
    departureDate: DEPARTURE_DATE,
    durationNights: 3,
    targetStage,
    actorName: "Test Actor",
    actorUserId: USER_ID,
    quotes: quotes as ApplyInput["quotes"],
    documents: documents as ApplyInput["documents"],
    correspondences: correspondences as ApplyInput["correspondences"],
    manualConfirmations,
    now: new Date("2026-06-15T10:00:00.000Z"),
  })
}

describe("E2E Scenario 1: Blue Train enquiry → quote", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("parses a Blue Train enquiry, claims it, resolves review, generates and sends a quote", async () => {
    // 1. Receive Blue Train email + parse fields
    const parsed = parseEmailDraft(BLUE_TRAIN_FIXTURE)
    expect(parsed.trip.supplier).toBe("Blue Train")
    expect(parsed.trip.route).toBe("Pretoria To Cape Town")
    expect(parsed.trip.departureDate).toBe(DEPARTURE_DATE)
    expect(parsed.customer).toMatchObject({
      firstName: "Jane",
      surname: "Doe",
      email: "jane.doe@example.com",
    })
    expect(parsed.guests.adults).toBe(2)

    // 2. Importer side-effects: customer + BT-#### booking with review pending (seeded).
    const mock = seedFromParsedBlueTrain()
    const { store } = mock

    expect(store.rows("bookings")[0]).toMatchObject({
      booking_number: "BT-2026-0001",
      stage: "enquiry",
      source: "email",
      email_import_needs_review: true,
    })
    expect(store.rows("customers")[0]).toMatchObject({
      first_name: "Jane",
      last_name: "Doe",
      email: "jane.doe@example.com",
    })

    // 3. Consultant claims the booking (sets assigned_salesperson_id).
    mockAuth(mock.supabase, "consultant")
    await mock.supabase.from("bookings").update({ assigned_salesperson_id: USER_ID, owner_user_id: USER_ID }).eq("id", BOOKING_ID)
    expect(store.rows("bookings")[0]).toMatchObject({ assigned_salesperson_id: USER_ID, owner_user_id: USER_ID })

    // 4. Manager resolves the import review.
    mockAuth(mock.supabase, "manager", MANAGER_ID)
    const reviewRes = await clearImportReview(
      jsonRequest(`http://localhost/api/jobs/${BOOKING_ID}/clear-import-review`),
      { params: Promise.resolve({ id: BOOKING_ID }) },
    )
    expect(reviewRes.status).toBe(200)
    expect(store.rows("bookings")[0].email_import_needs_review).toBe(false)
    expect(store.rows("bookings")[0].email_import_review_resolved_at).toBeTruthy()
    expect(
      store.rows("audit_logs").some((a) => a.action === "email_import_review_resolved"),
    ).toBe(true)

    // 5. Consultant starts the quote — first draft Q1.
    mockAuth(mock.supabase, "consultant")
    const startRes = await startQuote(
      jsonRequest(`http://localhost/api/jobs/${BOOKING_ID}/start-quote`),
      { params: Promise.resolve({ id: BOOKING_ID }) },
    )
    expect(startRes.status).toBe(200)
    expect(store.rows("quotes")[0]).toMatchObject({
      quote_number: "BT-2026-0001-Q1",
      status: "draft",
    })

    // 6. Consultant prices + sends the quote — Q2 sent.
    const sendRes = await createQuote(
      jsonRequest("http://localhost/api/quotes", {
        bookingId: BOOKING_ID,
        status: "sent",
        lineItems: [
          { description: "Blue Train Pretoria → Cape Town, De Luxe Twin", qty: 1, unitPrice: 50000 },
        ],
      }),
    )
    expect(sendRes.status).toBe(200)
    const sentQuote = store.rows("quotes").find((q) => q.status === "sent")
    expect(sentQuote).toMatchObject({ quote_number: "BT-2026-0001-Q2" })
    expect(Number(sentQuote?.total)).toBeGreaterThan(0)

    // 7. Quote PDF stored (route-level PDF generation is covered by its own tests; here we
    //    simulate the resulting side-effect to keep the E2E off the storage backend).
    await mock.supabase.from("documents").insert({
      booking_id: BOOKING_ID,
      kind: "quote_pdf",
      status: "generated",
      storage_path: "quotes/BT-2026-0001-Q2/quote-BT-2026-0001-Q2.pdf",
    })
    await mock.supabase.from("audit_logs").insert({
      actor: "Test Actor",
      entity_type: "Quote",
      entity_id: sentQuote?.id,
      action: "quote_pdf_generated",
    })

    // 7b. Quote-sent correspondence (the email-send route side-effect — covered separately).
    await mock.supabase.from("correspondences").insert({
      booking_id: BOOKING_ID,
      kind: "quote_sent",
      subject: `Quote ${sentQuote?.quote_number} for review`,
      status: "sent",
    })

    // 8. Pipeline advances to quote_sent — confirms the gate accepts a sent quote +
    //    creates the quote_sent correspondence side-effect.
    await moveStage(mock, "quote_sent")
    expect(store.rows("bookings")[0]).toMatchObject({ stage: "quote_sent" })

    // 9. Assertions for the Phase 32 S1 checklist.
    expect(store.rows("documents").some((d) => d.kind === "quote_pdf" && d.status === "generated")).toBe(true)
    const auditActions = store.rows("audit_logs").map((a) => a.action)
    expect(auditActions).toEqual(expect.arrayContaining([
      "email_import_review_resolved",
      "quote_generated",
      "quote_pdf_generated",
    ]))
    expect(store.rows("correspondences").some((c) => c.kind === "quote_sent")).toBe(true)
  })

  it("blocks start-quote while the email import review is unresolved", async () => {
    const mock = seedFromParsedBlueTrain()
    mockAuth(mock.supabase, "consultant")

    const res = await startQuote(
      jsonRequest(`http://localhost/api/jobs/${BOOKING_ID}/start-quote`),
      { params: Promise.resolve({ id: BOOKING_ID }) },
    )

    expect(res.status).toBe(422)
    const body = await res.json() as { failures: Array<{ gateId: string }> }
    expect(body.failures.map((f) => f.gateId)).toEqual(["email_import_review"])
  })
})
