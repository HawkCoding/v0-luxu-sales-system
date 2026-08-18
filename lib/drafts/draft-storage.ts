/**
 * Generic, versioned localStorage draft store. Generalises the pattern proven in
 * `lib/suppliers/supplier-draft-storage.ts`: an unsaved form is mirrored to `localStorage` under a
 * `draft:<kind>:<recordId>` key so it survives a refresh, a crash, an accidental dialog dismissal, or
 * a session-timeout redirect (logout only clears `sb-*` auth cookies, never `localStorage`).
 *
 * A draft is stamped with the app-supplied schema `version` it was written under. A version mismatch
 * means the shape of the form has changed since the draft was saved — restoring it field-by-field
 * would put `undefined` where the render expects an array or a string, which is what crashed the
 * supplier page to the root error boundary in production before this check existed. Callers own their
 * own `normalize()` step (merge the draft over a freshly built server form) as the second line of
 * defence, the same way `normalizeSupplierDraft` does.
 */

export interface DraftEnvelope<T> {
  version: number
  savedAt: string
  /** `updated_at` of the server record the draft was taken against, so a caller can tell whether the
   *  record has moved on since — a stale draft should be offered, not silently applied. */
  recordUpdatedAt: string | null
  data: T
}

export function draftStorageKey(kind: string, recordId: string): string {
  return `draft:${kind}:${recordId}`
}

export function serializeDraft<T>(
  data: T,
  options: { version: number; recordUpdatedAt: string | null; savedAt?: string },
): string {
  const envelope: DraftEnvelope<T> = {
    version: options.version,
    savedAt: options.savedAt ?? new Date().toISOString(),
    recordUpdatedAt: options.recordUpdatedAt,
    data,
  }
  return JSON.stringify(envelope)
}

/**
 * Parse a stored draft. Returns `null` when the payload is unusable — unparseable, written by a
 * different schema version, or (if `isValid` is supplied) structurally wrong — in which case the
 * caller should discard the key rather than restore it.
 */
export function readDraftEnvelope<T>(
  raw: string | null,
  options: { version: number; isValid?: (data: unknown) => data is T },
): DraftEnvelope<T> | null {
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null

  const envelope = parsed as Partial<DraftEnvelope<unknown>>
  if (envelope.version !== options.version) return null
  if (typeof envelope.savedAt !== "string") return null
  if (envelope.data === undefined) return null
  if (options.isValid && !options.isValid(envelope.data)) return null

  return {
    version: envelope.version,
    savedAt: envelope.savedAt,
    recordUpdatedAt: typeof envelope.recordUpdatedAt === "string" ? envelope.recordUpdatedAt : null,
    data: envelope.data as T,
  }
}

const DRAFT_KEY_PREFIX = "draft:"
const DEFAULT_MAX_AGE_DAYS = 7

function isQuotaExceeded(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "QuotaExceededError" || error.code === 22)
}

/** Removes every `draft:*` key older than `maxAgeDays`, or whose `savedAt` can't be parsed, so
 *  long-abandoned drafts don't accumulate toward the ~5MB localStorage quota. */
export function sweepExpiredDrafts(maxAgeDays: number = DEFAULT_MAX_AGE_DAYS): void {
  if (typeof window === "undefined") return
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
  const keysToRemove: string[] = []

  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i)
    if (!key || !key.startsWith(DRAFT_KEY_PREFIX)) continue
    const raw = window.localStorage.getItem(key)
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw) as { savedAt?: unknown }
      const savedAt = typeof parsed.savedAt === "string" ? Date.parse(parsed.savedAt) : Number.NaN
      if (Number.isNaN(savedAt) || savedAt < cutoff) keysToRemove.push(key)
    } catch {
      keysToRemove.push(key)
    }
  }

  keysToRemove.forEach((key) => window.localStorage.removeItem(key))
}

/** Writes a draft, sweeping expired drafts and retrying once if the quota is full. An autosave must
 *  never throw and break the form it's backing up, so a second failure is swallowed silently. */
export function writeDraft(key: string, raw: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, raw)
  } catch (error) {
    if (!isQuotaExceeded(error)) return
    try {
      sweepExpiredDrafts()
      window.localStorage.setItem(key, raw)
    } catch {
      // Give up silently -- losing the autosave is preferable to breaking the form.
    }
  }
}

export function removeDraft(key: string): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(key)
}

export function readRawDraft(key: string): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(key)
}
