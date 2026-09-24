"use client"

import { Crown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { ClubMembership } from "@/lib/club-memberships"

interface ClubMemberBadgeProps {
  memberships?: readonly ClubMembership[] | null
  className?: string
}

/** Quiet "Club member" marker; hover or focus reveals each club and member number. */
export function ClubMemberBadge({ memberships, className }: ClubMemberBadgeProps) {
  const rows = (memberships ?? []).filter((row) => row.club.trim() && row.number.trim())
  if (rows.length === 0) return null

  const label = `Club member: ${rows.map((row) => `${row.club} ${row.number}`).join(", ")}`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          tabIndex={0}
          aria-label={label}
          className={cn(
            "h-5 cursor-default px-1.5 outline-none",
            "border-amber-300/60 bg-amber-50 text-amber-800",
            "dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300",
            className,
          )}
        >
          <Crown aria-hidden="true" />
          Club member
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start">
        <ul className="space-y-0.5">
          {rows.map((row) => (
            <li key={`${row.club}-${row.number}`} className="flex items-baseline gap-2">
              <span className="font-medium">{row.club}</span>
              <span className="font-mono tabular-nums opacity-70">{row.number}</span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}
