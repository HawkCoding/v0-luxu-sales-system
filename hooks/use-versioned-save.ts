"use client"

import { useCallback, useState } from "react"
import { broadcast } from "@/lib/cross-tab"
import type { StaleVersionConflictPayload, FieldConflictPayload } from "@/lib/concurrency"

type VersionedEntity = "job" | "quote" | "customer"

export interface DuplicateEmailConflictPayload {
  error: string
  code: "DUPLICATE_EMAIL"
  existingCustomer: { id: string; firstName: string; lastName: string }
}

export type SaveConflict = StaleVersionConflictPayload | FieldConflictPayload | DuplicateEmailConflictPayload

export type VersionedSaveError = Error & { conflict?: SaveConflict }

interface VersionedSaveOptions {
  url: string
  method: "PATCH" | "PUT"
  entity: VersionedEntity
  recordId: string
  expectedUpdatedAt: string | undefined
  // Values the caller loaded for the fields it's about to change, so the
  // server only flags a real conflict when someone else touched the same
  // field — a sibling write to an unrelated column won't trip this.
  baseline?: Record<string, unknown>
}

interface SaveResponseWithUpdatedAt {
  updatedAt?: string
}

function parseConflictPayload(payload: unknown): SaveConflict | null {
  if (!payload || typeof payload !== "object") return null

  const candidate = payload as Record<string, unknown>
  if (typeof candidate.error !== "string") return null

  if (candidate.code === "STALE_VERSION" && typeof candidate.currentUpdatedAt === "string") {
    return { code: "STALE_VERSION", error: candidate.error, currentUpdatedAt: candidate.currentUpdatedAt }
  }

  if (
    candidate.code === "FIELD_CONFLICT" &&
    typeof candidate.currentUpdatedAt === "string" &&
    Array.isArray(candidate.fields)
  ) {
    return {
      code: "FIELD_CONFLICT",
      error: candidate.error,
      currentUpdatedAt: candidate.currentUpdatedAt,
      fields: candidate.fields.filter((field): field is string => typeof field === "string"),
    }
  }

  if (candidate.code === "DUPLICATE_EMAIL" && candidate.existingCustomer && typeof candidate.existingCustomer === "object") {
    const existing = candidate.existingCustomer as Record<string, unknown>
    if (typeof existing.id === "string" && typeof existing.firstName === "string" && typeof existing.lastName === "string") {
      return {
        code: "DUPLICATE_EMAIL",
        error: candidate.error,
        existingCustomer: { id: existing.id, firstName: existing.firstName, lastName: existing.lastName },
      }
    }
  }

  return null
}

export function useVersionedSave<TPayload extends object, TResponse extends SaveResponseWithUpdatedAt>(
  opts: VersionedSaveOptions,
): {
  save: (payload: TPayload, options?: { ignoreExpectedUpdatedAt?: boolean }) => Promise<TResponse>
  isSaving: boolean
  conflict: SaveConflict | null
  clearConflict: () => void
} {
  const [isSaving, setIsSaving] = useState(false)
  const [conflict, setConflict] = useState<SaveConflict | null>(null)

  const clearConflict = useCallback(() => {
    setConflict(null)
  }, [])

  const save = useCallback(
    async (payload: TPayload, options?: { ignoreExpectedUpdatedAt?: boolean }) => {
      setIsSaving(true)
      setConflict(null)

      try {
        const skipVersioning = options?.ignoreExpectedUpdatedAt
        const response = await fetch(opts.url, {
          method: opts.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            ...(opts.expectedUpdatedAt && !skipVersioning ? { expectedUpdatedAt: opts.expectedUpdatedAt } : {}),
            ...(opts.baseline && !skipVersioning ? { baseline: opts.baseline } : {}),
            // "Save anyway" used to skip the version check by sending nothing at all, which is the
            // same request shape as a client that simply forgot. Routes now require one or the
            // other, so the deliberate overwrite says so explicitly.
            ...(skipVersioning ? { force: true } : {}),
          }),
        })

        const responsePayload = (await response.json().catch(() => null)) as unknown

        if (!response.ok) {
          if (response.status === 409) {
            const parsedConflict = parseConflictPayload(responsePayload)
            if (parsedConflict) {
              setConflict(parsedConflict)
              const conflictError: VersionedSaveError = new Error(parsedConflict.error)
              conflictError.conflict = parsedConflict
              throw conflictError
            }
          }

          const errorMessage =
            responsePayload && typeof responsePayload === "object" && "error" in responsePayload
              ? String((responsePayload as { error?: unknown }).error)
              : "Request failed"
          throw new Error(errorMessage)
        }

        const typedPayload = responsePayload as TResponse
        if (typedPayload.updatedAt) {
          broadcast({
            type: "record-saved",
            entity: opts.entity,
            id: opts.recordId,
            updatedAt: typedPayload.updatedAt,
          })
        }

        return typedPayload
      } finally {
        setIsSaving(false)
      }
    },
    [opts.baseline, opts.entity, opts.expectedUpdatedAt, opts.method, opts.recordId, opts.url],
  )

  return { save, isSaving, conflict, clearConflict }
}
