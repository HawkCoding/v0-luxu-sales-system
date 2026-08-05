import { beforeEach, describe, expect, it, vi } from "vitest"
import { createSupabaseMock, type MockRow, type MockQueryBuilder } from "@/lib/testing/supabase-mock"
import type { CreatedEmailBooking } from "@/lib/inbound-email/import-booking"
import type { ErrorLogInput } from "@/lib/error-log"

const syncMocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  logError: vi.fn(async (_input: ErrorLogInput) => {}),
  createEmailBookingFromParsedDraft: vi.fn(),
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
  ): AsyncGenerator<{ uid: number; source: Buffer }> {
    this.fetchOpen = true
    try {
      for (const uid of range) {
        const message = this.state.inbox.get(uid)
        if (!message) continue
        yield { uid, source: message.source }
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

function rawEmail(opts: { subject: string; from?: string; date?: Date; text?: string }): Buffer {
  const date = opts.date ?? new Date("2026-08-01T10:00:00Z")
  return Buffer.from(
    [
      `From: ${opts.from ?? "Jane Doe <jane@example.com>"}`,
      "To: bookings@example.com",
      `Subject: ${opts.subject}`,
      `Date: ${date.toUTCString()}`,
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
    password_encrypted: "irrelevant-in-tests",
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

    expect(mailboxState.inbox.has(101)).toBe(false)
    expect(mailboxState.folders.get("Processed")?.map((m) => m.uid)).toEqual([101])

    const accountUpdate = mock.store.rows("inbound_email_accounts")
    expect(accountUpdate[0]?.last_seen_uid).toBe(101)
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

  it("frees the claimed UID for retry when booking creation itself fails", async () => {
    seedMessage(105, "New enquiry: will fail")
    syncMocks.createEmailBookingFromParsedDraft.mockRejectedValue(new Error("resolver blew up"))

    const summary = await runSync(accountRow())

    expect(summary.errors[0]).toContain("resolver blew up")
    // No row left behind -- nothing was created, so the next run must be free to retry this UID.
    expect(mock.store.rows("inbound_email_messages")).toHaveLength(0)
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
