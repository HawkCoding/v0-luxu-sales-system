"use client"

import { useCallback, useState } from "react"
import { broadcast } from "@/lib/cross-tab"
import type { StaleVersionConflictPayload } from "@/lib/concurrency"

type VersionedEntity = "job" | "quote" | "customer"

interface VersionedSaveOptions {
  url: string
  method: "PATCH" | "PUT"
  entity: VersionedEntity
  recordId: string
  expectedUpdatedAt: string | undefined
}

interface SaveResponseWithUpdatedAt {
  updatedAt?: string
}

function parseStaleVersionConflictPayload(payload: unknown): StaleVersionConflictPayload | null {
  if (!payload || typeof payload !== "object") return null

  const candidate = payload as Record<string, unknown>
  if (
    candidate.code !== "STALE_VERSION" ||
    typeof candidate.error !== "string" ||
    typeof candidate.currentUpdatedAt !== "string"
  ) {
    return null
  }

  return {
    code: "STALE_VERSION",
    error: candidate.error,
    currentUpdatedAt: candidate.currentUpdatedAt,
  }
}

export function useVersionedSave<TPayload extends object, TResponse extends SaveResponseWithUpdatedAt>(
  opts: VersionedSaveOptions,
): {
  save: (payload: TPayload, options?: { ignoreExpectedUpdatedAt?: boolean }) => Promise<TResponse>
  isSaving: boolean
  conflict: StaleVersionConflictPayload | null
  clearConflict: () => void
} {
  const [isSaving, setIsSaving] = useState(false)
  const [conflict, setConflict] = useState<StaleVersionConflictPayload | null>(null)

  const clearConflict = useCallback(() => {
    setConflict(null)
  }, [])

  const save = useCallback(
    async (payload: TPayload, options?: { ignoreExpectedUpdatedAt?: boolean }) => {
      setIsSaving(true)
      setConflict(null)

      try {
        const response = await fetch(opts.url, {
          method: opts.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            ...(opts.expectedUpdatedAt && !options?.ignoreExpectedUpdatedAt
              ? { expectedUpdatedAt: opts.expectedUpdatedAt }
              : {}),
          }),
        })

        const responsePayload = (await response.json().catch(() => null)) as unknown

        if (!response.ok) {
          if (response.status === 409) {
            const staleConflict = parseStaleVersionConflictPayload(responsePayload)
            if (staleConflict) {
              setConflict(staleConflict)
              throw new Error(staleConflict.error)
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
    [opts.entity, opts.expectedUpdatedAt, opts.method, opts.recordId, opts.url],
  )

  return { save, isSaving, conflict, clearConflict }
}
