"use client"

import { useCallback, useEffect } from "react"
import { useSWRConfig } from "swr"
import { broadcast, useCrossTab, type CrossTabEvent } from "@/lib/cross-tab"
import { getSupabase } from "@/lib/supabase/client"

type RealtimeTable = "bookings" | "quotes" | "customers"

interface RealtimeRow {
  id?: unknown
}

function getRecordId(payload: { new: RealtimeRow | null; old: RealtimeRow | null }): string | null {
  const id = payload.new?.id ?? payload.old?.id
  return typeof id === "string" && id.length > 0 ? id : null
}

function getInvalidationKeys(table: RealtimeTable, id: string | null): string[] {
  const keys = ["/api/data"]

  if (!id) return keys

  if (table === "bookings") {
    keys.push(`/api/jobs/${id}`)
  } else if (table === "quotes") {
    keys.push(`/api/quotes/${id}`)
  } else {
    keys.push(`/api/customers/${id}`)
  }

  return keys
}

export function useRealtimeSync(): void {
  const { mutate } = useSWRConfig()

  const invalidate = useCallback(
    (keys: string[]) => {
      keys.forEach((key) => {
        void mutate(key)
      })
    },
    [mutate],
  )

  useCrossTab(
    useCallback(
      (event: CrossTabEvent) => {
        if (event.type === "swr-invalidate") {
          invalidate(event.keys)
          return
        }

        if (event.type === "record-saved") {
          const keys =
            event.entity === "job"
              ? getInvalidationKeys("bookings", event.id)
              : event.entity === "quote"
                ? getInvalidationKeys("quotes", event.id)
                : event.entity === "customer"
                  ? getInvalidationKeys("customers", event.id)
                  : ["/api/data"]
          invalidate(keys)
          return
        }

        if (event.type === "auth-changed") {
          void mutate(() => true, undefined, { revalidate: false })
        }
      },
      [invalidate, mutate],
    ),
  )

  useEffect(() => {
    const supabase = getSupabase()
    const channel = supabase.channel("luxus-record-sync")

    const handleChange = (table: RealtimeTable, payload: { new: RealtimeRow | null; old: RealtimeRow | null }) => {
      const keys = getInvalidationKeys(table, getRecordId(payload))
      invalidate(keys)
      broadcast({ type: "swr-invalidate", keys })
    }

    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, (payload) => {
        handleChange("bookings", payload)
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "quotes" }, (payload) => {
        handleChange("quotes", payload)
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, (payload) => {
        handleChange("customers", payload)
      })
      .subscribe()

    return () => {
      void channel.unsubscribe()
    }
  }, [invalidate])
}
