import { z } from "zod"
import type { Json } from "@/lib/supabase/types"

export interface ClubMembership {
  club: string
  number: string
}

export const MAX_CLUB_MEMBERSHIPS = 20

export const clubMembershipSchema = z.object({
  club: z.string().trim().min(1, "Club name is required").max(100),
  number: z.string().trim().min(1, "Member number is required").max(100),
})

export const clubMembershipsSchema = z.array(clubMembershipSchema).max(MAX_CLUB_MEMBERSHIPS)

function sameClub(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** Trims every entry and drops rows left completely blank. */
export function cleanClubMemberships(rows: readonly ClubMembership[]): ClubMembership[] {
  return rows
    .map((row) => ({ club: row.club.trim(), number: row.number.trim() }))
    .filter((row) => row.club || row.number)
}

/** True when a row has only one of the two fields filled in. */
export function isIncompleteClubMembership(row: ClubMembership): boolean {
  return Boolean(row.club.trim()) !== Boolean(row.number.trim())
}

export function hasIncompleteClubMembership(rows: readonly ClubMembership[]): boolean {
  return rows.some(isIncompleteClubMembership)
}

/**
 * Folds guest entries into a customer's list. Incoming wins on the number for a club the
 * customer already has (matched case-insensitively); new clubs are appended; nothing on
 * the existing list is ever removed.
 */
export function mergeClubMemberships(
  existing: readonly ClubMembership[],
  incoming: readonly ClubMembership[],
): ClubMembership[] {
  const merged = existing.map((row) => ({ ...row }))
  for (const row of cleanClubMemberships(incoming)) {
    if (!row.club || !row.number) continue
    const match = merged.find((current) => sameClub(current.club, row.club))
    if (match) match.number = row.number
    else merged.push(row)
  }
  return merged.slice(0, MAX_CLUB_MEMBERSHIPS)
}

export function clubMembershipsEqual(a: readonly ClubMembership[], b: readonly ClubMembership[]): boolean {
  return (
    a.length === b.length && a.every((row, index) => row.club === b[index].club && row.number === b[index].number)
  )
}

export function clubMembershipsToJson(rows: readonly ClubMembership[]): Json {
  return rows.map(({ club, number }) => ({ club, number }))
}

/** Reads a jsonb value from the database, discarding anything that isn't a {club, number} entry. */
export function parseClubMemberships(value: unknown): ClubMembership[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const { club, number } = entry as Record<string, unknown>
    if (typeof club !== "string" || typeof number !== "string") return []
    return [{ club, number }]
  })
}

/** Distinct club names, first spelling wins, sorted for a suggestion list. */
export function distinctClubNames(lists: readonly ClubMembership[][]): string[] {
  const seen = new Map<string, string>()
  for (const list of lists) {
    for (const { club } of list) {
      const name = club.trim()
      const key = name.toLowerCase()
      if (name && !seen.has(key)) seen.set(key, name)
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}
