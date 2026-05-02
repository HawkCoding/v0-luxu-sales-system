"use client"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { PresenceUser } from "@/hooks/use-record-presence"

interface PresenceAvatarsProps {
  users: PresenceUser[]
  className?: string
}

export function PresenceAvatars({ users, className }: PresenceAvatarsProps) {
  if (users.length === 0) return null

  return (
    <div className={cn("flex items-center -space-x-2", className)} aria-label="Other users viewing this record">
      {users.slice(0, 5).map((user) => (
        <Tooltip key={user.userId}>
          <TooltipTrigger asChild>
            <Avatar
              className={cn(
                "size-7 border-2 border-background bg-secondary",
                user.isEditing && "ring-2 ring-amber-500 ring-offset-1 ring-offset-background",
              )}
            >
              <AvatarFallback className="text-[10px] font-semibold">
                {user.initials}
              </AvatarFallback>
            </Avatar>
          </TooltipTrigger>
          <TooltipContent>
            {user.name} is {user.isEditing ? "editing" : "viewing"}
          </TooltipContent>
        </Tooltip>
      ))}
      {users.length > 5 ? (
        <div className="flex size-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-semibold text-muted-foreground">
          +{users.length - 5}
        </div>
      ) : null}
    </div>
  )
}
