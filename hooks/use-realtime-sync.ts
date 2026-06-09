"use client"

import { useCallback, useEffect } from "react"
import { useSWRConfig } from "swr"
import { broadcast, useCrossTab, type CrossTabEvent, type RealtimeInvalidationEntity } from "@/lib/cross-tab"
import { getSupabase } from "@/lib/supabase/client"

type RealtimeTable = RealtimeInvalidationEntity

const TABLE_PREFIXES: Record<RealtimeTable, readonly string[]> = {
  bookings: ["/api/data", "/api/jobs"],
  quotes: ["/api/data", "/api/quotes"],
  customers: ["/api/data", "/api/customers"],
}

function makePredicate(prefixes: readonly string[]) {
  return (key: unknown): boolean =>
    typeof key === "string" &&
    prefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}/`) || key.startsWith(`${prefix}?`))
}

export function useRealtimeSync(): void {
  const { mutate } = useSWRConfig()

  const invalidate = useCallback(
    (table: RealtimeTable) => {
      void mutate(makePredicate(TABLE_PREFIXES[table]))
    },
    [mutate],
  )

  useCrossTab(
    useCallback(
      (event: CrossTabEvent) => {
        if (event.type === "swr-invalidate") {
          invalidate(event.entity)
          return
        }

        if (event.type === "record-saved") {
          const table =
            event.entity === "job"
              ? "bookings"
              : event.entity === "quote"
                ? "quotes"
                : event.entity === "customer"
                  ? "customers"
                  : null

          if (table) {
            invalidate(table)
          } else {
            void mutate("/api/data")
          }
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
    const channel = supabase.channel("ttt-record-sync")

    const handleChange = (table: RealtimeTable) => {
      invalidate(table)
      broadcast({ type: "swr-invalidate", entity: table })
    }

    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        handleChange("bookings")
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "quotes" }, () => {
        handleChange("quotes")
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, () => {
        handleChange("customers")
      })
      .subscribe()

    return () => {
      void channel.unsubscribe()
    }
  }, [invalidate])
}
