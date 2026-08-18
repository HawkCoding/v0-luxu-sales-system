import { beforeEach, describe, expect, it } from "vitest"
import {
  draftStorageKey,
  readDraftEnvelope,
  readRawDraft,
  removeDraft,
  serializeDraft,
  sweepExpiredDrafts,
  writeDraft,
} from "./draft-storage"

beforeEach(() => {
  window.localStorage.clear()
})

describe("draftStorageKey", () => {
  it("namespaces by kind and record id", () => {
    expect(draftStorageKey("quote", "quote-123")).toBe("draft:quote:quote-123")
  })
})

describe("serializeDraft / readDraftEnvelope", () => {
  it("round-trips a current-version draft", () => {
    const raw = serializeDraft({ step: "configure", note: "hi" }, { version: 1, recordUpdatedAt: "2026-08-01T00:00:00.000Z" })
    const envelope = readDraftEnvelope<{ step: string; note: string }>(raw, { version: 1 })
    expect(envelope).not.toBeNull()
    expect(envelope?.data).toEqual({ step: "configure", note: "hi" })
    expect(envelope?.recordUpdatedAt).toBe("2026-08-01T00:00:00.000Z")
  })

  it("returns null for nothing stored", () => {
    expect(readDraftEnvelope(null, { version: 1 })).toBeNull()
    expect(readDraftEnvelope("", { version: 1 })).toBeNull()
  })

  it("returns null for unparseable payloads", () => {
    expect(readDraftEnvelope("{not json", { version: 1 })).toBeNull()
    expect(readDraftEnvelope("[]", { version: 1 })).toBeNull()
  })

  it("drops drafts written by a different schema version", () => {
    const raw = serializeDraft({ a: 1 }, { version: 1, recordUpdatedAt: null })
    expect(readDraftEnvelope(raw, { version: 2 })).toBeNull()
  })

  it("drops drafts that fail a supplied validator", () => {
    const raw = serializeDraft({ a: 1 }, { version: 1, recordUpdatedAt: null })
    const isValid = (data: unknown): data is { a: number; b: number } =>
      typeof data === "object" && data !== null && "b" in data
    expect(readDraftEnvelope(raw, { version: 1, isValid })).toBeNull()
  })

  it("treats a missing recordUpdatedAt as null rather than dropping the draft", () => {
    const raw = JSON.stringify({ version: 1, savedAt: "2026-08-01T00:00:00.000Z", data: { a: 1 } })
    const envelope = readDraftEnvelope<{ a: number }>(raw, { version: 1 })
    expect(envelope?.recordUpdatedAt).toBeNull()
  })
})

describe("writeDraft / readRawDraft / removeDraft", () => {
  it("writes, reads back, and removes a draft", () => {
    const key = draftStorageKey("quote", "q1")
    writeDraft(key, "hello")
    expect(readRawDraft(key)).toBe("hello")
    removeDraft(key)
    expect(readRawDraft(key)).toBeNull()
  })
})

describe("sweepExpiredDrafts", () => {
  it("removes drafts older than maxAgeDays and keeps recent ones", () => {
    const oldKey = draftStorageKey("quote", "old")
    const freshKey = draftStorageKey("quote", "fresh")
    const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const freshDate = new Date().toISOString()

    writeDraft(oldKey, serializeDraft({ a: 1 }, { version: 1, recordUpdatedAt: null, savedAt: oldDate }))
    writeDraft(freshKey, serializeDraft({ a: 1 }, { version: 1, recordUpdatedAt: null, savedAt: freshDate }))

    sweepExpiredDrafts(7)

    expect(readRawDraft(oldKey)).toBeNull()
    expect(readRawDraft(freshKey)).not.toBeNull()
  })

  it("removes drafts with an unparseable savedAt", () => {
    const key = draftStorageKey("quote", "broken")
    window.localStorage.setItem(key, JSON.stringify({ version: 1, savedAt: "not-a-date", data: {} }))
    sweepExpiredDrafts(7)
    expect(readRawDraft(key)).toBeNull()
  })

  it("leaves non-draft keys alone", () => {
    window.localStorage.setItem("some-other-key", "keep me")
    sweepExpiredDrafts(0)
    expect(window.localStorage.getItem("some-other-key")).toBe("keep me")
  })
})
