import { beforeEach, describe, expect, it, vi } from "vitest"
import { createSupabaseMock, type MockRow, type MockQueryBuilder } from "@/lib/testing/supabase-mock"
import type { CreatedEmailBooking } from "@/lib/inbound-email/import-booking"
import type { ErrorLogInput } from "@/lib/error-log"

const syncMocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  logError: vi.fn(async (_input: ErrorLogInput) => {}),
  createEmailBookingFromParsedDraft: vi.fn(),
  assessEnquiryPlausibility: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: syncMocks.createServiceClient,
}))

vi.mock("@/lib/error-log", () => ({
  logError: syncMocks.logError,
}))

vi.mock("@/lib/inbound-email/crypto", () => ({
  decryptCredential: vi.fn(() => "decrypted-password"),
}))

vi.mock("@/lib/inbound-email/import-booking", () => ({
  createEmailBookingFromParsedDraft: syncMocks.createEmailBookingFromParsedDraft,
}))

vi.mock("@/lib/import/parseEmailDraft", () => ({
  parseEmailDraft: vi.fn(() => ({})),
}))

vi.mock("@/lib/inbound-email/review", () => ({
  getEmailImportReviewMetadata: vi.fn(() => ({ missingFields: [], warnings: [] })),
  assessEnquiryPlausibility: syncMocks.assessEnquiryPlausibility,
}))

// --- Fake IMAP server -------------------------------------------------------
//
// Mirrors just enough of imapflow's surface for sync.ts, and actively enforces the constraint
// documented at node_modules/imapflow/lib/imap-flow.js:2769 ("You can not run any IMAP commands
// in [the fetch] loop") by throwing if any other command runs while a fetch() generator is open.
// That's the exact bug this rewrite fixes, so it's worth asserting directly rather than only
// checking the end state.

interface FakeMessage {
  uid: number
  source: Buffer
  /** IMAP INTERNALDATE -- what the server recorded when the message arrived, independent of the
   *  message's own `Date:` header. */
  internalDate?: Date
}

interface FakeMailboxState {
  uidValidity: bigint
  /** If set, mailboxOpen consumes these in order (one per call) before falling back to uidValidity
   *  -- lets a test simulate the mailbox being recreated between the collect and filing phases,
   *  which happen as two separate connections within one syncInboundEmailAccount call. */
  uidValiditySequence?: bigint[]
  inbox: Map<number, FakeMessage>
  folders: Map<string, FakeMessage[]>
}

interface FakeBehavior {
  failConnect?: boolean
  failMoveToFolder?: string
  /** UIDs the server yields with no source at all -- a real, observed IMAP behaviour that used to
   *  make the message vanish without a row. */
  dropSourceForUids?: number[]
}

function connectionLostError(): Error {
  const error = new Error("Connection not available") as Error & { code: string }
  error.code = "NoConnection"
  return error
}

class FakeImapClient {
  usable = true
  private fetchOpen = false

  constructor(
    private readonly state: FakeMailboxState,
    private readonly behavior: FakeBehavior,
  ) {}

  private guard(op: string): void {
    if (this.fetchOpen) {
      throw new Error(`IMAP command "${op}" issued while a fetch() generator was still open`)
    }
  }

  async connect(): Promise<void> {
    this.guard("connect")
    if (this.behavior.failConnect) throw connectionLostError()
  }

  async mailboxCreate(_folder: string): Promise<void> {
    this.guard("mailboxCreate")
  }

  async mailboxOpen(path: string): Promise<{ path: string; uidValidity: bigint }> {
    this.guard("mailboxOpen")
    const uidValidity = this.state.uidValiditySequence?.length
      ? this.state.uidValiditySequence.shift()!
      : this.state.uidValidity
    return { path, uidValidity }
  }

  async search(query: { uid?: string | number }, _opts?: { uid?: boolean }): Promise<number[] | false> {
    this.guard("search")
    const uidQuery = query.uid
    if (typeof uidQuery !== "string") return [...this.state.inbox.keys()].sort((a, b) => a - b)

    if (uidQuery.includes(":")) {
      const [startRaw, endRaw] = uidQuery.split(":")
      const start = Number(startRaw)
      const end = endRaw === "*" ? Infinity : Number(endRaw)
      return [...this.state.inbox.keys()].filter((uid) => uid >= start && uid <= end).sort((a, b) => a - b)
    }

    const wanted = new Set(uidQuery.split(",").map(Number))
    return [...this.state.inbox.keys()].filter((uid) => wanted.has(uid)).sort((a, b) => a - b)
  }

  async *fetch(
    range: number[],
    _query: unknown,
    _opts?: { uid?: boolean },
  ): AsyncGenerator<{ uid: number; source?: Buffer; internalDate?: Date }> {
    this.fetchOpen = true
    try {
      for (const uid of range) {
        const message = this.state.inbox.get(uid)
        if (!message) continue
        if (this.behavior.dropSourceForUids?.includes(uid)) {
          yield { uid, internalDate: message.internalDate }
          continue
        }
        yield { uid, source: message.source, internalDate: message.internalDate }
      }
    } finally {
      this.fetchOpen = false
    }
  }

  async messageFlagsAdd(_range: number[], _flags: string[], _opts?: { uid?: boolean }): Promise<boolean> {
    this.guard("messageFlagsAdd")
    return true
  }

  async messageMove(range: number[], destination: string, _opts?: { uid?: boolean }): Promise<{ path: string }> {
    this.guard("messageMove")
    if (this.behavior.failMoveToFolder === destination) throw connectionLostError()

    for (const uid of range) {
      const message = this.state.inbox.get(uid)
      if (!message) continue
      this.state.inbox.delete(uid)
      const bucket = this.state.folders.get(destination) ?? []
      bucket.push(message)
      this.state.folders.set(destination, bucket)
    }
    return { path: destination }
  }

  async list(): Promise<unknown[]> {
    this.guard("list")
    return []
  }

  async logout(): Promise<void> {
    this.usable = false
  }

  close(): void {
    this.usable = false
  }
}

let mailboxState: FakeMailboxState
let imapBehavior: FakeBehavior

vi.mock("imapflow", () => ({
  // `new ImapFlow(...)` requires a real constructor function -- an arrow function passed to
  // mockImplementation can't be invoked with `new` at all (TypeError: not a constructor).
  ImapFlow: vi.fn().mockImplementation(function ImapFlowMock() {
    return new FakeImapClient(mailboxState, imapBehavior)
  }),
}))

import { syncInboundEmailAccount, type EmailSyncSummary } from "./sync"

// --- Fixtures ----------------------------------------------------------------

/** `date: null` builds a message with no `Date:` header at all -- the case INTERNALDATE covers. */
function rawEmail(opts: {
  subject: string
  from?: string
  date?: Date | null
  text?: string
  /** Omitted by default -- most tests exercise the UID path, not Message-ID dedupe. */
  messageId?: string
}): Buffer {
  const date = opts.date === null ? null : opts.date ?? new Date("2026-08-01T10:00:00Z")
  return Buffer.from(
    [
      `From: ${opts.from ?? "Jane Doe <jane@example.com>"}`,
      "To: bookings@example.com",
      `Subject: ${opts.subject}`,
      ...(opts.messageId ? [`Message-ID: ${opts.messageId}`] : []),
      ...(date ? [`Date: ${date.toUTCString()}`] : []),
      "Content-Type: text/plain; charset=utf-8",
      "",
      opts.text ?? "Hello, please quote us.",
      "",
    ].join("\r\n"),
  )
}

const ACCOUNT_ID = "account-1"

function accountRow(overrides: Partial<MockRow> = {}): MockRow {
  return {
    id: ACCOUNT_ID,
    email: "bookings@luxus.test",
    host: "imap.luxus.test",
    port: 993,
    tls_mode: "ssl_tls",
    username: "bookings@luxus.test",
    // Contents are irrelevant (decryptCredential is mocked) but the v1 envelope shape is not --
    // createImapClient refuses an account whose credential was never encrypted.
    password_encrypted: "v1:aXY=:dGFn:Y3Q=",
    inbox_folder: "INBOX",
    processed_folder: "Processed",
    needs_review_folder: "Needs Review",
    enabled: true,
    last_uidvalidity: 1000,
    last_seen_uid: 0,
    first_sync_completed: true,
    last_synced_at: null,
    ...overrides,
  }
}

function bookingResult(overrides: Partial<CreatedEmailBooking> = {}): CreatedEmailBooking {
  return {
    id: "booking-1",
    bookingNumber: "LTT-2026-0001",
    duplicateOfBookingId: null,
    rawPreview: "preview",
    needsReview: false,
    missingFields: [],
    warnings: [],
    ...overrides,
  }
}

let mock: ReturnType<typeof createSupabaseMock>

beforeEach(() => {
  vi.clearAllMocks()

  mailboxState = { uidValidity: BigInt(1000), inbox: new Map(), folders: new Map() }
  imapBehavior = {}

  mock = createSupabaseMock({
    inbound_email_rules: [
      { id: "rule-1", name: "Enquiry", subject_pattern: "enquiry", match_type: "contains", active: true, created_at: "2026-01-01T00:00:00Z" },
    ],
  })
  syncMocks.createServiceClient.mockReturnValue(mock.supabase)
  syncMocks.createEmailBookingFromParsedDraft.mockResolvedValue(bookingResult())
  // Importable by default; the non-enquiry gate has its own test that overrides this.
  syncMocks.assessEnquiryPlausibility.mockReturnValue({
    importable: true,
    reason: "",
    completed: 9,
    total: 9,
  })
})

function seedMessage(uid: number, subject: string): void {
  mailboxState.inbox.set(uid, { uid, source: rawEmail({ subject }) })
}

// syncInboundEmailAccount takes the account as a parameter rather than loading it, but its cursor
// update (`inbound_email_accounts` table) still writes through the mock store keyed by id -- seed
// the row so that update has something to match, mirroring how the real row already exists in the
// DB before a sync run starts.
async function runSync(account: MockRow): Promise<EmailSyncSummary> {
  mock.store.tables.inbound_email_accounts = [account]
  return syncInboundEmailAccount(account as never)
}

// --- Tests ---------------------------------------------------------------

describe("syncInboundEmailAccount", () => {
  it("imports a matching-rule message, files it, and advances the cursor", async () => {
    seedMessage(101, "New enquiry: Cape Town")
    const account = accountRow()

    const summary = await runSync(account)

    expect(summary.importedCount).toBe(1)
    expect(summary.needsReviewCount).toBe(0)
    expect(summary.errors).toEqual([])

    const messageRow = mock.store.rows("inbound_email_messages")[0]
    expect(messageRow.status).toBe("imported_complete")
    expect(messageRow.filing_status).toBe("filed")
    expect(messageRow.booking_id).toBe("booking-1")
    // The email's own Date: header, not the time the sync ran.
    expect(messageRow.received_at).toBe("2026-08-01T10:00:00.000Z")

    expect(mailboxState.inbox.has(101)).toBe(false)
    expect(mailboxState.folders.get("Processed")?.map((m) => m.uid)).toEqual([101])

    const accountUpdate = mock.store.rows("inbound_email_accounts")
    expect(accountUpdate[0]?.last_seen_uid).toBe(101)
  })

  it("falls back to the IMAP internal date when the message has no Date: header", async () => {
    mailboxState.inbox.set(107, {
      uid: 107,
      source: rawEmail({ subject: "New enquiry: no date header", date: null }),
      internalDate: new Date("2026-08-02T06:15:00Z"),
    })

    await runSync(accountRow())

    const messageRow = mock.store.rows("inbound_email_messages")[0]
    expect(messageRow.received_at).toBe("2026-08-02T06:15:00.000Z")
  })

  it("prefers the message's own Date: header over the IMAP internal date", async () => {
    mailboxState.inbox.set(108, {
      uid: 108,
      source: rawEmail({ subject: "New enquiry: both dates", date: new Date("2026-08-01T10:00:00Z") }),
      internalDate: new Date("2026-08-03T23:59:00Z"),
    })

    await runSync(accountRow())

    const messageRow = mock.store.rows("inbound_email_messages")[0]
    expect(messageRow.received_at).toBe("2026-08-01T10:00:00.000Z")
  })

  it("files a needs-review booking into the needs_review_folder, not processed", async () => {
    seedMessage(102, "New enquiry: possible duplicate")
    syncMocks.createEmailBookingFromParsedDraft.mockResolvedValue(bookingResult({ needsReview: true }))

    await runSync(accountRow())

    const messageRow = mock.store.rows("inbound_email_messages")[0]
    expect(messageRow.status).toBe("imported_needs_review")
    expect(mailboxState.folders.get("Needs Review")?.map((m) => m.uid)).toEqual([102])
    expect(mailboxState.folders.get("Processed")).toBeUndefined()
  })

  it("records an unmatched subject as skipped_no_rule without creating a booking", async () => {
    seedMessage(103, "Totally unrelated subject")

    const summary = await runSync(accountRow())

    expect(syncMocks.createEmailBookingFromParsedDraft).not.toHaveBeenCalled()
    expect(summary.importedCount).toBe(0)
    const messageRow = mock.store.rows("inbound_email_messages")[0]
    expect(messageRow.status).toBe("skipped_no_rule")
    expect(messageRow.filing_status).toBe("not_applicable")
  })

  it("records a rule-matched non-enquiry as skipped without creating a booking", async () => {
    // A subject rule is a blunt instrument: an out-of-office auto-reply on an enquiry thread
    // matched one and produced a customer, a booking and a draft quote. The body decides now.
    seedMessage(107, "New enquiry: Out of Office AutoReply")
    syncMocks.assessEnquiryPlausibility.mockReturnValue({
      importable: false,
      reason: "Only 4 of 9 required fields parsed (minimum 5) -- does not look like an enquiry",
      completed: 4,
      total: 9,
    })

    const summary = await runSync(accountRow())

    expect(syncMocks.createEmailBookingFromParsedDraft).not.toHaveBeenCalled()
    expect(summary.importedCount).toBe(0)
    expect(summary.skippedNotEnquiryCount).toBe(1)

    // The claim row stays, so the message is visible, counted for dedupe, and never re-imported.
    const messageRow = mock.store.rows("inbound_email_messages")[0]
    expect(messageRow.status).toBe("skipped_not_an_enquiry")
    expect(messageRow.filing_status).toBe("not_applicable")
    expect(messageRow.booking_id).toBeNull()
    expect(messageRow.error).toContain("does not look like an enquiry")
  })

  it("caps a run at MAX_UIDS_PER_RUN and leaves the rest for the next run", async () => {
    // A backlog larger than the cap must drain across runs rather than risk a platform timeout
    // mid-run -- and the cursor must land on the last UID of THIS batch, not the last in the inbox,
    // or everything past the cap would be skipped forever.
    for (let uid = 1; uid <= 40; uid += 1) {
      seedMessage(uid, `New enquiry ${uid}`)
    }

    const summary = await runSync(accountRow())

    expect(summary.scannedCount).toBe(25)
    expect(mock.store.rows("inbound_email_messages")).toHaveLength(25)
    expect(syncMocks.createEmailBookingFromParsedDraft).toHaveBeenCalledTimes(25)
    expect(mock.store.rows("inbound_email_accounts")[0]?.last_seen_uid).toBe(25)
    // Uids 26-40 are untouched and still in the inbox for the next run.
    expect(mailboxState.inbox.has(26)).toBe(true)
    expect(mailboxState.inbox.has(40)).toBe(true)
  })

  it("imports the rest of the batch when one message fails to import", async () => {
    seedMessage(201, "New enquiry: fine")
    seedMessage(202, "New enquiry: explodes")
    seedMessage(203, "New enquiry: also fine")

    let call = 0
    syncMocks.createEmailBookingFromParsedDraft.mockImplementation(async () => {
      call += 1
      if (call === 2) throw new Error("resolver blew up")
      return bookingResult({ id: `booking-${call}` })
    })

    const summary = await runSync(accountRow())

    expect(summary.importedCount).toBe(2)
    expect(summary.errors).toHaveLength(1)
    expect(summary.errors[0]).toContain("resolver blew up")

    // Every UID ends the run with a row: the two that imported, and the one that failed. The
    // failed row is what the retry pass picks up next run -- deleting it (as this used to) put the
    // UID below the cursor with nothing recorded, and the enquiry was gone for good.
    const rows = mock.store.rows("inbound_email_messages")
    expect(rows.map((row) => row.uid).sort((a, b) => Number(a) - Number(b))).toEqual([201, 202, 203])
    const failed = rows.find((row) => row.uid === 202)
    expect(failed?.status).toBe("failed")
    expect(failed?.booking_id).toBeNull()
    expect(failed?.attempts).toBe(1)
    expect(rows.filter((row) => row.status === "imported_complete")).toHaveLength(2)
  })

  it("does not re-import the same Message-ID under a new UID", async () => {
    // Production case: fourteen enquiries left the INBOX, came back with fresh UIDs, and UID-only
    // dedupe read them as new mail -- fourteen duplicate bookings in one morning.
    const messageId = "<returning-message@sa-rail.co.za>"
    mailboxState.inbox.set(501, { uid: 501, source: rawEmail({ subject: "New enquiry: returns", messageId }) })
    mailboxState.inbox.set(502, { uid: 502, source: rawEmail({ subject: "New enquiry: returns", messageId }) })

    const summary = await runSync(accountRow())

    expect(syncMocks.createEmailBookingFromParsedDraft).toHaveBeenCalledTimes(1)
    expect(summary.importedCount).toBe(1)
    expect(summary.duplicateCount).toBe(1)

    const rows = mock.store.rows("inbound_email_messages")
    const second = rows.find((row) => row.uid === 502)
    expect(second?.status).toBe("skipped_duplicate_message")
    expect(second?.booking_id).toBeNull()
    expect(second?.error).toContain("501")
    // Not filed -- left where it is, and the cursor moves past it so it is not looked at again.
    expect(second?.filing_status).toBe("not_applicable")
    expect(mailboxState.inbox.has(502)).toBe(true)
    expect(mock.store.rows("inbound_email_accounts")[0]?.last_seen_uid).toBe(502)
  })

  it("still imports a Message-ID whose only earlier row is a failure", async () => {
    // A failed row must stay retryable -- treating it as "already handled" would strand the enquiry.
    const messageId = "<failed-then-returned@sa-rail.co.za>"
    mailboxState.inbox.set(503, { uid: 503, source: rawEmail({ subject: "New enquiry: retryable", messageId }) })
    mock.store.tables.inbound_email_messages = [
      {
        id: "failed-row",
        email_account_id: ACCOUNT_ID,
        uidvalidity: 1000,
        uid: 490,
        message_id: messageId,
        subject: "New enquiry: retryable",
        status: "failed",
        filing_status: "not_applicable",
        booking_id: null,
        attempts: 3,
        missing_fields: [],
        warnings: [],
      },
    ]

    const summary = await runSync(accountRow({ last_seen_uid: 500 }))

    expect(summary.importedCount).toBe(1)
    expect(mock.store.rows("inbound_email_messages").find((row) => row.uid === 503)?.status).toBe(
      "imported_complete",
    )
  })

  it("imports normally when the message carries no Message-ID header", async () => {
    seedMessage(504, "New enquiry: no message id")

    const summary = await runSync(accountRow())

    expect(summary.importedCount).toBe(1)
    expect(summary.duplicateCount).toBe(0)
    expect(mock.store.rows("inbound_email_messages")[0].status).toBe("imported_complete")
  })

  it("does not treat a retried row as its own duplicate", async () => {
    const messageId = "<retry-not-duplicate@sa-rail.co.za>"
    mailboxState.inbox.set(505, { uid: 505, source: rawEmail({ subject: "New enquiry: retry me", messageId }) })
    mock.store.tables.inbound_email_messages = [
      {
        id: "retry-row",
        email_account_id: ACCOUNT_ID,
        uidvalidity: 1000,
        uid: 505,
        message_id: messageId,
        subject: "New enquiry: retry me",
        status: "failed",
        filing_status: "not_applicable",
        booking_id: null,
        attempts: 1,
        missing_fields: [],
        warnings: [],
      },
    ]

    const summary = await runSync(accountRow({ last_seen_uid: 505 }))

    expect(summary.importedCount).toBe(1)
    const rows = mock.store.rows("inbound_email_messages")
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("imported_complete")
    expect(rows[0].attempts).toBe(2)
  })

  it("does not re-import a UID that already has a row (dedupe)", async () => {
    seedMessage(104, "New enquiry: repeat")
    mock.store.tables.inbound_email_messages = [
      {
        id: "existing-row",
        email_account_id: ACCOUNT_ID,
        uidvalidity: 1000,
        uid: 104,
        subject: "New enquiry: repeat",
        status: "imported_complete",
        filing_status: "filed",
        missing_fields: [],
        warnings: [],
      },
    ]

    const summary = await runSync(accountRow())

    expect(syncMocks.createEmailBookingFromParsedDraft).not.toHaveBeenCalled()
    expect(summary.duplicateCount).toBe(1)
    expect(mock.store.rows("inbound_email_messages")).toHaveLength(1)
  })

  it("keeps a failed row (not a deleted claim) when booking creation itself fails", async () => {
    seedMessage(105, "New enquiry: will fail")
    syncMocks.createEmailBookingFromParsedDraft.mockRejectedValue(new Error("resolver blew up"))

    const summary = await runSync(accountRow())

    expect(summary.errors[0]).toContain("resolver blew up")

    // The row stays. The cursor advances over recorded UIDs, so a deleted claim meant the next
    // run's `uid > last_seen_uid` search never saw this UID again -- the enquiry was lost silently.
    const row = mock.store.rows("inbound_email_messages")[0]
    expect(row.status).toBe("failed")
    expect(row.filing_status).toBe("not_applicable")
    expect(row.booking_id).toBeNull()
    expect(row.attempts).toBe(1)
    expect(row.error).toContain("resolver blew up")
  })

  it("retries a failed UID on the next run even though it sits below the cursor", async () => {
    seedMessage(105, "New enquiry: fails once")
    syncMocks.createEmailBookingFromParsedDraft.mockRejectedValueOnce(new Error("resolver blew up"))

    // First run fails and records the UID; the cursor moves past it, exactly as for any other
    // recorded message.
    await runSync(accountRow())
    const afterFirst = mock.store.rows("inbound_email_accounts")[0]
    expect(afterFirst?.last_seen_uid).toBe(105)

    syncMocks.createEmailBookingFromParsedDraft.mockResolvedValue(bookingResult({ id: "booking-retry" }))

    // Second run: nothing above the cursor, so the message is only reachable via the retry pass.
    await runSync(accountRow({ last_seen_uid: 105 }))

    const rows = mock.store.rows("inbound_email_messages")
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("imported_complete")
    expect(rows[0].booking_id).toBe("booking-retry")
    expect(rows[0].attempts).toBe(2)
  })

  it("stops retrying a UID that has failed MAX_IMPORT_ATTEMPTS times", async () => {
    seedMessage(105, "New enquiry: always fails")
    mock.store.tables.inbound_email_messages = [
      {
        id: "exhausted-row",
        email_account_id: ACCOUNT_ID,
        uidvalidity: 1000,
        uid: 105,
        subject: "New enquiry: always fails",
        status: "failed",
        filing_status: "not_applicable",
        booking_id: null,
        attempts: 3,
        missing_fields: [],
        warnings: [],
      },
    ]

    await runSync(accountRow({ last_seen_uid: 105 }))

    // Left for a human rather than burning the run budget on it forever.
    expect(syncMocks.createEmailBookingFromParsedDraft).not.toHaveBeenCalled()
    expect(mock.store.rows("inbound_email_messages")[0].attempts).toBe(3)
  })

  it("records a UID the server returns no source for instead of dropping it", async () => {
    seedMessage(301, "New enquiry: fine")
    seedMessage(302, "New enquiry: no source")
    imapBehavior.dropSourceForUids = [302]

    await runSync(accountRow())

    const dropped = mock.store.rows("inbound_email_messages").find((row) => row.uid === 302)
    expect(dropped?.status).toBe("fetch_failed")
    expect(dropped?.attempts).toBe(0)
    // Accounted for, so the cursor is free to move -- the retry pass owns it from here.
    expect(mock.store.rows("inbound_email_accounts")[0]?.last_seen_uid).toBe(302)
  })

  it("stops before starting a message it cannot finish and leaves the rest above the cursor", async () => {
    // Only Date.now is controlled -- faking the timers themselves deadlocks the async IMAP/parser
    // work this test drives.
    let clock = Date.now()
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => clock)
    try {
      seedMessage(401, "New enquiry: one")
      seedMessage(402, "New enquiry: two")
      seedMessage(403, "New enquiry: three")

      // 20s per booking against the 45s budget and 12s per-message headroom: two fit, the third
      // must not be started. Being killed mid-message is the failure this budget exists to avoid.
      let call = 0
      syncMocks.createEmailBookingFromParsedDraft.mockImplementation(async () => {
        call += 1
        clock += 20_000
        return bookingResult({ id: `booking-${call}` })
      })

      const summary = await runSync(accountRow())

      expect(summary.importedCount).toBe(2)
      // UID 403 was never started, so it keeps no row and stays above the cursor for the next run.
      expect(mock.store.rows("inbound_email_messages").map((row) => row.uid)).toEqual([401, 402])
      expect(mock.store.rows("inbound_email_accounts")[0]?.last_seen_uid).toBe(402)

      const run = mock.store.rows("inbound_email_sync_runs")[0]
      expect(run.status).toBe("partial")
      expect(run.finished_at).not.toBeNull()
      expect(run.scanned_count).toBe(2)
      expect(run.error).toContain("run budget")
    } finally {
      nowSpy.mockRestore()
    }
  })

  it("does not delete the claim if booking creation succeeds but recording it fails", async () => {
    seedMessage(106, "New enquiry: db hiccup")

    // Inject a one-shot failure into the *second* write to inbound_email_messages (the
    // post-creation update that stamps booking_id/status) without touching the claim insert.
    // This is the exact window the claim-first design exists to protect: a booking now exists in
    // `bookings`, so the claim row must be left in place (status "processing") rather than
    // deleted, or a retry would create a duplicate booking.
    let failNextUpdate = true
    const realFrom = mock.supabase.from.bind(mock.supabase)
    vi.spyOn(mock.supabase, "from").mockImplementation((table: string) => {
      const real = realFrom(table)
      if (table !== "inbound_email_messages") return real
      return {
        ...real,
        update: (values: MockRow): MockQueryBuilder => {
          if (failNextUpdate && "booking_id" in values) {
            failNextUpdate = false
            return {
              eq: () => Promise.resolve({ data: null, error: { message: "simulated db outage" } }),
            } as unknown as MockQueryBuilder
          }
          return real.update(values)
        },
      }
    })

    const summary = await runSync(accountRow())

    expect(summary.errors[0]).toContain("Booking booking-1 created but failed to record")
    expect(summary.importedCount).toBe(0)

    const rows = mock.store.rows("inbound_email_messages")
    expect(rows).toHaveLength(1) // claim was NOT deleted
    expect(rows[0].status).toBe("processing")
    expect(rows[0].booking_id).toBeNull()
  })

  it("heals a filing_failed row left by a previous run without re-importing it", async () => {
    // No message currently in the inbox for this UID under this run's candidate range -- it
    // simulates a message that was already imported and claimed in an earlier run, whose move
    // failed (e.g. a dropped connection), and is now sitting in the inbox unfiled.
    mailboxState.inbox.set(999, { uid: 999, source: rawEmail({ subject: "already imported" }) })
    mock.store.tables.inbound_email_messages = [
      {
        id: "stuck-row",
        email_account_id: ACCOUNT_ID,
        uidvalidity: 1000,
        uid: 999,
        subject: "already imported",
        status: "imported_complete",
        filing_status: "filing_failed",
        booking_id: "booking-already-created",
        missing_fields: [],
        warnings: [],
      },
    ]
    // Cursor already past 999 so it's not re-collected as a "new" candidate this run.
    const account = accountRow({ last_seen_uid: 999 })

    await runSync(account)

    expect(syncMocks.createEmailBookingFromParsedDraft).not.toHaveBeenCalled()
    const stuckRow = mock.store.rows("inbound_email_messages").find((row) => row.id === "stuck-row")
    expect(stuckRow?.filing_status).toBe("filed")
    expect(mailboxState.folders.get("Processed")?.map((m) => m.uid)).toEqual([999])
  })

  it("marks a filing_failed row not_applicable if the message is gone from the server", async () => {
    // uid 998 is not present in mailboxState.inbox -- simulates a human having already moved or
    // deleted it manually.
    mock.store.tables.inbound_email_messages = [
      {
        id: "vanished-row",
        email_account_id: ACCOUNT_ID,
        uidvalidity: 1000,
        uid: 998,
        subject: "vanished",
        status: "imported_complete",
        filing_status: "filing_failed",
        booking_id: "booking-x",
        missing_fields: [],
        warnings: [],
      },
    ]
    const account = accountRow({ last_seen_uid: 999 })

    await runSync(account)

    const row = mock.store.rows("inbound_email_messages").find((r) => r.id === "vanished-row")
    expect(row?.filing_status).toBe("not_applicable")
    expect(row?.error).toContain("no longer present")
  })

  it("defers filing when the mailbox's UIDVALIDITY changes between the collect and filing connections", async () => {
    // Collect (Phase A) sees uidValidity 1000; by the time the filing connection (Phase C) opens
    // the mailbox again, it's been recreated as 2000 -- e.g. the server rebuilt the folder mid-run.
    mailboxState.uidValiditySequence = [BigInt(1000), BigInt(2000)]
    mock.store.tables.inbound_email_messages = [
      {
        id: "row-under-old-epoch",
        email_account_id: ACCOUNT_ID,
        uidvalidity: 1000, // matches Phase A's uidvalidity, so fileOutstandingMessages DOES select it
        uid: 997,
        subject: "old epoch",
        status: "imported_complete",
        filing_status: "filing_failed",
        booking_id: "booking-y",
        missing_fields: [],
        warnings: [],
      },
    ]
    const account = accountRow({ last_uidvalidity: 1000, last_seen_uid: 999 })

    await runSync(account)

    const row = mock.store.rows("inbound_email_messages").find((r) => r.id === "row-under-old-epoch")
    expect(row?.filing_status).toBe("filing_failed") // untouched, not moved under the wrong epoch
    const warningCalls = syncMocks.logError.mock.calls.filter(([arg]) => arg.severity === "Warning")
    expect(warningCalls.some(([arg]) => arg.message === "Mailbox UIDVALIDITY changed; deferring stuck filings")).toBe(true)
  })

  it("marks a stale processing claim as failed instead of leaving it stuck forever", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    mock.store.tables.inbound_email_messages = [
      {
        id: "crashed-claim",
        email_account_id: ACCOUNT_ID,
        uidvalidity: 1000,
        uid: 996,
        subject: "crashed mid-import",
        status: "processing",
        filing_status: "filing_failed",
        missing_fields: [],
        warnings: [],
        created_at: twoHoursAgo,
      },
    ]

    await runSync(accountRow())

    const row = mock.store.rows("inbound_email_messages").find((r) => r.id === "crashed-claim")
    expect(row?.status).toBe("failed")
    expect(row?.error).toContain("Stuck in processing")
  })

  it("logs a Warning (not a Critical run failure) when only the filing pass fails", async () => {
    seedMessage(107, "New enquiry: filing will drop")
    const account = accountRow()

    // Collect (Phase A) never calls messageMove, so this only affects the filing connection
    // (Phase C) -- reproduces the production incident (move fails, connection is otherwise fine).
    imapBehavior = { failMoveToFolder: "Processed" }

    const summary = await runSync(account)

    // Import itself succeeded -- this must not be reported as "Mailbox sync failed".
    expect(summary.importedCount).toBe(1)
    const criticalCalls = syncMocks.logError.mock.calls.filter(([arg]) => arg.severity === "Critical")
    expect(criticalCalls).toHaveLength(0)
    const warningCalls = syncMocks.logError.mock.calls.filter(([arg]) => arg.severity === "Warning")
    expect(warningCalls.some(([arg]) => arg.message === "Email moved to processed folder failed")).toBe(true)

    const messageRow = mock.store.rows("inbound_email_messages")[0]
    expect(messageRow.filing_status).toBe("filing_failed")
    expect(mailboxState.inbox.has(107)).toBe(true) // never moved
  })

  it("marks the run failed and logs Critical when the collect connection cannot connect", async () => {
    imapBehavior = { failConnect: true }

    await expect(runSync(accountRow())).rejects.toThrow("Connection not available")

    const runRow = mock.store.rows("inbound_email_sync_runs")[0]
    expect(runRow.status).toBe("failed")
    const criticalCalls = syncMocks.logError.mock.calls.filter(([arg]) => arg.severity === "Critical")
    expect(criticalCalls.some(([arg]) => arg.message === "Mailbox sync failed")).toBe(true)
  })
})
