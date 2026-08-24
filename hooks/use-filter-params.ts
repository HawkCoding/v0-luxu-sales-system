"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

export interface UseFilterParamsResult<T extends Record<string, string | undefined>> {
  /** Current filter values — URL-backed, with any not-yet-debounced edits applied on top. */
  values: T
  /** Sets one filter. Pass `{ debounceMs }` to delay the URL write (used for free-text search
   *  so every keystroke doesn't push a navigation); other filters commit immediately. */
  setValue: (key: keyof T, value: string | undefined, options?: { debounceMs?: number }) => void
  /** Resets every filter to its default and clears the URL of all filter keys, immediately. */
  clear: () => void
  /** True when any filter differs from its default (search included). */
  hasActive: boolean
}

/**
 * Syncs a flat set of list-page filters to the URL query string, following the read/set-or-
 * delete/push pattern already used by app/app/reporting/page.tsx. `router.replace` (not `push`)
 * is used throughout so filtering never stacks browser-history entries — Back should leave the
 * list, not step through filter changes.
 *
 * A key is only ever present in the URL when it differs from its default, so a cleared filter
 * bar produces a clean URL rather than accumulating `key=` noise.
 */
export function useFilterParams<T extends Record<string, string | undefined>>(
  defaults: T,
): UseFilterParamsResult<T> {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Edits not yet flushed to the URL (debounced search keystrokes). Rendered on top of the
  // URL-derived values so controlled inputs stay responsive while the navigation is pending.
  const [pending, setPending] = useState<Partial<T>>({})
  const timers = useRef<Partial<Record<keyof T, ReturnType<typeof setTimeout>>>>({})

  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach((timer) => timer && clearTimeout(timer))
    }
  }, [])

  const urlValues = useMemo(() => {
    const result = { ...defaults }
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      const raw = searchParams.get(key as string)
      if (raw !== null) result[key] = raw as T[keyof T]
    }
    return result
  }, [defaults, searchParams])

  const values = useMemo(() => ({ ...urlValues, ...pending }), [urlValues, pending])

  const commit = useCallback(
    (key: keyof T, value: string | undefined) => {
      const params = new URLSearchParams(searchParams.toString())
      const isDefault = value === undefined || value === defaults[key]
      if (isDefault) {
        params.delete(key as string)
      } else {
        params.set(key as string, value)
      }
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [defaults, pathname, router, searchParams],
  )

  const setValue = useCallback(
    (key: keyof T, value: string | undefined, options?: { debounceMs?: number }) => {
      setPending((prev) => ({ ...prev, [key]: value }))

      const existingTimer = timers.current[key]
      if (existingTimer) clearTimeout(existingTimer)

      if (options?.debounceMs) {
        timers.current[key] = setTimeout(() => {
          commit(key, value)
          setPending((prev) => {
            const next = { ...prev }
            delete next[key]
            return next
          })
        }, options.debounceMs)
      } else {
        commit(key, value)
        setPending((prev) => {
          const next = { ...prev }
          delete next[key]
          return next
        })
      }
    },
    [commit],
  )

  const clear = useCallback(() => {
    Object.values(timers.current).forEach((timer) => timer && clearTimeout(timer))
    timers.current = {}
    setPending({})
    router.replace(pathname, { scroll: false })
  }, [pathname, router])

  const hasActive = useMemo(
    () => (Object.keys(defaults) as (keyof T)[]).some((key) => values[key] !== defaults[key]),
    [defaults, values],
  )

  return { values, setValue, clear, hasActive }
}
