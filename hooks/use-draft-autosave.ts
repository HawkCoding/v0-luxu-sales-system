"use client"

import { useEffect, useState } from "react"
import {
  draftStorageKey,
  readDraftEnvelope,
  readRawDraft,
  removeDraft,
  serializeDraft,
  writeDraft,
} from "@/lib/drafts/draft-storage"

const DEFAULT_DEBOUNCE_MS = 1500

export interface UseDraftAutosaveOptions<T> {
  /** Namespaces the storage key, e.g. "quote", "enquiry". */
  kind: string
  /** The record the draft belongs to. Autosave is disabled while this is null/undefined (e.g. a
   *  quote that hasn't been created yet). */
  recordId: string | null | undefined
  /** Bump whenever the persisted shape of `T` changes -- see draft-storage.ts for why. */
  version: number
  /** Set false to pause writes, e.g. while a save request is in flight. */
  enabled: boolean
  /** Current in-progress form state. */
  data: T
  /** The server/initial state to diff `data` against. Equal to `data` (by JSON.stringify) means
   *  nothing unsaved exists, so the draft key is removed instead of written. */
  baseline: T
  /** `updated_at` of the server record `data` is being edited against. */
  recordUpdatedAt: string | null
  /** Merges a restored draft over a freshly built baseline so a field the draft's schema didn't
   *  have yet lands with the server's current value rather than `undefined`. */
  normalize?: (draft: T, fallback: T) => T
  isValid?: (data: unknown) => data is T
  debounceMs?: number
}

export interface UseDraftAutosaveResult<T> {
  /** The draft found on disk for this record, normalized. Null once discarded/cleared/absent, or if
   *  nothing was ever found -- check `hasLoadedDraft` to tell "no draft" apart from "haven't looked
   *  yet" (the disk read is synchronous, but its result only lands on the render after this one). */
  pendingDraft: T | null
  pendingDraftSavedAt: string | null
  pendingDraftRecordUpdatedAt: string | null
  /** Flips true once the initial disk read for the current `key` has completed, whether or not it
   *  found anything. A caller that wants to branch on "is there a draft to restore" should wait for
   *  this before reading `pendingDraft`. */
  hasLoadedDraft: boolean
  /** True when `data` differs from `baseline` -- i.e. there is something that would be lost. */
  isDirty: boolean
  discardDraft: () => void
  clearDraft: () => void
}

/**
 * Mirrors `data` to a versioned localStorage draft whenever it diverges from `baseline`, debounced.
 * Generalises the autosave effect in `components/supplier-detail-view.tsx` (compare-to-baseline,
 * remove-when-clean, suspend-while-saving) for any form.
 */
export function useDraftAutosave<T>({
  kind,
  recordId,
  version,
  enabled,
  data,
  baseline,
  recordUpdatedAt,
  normalize,
  isValid,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseDraftAutosaveOptions<T>): UseDraftAutosaveResult<T> {
  const key = recordId ? draftStorageKey(kind, recordId) : null
  const [pendingDraft, setPendingDraft] = useState<T | null>(null)
  const [pendingDraftSavedAt, setPendingDraftSavedAt] = useState<string | null>(null)
  const [pendingDraftRecordUpdatedAt, setPendingDraftRecordUpdatedAt] = useState<string | null>(null)
  const [hasLoadedDraft, setHasLoadedDraft] = useState(false)

  // Load whatever is already on disk once we know which record is being edited. Deliberately keyed
  // only on `key` -- `baseline`/`normalize` are expected to be fresh references every render and
  // re-running this on every keystroke would fight the effect below.
  useEffect(() => {
    setHasLoadedDraft(false)
    if (!key) {
      setPendingDraft(null)
      setPendingDraftSavedAt(null)
      setPendingDraftRecordUpdatedAt(null)
      setHasLoadedDraft(true)
      return
    }
    const envelope = readDraftEnvelope<T>(readRawDraft(key), { version, isValid })
    if (!envelope) {
      setPendingDraft(null)
      setPendingDraftSavedAt(null)
      setPendingDraftRecordUpdatedAt(null)
      setHasLoadedDraft(true)
      return
    }
    setPendingDraft(normalize ? normalize(envelope.data, baseline) : envelope.data)
    setPendingDraftSavedAt(envelope.savedAt)
    setPendingDraftRecordUpdatedAt(envelope.recordUpdatedAt)
    setHasLoadedDraft(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version])

  // Debounced write whenever `data` diverges from `baseline`.
  useEffect(() => {
    if (!enabled || !key) return
    const timeout = setTimeout(() => {
      const dataSnapshot = JSON.stringify(data)
      if (dataSnapshot === JSON.stringify(baseline)) {
        removeDraft(key)
        return
      }
      writeDraft(key, serializeDraft(data, { version, recordUpdatedAt }))
    }, debounceMs)
    return () => clearTimeout(timeout)
  }, [enabled, key, data, baseline, version, recordUpdatedAt, debounceMs])

  const isDirty = key !== null && JSON.stringify(data) !== JSON.stringify(baseline)

  function discardDraft(): void {
    if (key) removeDraft(key)
    setPendingDraft(null)
    setPendingDraftSavedAt(null)
    setPendingDraftRecordUpdatedAt(null)
  }

  return {
    pendingDraft,
    pendingDraftSavedAt,
    pendingDraftRecordUpdatedAt,
    hasLoadedDraft,
    isDirty,
    discardDraft,
    clearDraft: discardDraft,
  }
}
