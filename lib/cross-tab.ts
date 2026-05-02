"use client"

import { useEffect, useRef } from "react"

export type RealtimeInvalidationEntity = "bookings" | "quotes" | "customers"

export type CrossTabEvent =
  | { type: "swr-invalidate"; entity: RealtimeInvalidationEntity }
  | { type: "record-saved"; entity: string; id: string; updatedAt: string }
  | { type: "auth-changed" }

let channel: BroadcastChannel | null | undefined

export function getCrossTabChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof window.BroadcastChannel === "undefined") {
    return null
  }

  if (channel === undefined) {
    channel = new BroadcastChannel("luxus-sync")
  }

  return channel
}

export function broadcast(event: CrossTabEvent): void {
  getCrossTabChannel()?.postMessage(event)
}

export function useCrossTab(handler: (event: CrossTabEvent) => void): void {
  const handlerRef = useRef(handler)

  useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => {
    const activeChannel = getCrossTabChannel()
    if (!activeChannel) return

    const handleMessage = (event: MessageEvent<CrossTabEvent>) => {
      handlerRef.current(event.data)
    }

    activeChannel.addEventListener("message", handleMessage)
    return () => activeChannel.removeEventListener("message", handleMessage)
  }, [])
}
