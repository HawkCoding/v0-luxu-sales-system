import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useDraftAutosave } from "./use-draft-autosave"
import { draftStorageKey, readRawDraft } from "@/lib/drafts/draft-storage"

interface Data {
  note: string
}

const BASELINE: Data = { note: "" }

beforeEach(() => {
  window.localStorage.clear()
  vi.useRealTimers()
})

describe("useDraftAutosave", () => {
  it("reports hasLoadedDraft=true with no pending draft when nothing is stored", async () => {
    const { result } = renderHook(() =>
      useDraftAutosave<Data>({
        kind: "test",
        recordId: "rec-1",
        version: 1,
        enabled: true,
        data: BASELINE,
        baseline: BASELINE,
        recordUpdatedAt: null,
      }),
    )
    await waitFor(() => expect(result.current.hasLoadedDraft).toBe(true))
    expect(result.current.pendingDraft).toBeNull()
  })

  it("is not dirty when data equals baseline, and dirty once it diverges", () => {
    const { result, rerender } = renderHook(
      ({ data }: { data: Data }) =>
        useDraftAutosave<Data>({
          kind: "test",
          recordId: "rec-2",
          version: 1,
          enabled: true,
          data,
          baseline: BASELINE,
          recordUpdatedAt: null,
        }),
      { initialProps: { data: BASELINE } },
    )
    expect(result.current.isDirty).toBe(false)
    rerender({ data: { note: "typed something" } })
    expect(result.current.isDirty).toBe(true)
  })

  it("writes a debounced draft once dirty, and removes it once clean again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const key = draftStorageKey("test", "rec-3")
    const { rerender } = renderHook(
      ({ data }: { data: Data }) =>
        useDraftAutosave<Data>({
          kind: "test",
          recordId: "rec-3",
          version: 1,
          enabled: true,
          data,
          baseline: BASELINE,
          recordUpdatedAt: "2026-08-01T00:00:00.000Z",
          debounceMs: 500,
        }),
      { initialProps: { data: BASELINE } },
    )

    rerender({ data: { note: "typed something" } })
    expect(readRawDraft(key)).toBeNull()
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(readRawDraft(key)).not.toBeNull()

    rerender({ data: BASELINE })
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(readRawDraft(key)).toBeNull()
    vi.useRealTimers()
  })

  it("does not write while disabled", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const key = draftStorageKey("test", "rec-4")
    renderHook(() =>
      useDraftAutosave<Data>({
        kind: "test",
        recordId: "rec-4",
        version: 1,
        enabled: false,
        data: { note: "typed something" },
        baseline: BASELINE,
        recordUpdatedAt: null,
        debounceMs: 200,
      }),
    )
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(readRawDraft(key)).toBeNull()
    vi.useRealTimers()
  })

  it("loads and normalizes an existing draft for the record", async () => {
    const key = draftStorageKey("test", "rec-5")
    window.localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        savedAt: "2026-08-01T00:00:00.000Z",
        recordUpdatedAt: "2026-08-01T00:00:00.000Z",
        data: { note: "restored" },
      }),
    )
    const { result } = renderHook(() =>
      useDraftAutosave<Data>({
        kind: "test",
        recordId: "rec-5",
        version: 1,
        enabled: true,
        data: BASELINE,
        baseline: BASELINE,
        recordUpdatedAt: "2026-08-01T00:00:00.000Z",
        normalize: (draft, fallback) => ({ ...fallback, ...draft }),
      }),
    )
    await waitFor(() => expect(result.current.hasLoadedDraft).toBe(true))
    expect(result.current.pendingDraft).toEqual({ note: "restored" })
    expect(result.current.pendingDraftRecordUpdatedAt).toBe("2026-08-01T00:00:00.000Z")
  })

  it("drops a draft written under a different schema version", async () => {
    const key = draftStorageKey("test", "rec-6")
    window.localStorage.setItem(
      key,
      JSON.stringify({ version: 1, savedAt: "2026-08-01T00:00:00.000Z", data: { note: "old shape" } }),
    )
    const { result } = renderHook(() =>
      useDraftAutosave<Data>({
        kind: "test",
        recordId: "rec-6",
        version: 2,
        enabled: true,
        data: BASELINE,
        baseline: BASELINE,
        recordUpdatedAt: null,
      }),
    )
    await waitFor(() => expect(result.current.hasLoadedDraft).toBe(true))
    expect(result.current.pendingDraft).toBeNull()
  })

  it("discardDraft clears both the pending draft and the storage key", async () => {
    const key = draftStorageKey("test", "rec-7")
    window.localStorage.setItem(
      key,
      JSON.stringify({ version: 1, savedAt: "2026-08-01T00:00:00.000Z", data: { note: "restored" } }),
    )
    const { result } = renderHook(() =>
      useDraftAutosave<Data>({
        kind: "test",
        recordId: "rec-7",
        version: 1,
        enabled: true,
        data: BASELINE,
        baseline: BASELINE,
        recordUpdatedAt: null,
      }),
    )
    await waitFor(() => expect(result.current.pendingDraft).toEqual({ note: "restored" }))
    act(() => result.current.discardDraft())
    expect(result.current.pendingDraft).toBeNull()
    expect(readRawDraft(key)).toBeNull()
  })

  it("disables autosave entirely when recordId is null", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderHook(() =>
      useDraftAutosave<Data>({
        kind: "test",
        recordId: null,
        version: 1,
        enabled: true,
        data: { note: "typed something" },
        baseline: BASELINE,
        recordUpdatedAt: null,
        debounceMs: 100,
      }),
    )
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    // Nothing to assert a key for -- just confirming this doesn't throw with no key.
    expect(window.localStorage.length).toBe(0)
    vi.useRealTimers()
  })
})
