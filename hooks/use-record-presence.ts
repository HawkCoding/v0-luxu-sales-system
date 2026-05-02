"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { getSupabase } from "@/lib/supabase/client"

export interface PresenceUser {
  userId: string
  name: string
  initials: string
  isEditing: boolean
  lastSeenAt: number
}

interface PresencePayload {
  userId: string
  name: string
  initials: string
  isEditing: boolean
  lastSeenAt: number
}

function getInitials(name: string, email: string): string {
  const source = name.trim() || email.trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase()
  }

  return (source.slice(0, 2) || "U").toUpperCase()
}

export function useRecordPresence(
  scope: string,
  recordId: string | undefined,
): {
  others: PresenceUser[]
  setEditing: (editing: boolean) => void
} {
  const { user } = useAuth()
  const [others, setOthers] = useState<PresenceUser[]>([])
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabase>["channel"]> | null>(null)
  const editingRef = useRef(false)

  const currentUserId = user?.id ?? user?.email ?? ""
  const basePayload = useMemo(() => {
    if (!user || !currentUserId) return null

    return {
      userId: currentUserId,
      name: user.name || user.email,
      initials: getInitials(user.name, user.email),
    }
  }, [currentUserId, user])

  const trackPresence = useCallback(
    (isEditing: boolean) => {
      if (!basePayload || !channelRef.current) return

      void channelRef.current.track({
        ...basePayload,
        isEditing,
        lastSeenAt: Date.now(),
      } satisfies PresencePayload)
    },
    [basePayload],
  )

  useEffect(() => {
    if (!basePayload || !recordId) return

    const supabase = getSupabase()
    const channel = supabase.channel(`presence:${scope}:${recordId}`, {
      config: { presence: { key: basePayload.userId } },
    })

    channelRef.current = channel

    const syncPresence = () => {
      const state = channel.presenceState<PresencePayload>()
      const nextUsers = Object.entries(state)
        .flatMap(([presenceKey, payloads]) =>
          payloads
            .filter((payload) => payload.userId !== basePayload.userId && presenceKey !== basePayload.userId)
            .map((payload) => ({
              userId: payload.userId,
              name: payload.name,
              initials: payload.initials,
              isEditing: payload.isEditing,
              lastSeenAt: payload.lastSeenAt,
            })),
        )
        .sort((a, b) => b.lastSeenAt - a.lastSeenAt)

      setOthers(nextUsers)
    }

    channel.on("presence", { event: "sync" }, syncPresence)
    channel.on("presence", { event: "join" }, syncPresence)
    channel.on("presence", { event: "leave" }, syncPresence)
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        trackPresence(editingRef.current)
      }
    })

    return () => {
      channelRef.current = null
      setOthers([])
      void channel.unsubscribe()
    }
  }, [basePayload, recordId, scope, trackPresence])

  const setEditing = useCallback(
    (editing: boolean) => {
      editingRef.current = editing
      trackPresence(editing)
    },
    [trackPresence],
  )

  return { others, setEditing }
}
