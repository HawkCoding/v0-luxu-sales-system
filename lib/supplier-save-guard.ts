export interface StaleVersionConflictPayload {
  error: string
  code: "STALE_VERSION"
  currentUpdatedAt: string
}

export function parseStaleVersionConflictPayload(
  payload: unknown,
): StaleVersionConflictPayload | null {
  if (!payload || typeof payload !== "object") {
    return null
  }

  const candidate = payload as Record<string, unknown>
  if (
    candidate.code !== "STALE_VERSION" ||
    typeof candidate.currentUpdatedAt !== "string" ||
    typeof candidate.error !== "string"
  ) {
    return null
  }

  return {
    code: "STALE_VERSION",
    currentUpdatedAt: candidate.currentUpdatedAt,
    error: candidate.error,
  }
}

export class SupplierPatchWriteLock {
  private isLocked = false

  public tryAcquire(): boolean {
    if (this.isLocked) {
      return false
    }
    this.isLocked = true
    return true
  }

  public release(): void {
    this.isLocked = false
  }
}
