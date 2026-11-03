/** A guest roster row as the voucher reads it (the `travellers` table, Reservation tab). */
export interface RoomRosterGuest {
  prefix: string | null
  first_name: string
  last_name: string
  /** The Reservation tab's free-text "Room with" field — usually the room-mate's name. */
  room_with?: string | null
}

/** "Mrs Carmen De Jongh" — title, first name and surname, as the voucher prints a guest. */
export function rosterGuestName(guest: RoomRosterGuest): string {
  return [guest.prefix, guest.first_name, guest.last_name].filter(Boolean).join(" ").trim()
}

/** ["A", "B", "C"] → "A, B and C" — the voucher names a party the way a sentence would. */
export function joinNameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ""
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

const TITLES = new Set(["mr", "mrs", "ms", "miss", "mx", "dr", "prof", "sir", "lady", "master", "rev", "adv"])

/** Lower-case words with punctuation and leading titles dropped: "Mr. Lourens de Jongh" → "lourens de jongh". */
function normalizeName(value: string): string {
  const words = value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  while (words.length > 1 && TITLES.has(words[0])) words.shift()
  return words.join(" ")
}

/** Splits "Lourens & Emma De Jongh" / "Lourens, Emma" / "Lourens and Emma" into its names. */
function splitRoomWith(value: string): string[] {
  return value
    .split(/\s*(?:[,&;/+]|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * The roster split into rooms, from the Reservation tab's "Room with" field — the only place the
 * reservation form's room arrangement is recorded (the website enquiry form lists guests flat, and
 * the roster has no suite/room link). Returns null when no guest's "Room with" is filled in, so the
 * caller keeps the party on one line rather than inventing pairs.
 *
 * "Room with" is free text, so it is read two ways:
 * - a guest's name (full name, with or without title, or a first name no one else on the roster
 *   shares) puts the two guests in one room — it only has to be written on one side;
 * - anything else ("Room 1", "Suite A") is a room label, and guests with the same label share.
 *
 * Rooms come out in roster order (by their first guest), guests within a room in roster order.
 * Guests the consultant did not place — no "Room with" of their own and named by nobody — are not
 * guessed into rooms: they stay together on one closing line, the way the whole party printed
 * before.
 */
export function groupGuestsByRoom<T extends RoomRosterGuest>(guests: T[]): T[][] | null {
  if (!guests.some((guest) => guest.room_with?.trim())) return null

  const parent = guests.map((_, idx) => idx)
  const find = (idx: number): number => {
    while (parent[idx] !== idx) {
      parent[idx] = parent[parent[idx]]
      idx = parent[idx]
    }
    return idx
  }
  const union = (a: number, b: number) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB)
  }

  // Each guest answers to their full name; a first name only when it is unique on the roster.
  const byName = new Map<string, number[]>()
  const addKey = (key: string, idx: number) => {
    if (!key) return
    const list = byName.get(key) ?? []
    if (!list.includes(idx)) list.push(idx)
    byName.set(key, list)
  }
  const firstNameCounts = new Map<string, number>()
  guests.forEach((guest) => {
    const first = normalizeName(guest.first_name)
    firstNameCounts.set(first, (firstNameCounts.get(first) ?? 0) + 1)
  })
  guests.forEach((guest, idx) => {
    addKey(normalizeName(`${guest.first_name} ${guest.last_name}`), idx)
    const first = normalizeName(guest.first_name)
    if (firstNameCounts.get(first) === 1) addKey(first, idx)
  })
  /** The one other guest a name points at — null when it names nobody, the guest themself, or is ambiguous. */
  const matchGuest = (name: string, self: number): number | null => {
    const matches = (byName.get(normalizeName(name)) ?? []).filter((idx) => idx !== self)
    return matches.length === 1 ? matches[0] : null
  }

  const placed = new Set<number>()
  const labels = new Map<string, number>()
  guests.forEach((guest, idx) => {
    const roomWith = guest.room_with?.trim()
    if (!roomWith) return
    placed.add(idx)
    const whole = matchGuest(roomWith, idx)
    const mates = whole != null ? [whole] : splitRoomWith(roomWith).map((part) => matchGuest(part, idx))
    const named = mates.filter((mate): mate is number => mate != null)
    if (named.length > 0) {
      for (const mate of named) {
        union(idx, mate)
        placed.add(mate)
      }
      return
    }
    // Names nobody on the roster: a room label, shared by everyone who wrote the same one.
    const label = normalizeName(roomWith)
    const holder = labels.get(label)
    if (holder == null) labels.set(label, idx)
    else union(idx, holder)
  })

  const rooms = new Map<number, T[]>()
  const unplaced: T[] = []
  guests.forEach((guest, idx) => {
    if (!placed.has(idx)) {
      unplaced.push(guest)
      return
    }
    const root = find(idx)
    const room = rooms.get(root) ?? []
    room.push(guest)
    rooms.set(root, room)
  })
  const grouped = [...rooms.entries()].sort(([a], [b]) => a - b).map(([, room]) => room)
  return unplaced.length > 0 ? [...grouped, unplaced] : grouped
}

/**
 * The voucher's "Guest Names" as one line per room — "Mrs Carmen De Jongh and Mr Lourens De Jongh".
 * Null when the roster carries no room arrangement or puts everyone in one room, which leaves the
 * caller's single joined line in place.
 */
export function guestNameLinesByRoom(guests: RoomRosterGuest[]): string[] | null {
  const rooms = groupGuestsByRoom(guests)
  if (!rooms) return null
  const lines = rooms
    .map((room) => joinNameList(room.map(rosterGuestName).filter(Boolean)))
    .filter(Boolean)
  return lines.length > 1 ? lines : null
}

/**
 * The voucher's "Guest Names" on a booking split into pax groups: one line per group in position
 * order — the Reservation tab's Suite pick, never a guess — then the guests not yet placed together
 * on a last line. Null when the booking has fewer than two groups or nobody is placed in one (the
 * caller then falls back to guestNameLinesByRoom), and when the lines would come to just one.
 */
export function guestNameLinesByPaxGroup(
  guests: Array<RoomRosterGuest & { pax_group_id?: string | null }>,
  groups: ReadonlyArray<PaxGroupRef>,
): string[] | null {
  if (groups.length < 2) return null
  const known = new Set(groups.map((group) => group.id))
  if (!guests.some((guest) => guest.pax_group_id && known.has(guest.pax_group_id))) return null
  const lines = [
    ...placedLines(guests, groups),
    joinNameList(
      guests
        .filter((guest) => !guest.pax_group_id || !known.has(guest.pax_group_id))
        .map(rosterGuestName)
        .filter(Boolean),
    ),
  ].filter(Boolean)
  return lines.length > 1 ? lines : null
}

/** A pax group as the voucher names it: its label ("Twin Deluxe Suite 1") heads its guest line. */
export interface PaxGroupRef {
  id: string
  position: number
  label?: string | null
}

/** One line per group that has guests, in position order: "Twin Deluxe Suite 1 – Mr Wei Lin
 *  and Mrs Mei Wang" (just the names when the group has no label). */
function placedLines(guests: ReadonlyArray<RoomRosterGuest & { pax_group_id?: string | null }>, groups: ReadonlyArray<PaxGroupRef>): string[] {
  return [...groups]
    .sort((a, b) => a.position - b.position)
    .map((group) => {
      const names = joinNameList(guests.filter((guest) => guest.pax_group_id === group.id).map(rosterGuestName).filter(Boolean))
      if (!names) return ""
      const label = group.label?.trim()
      return label ? `${label} – ${names}` : names
    })
    .filter(Boolean)
}

/** The suites' own headcount, as a transfer only they take reports it. */
export interface PaxGroupHeadcount {
  groupId: string
  adults: number
  children: number
  infants: number
}

/**
 * The voucher's transfer blocks on a booking split into pax groups: a trip only some suites take
 * says whose it is — a "Guests" line per suite — and counts them from those suites' own units, not
 * the vehicle's passenger count (a minibus for suites 1–5 is not "10 Adults"). Trips shared by every
 * suite, and every other block, come back unchanged.
 */
export function scopeTransferBlocksToPaxGroups<
  B extends { serviceType: string; transportRequestId?: string | null; serviceData: object },
>(
  blocks: readonly B[],
  {
    requestGroups,
    groups,
    headcounts,
    guests,
  }: {
    /** booking_transport_requests.pax_group_ids by request id. */
    requestGroups: ReadonlyMap<string, readonly string[]>
    groups: ReadonlyArray<PaxGroupRef>
    headcounts: readonly PaxGroupHeadcount[]
    guests: ReadonlyArray<RoomRosterGuest & { pax_group_id?: string | null }>
  },
): B[] {
  if (groups.length < 2) return [...blocks]
  const known = new Set(groups.map((group) => group.id))
  return blocks.map((block) => {
    if (block.serviceType !== "transfer" || !block.transportRequestId) return block
    const ids = new Set((requestGroups.get(block.transportRequestId) ?? []).filter((id) => known.has(id)))
    if (ids.size === 0 || ids.size >= known.size) return block
    const own = headcounts.filter((count) => ids.has(count.groupId))
    const paxGroupGuests = {
      lines: placedLines(guests, groups.filter((group) => ids.has(group.id))),
      adults: own.reduce((sum, count) => sum + count.adults, 0),
      children: own.reduce((sum, count) => sum + count.children, 0),
      infants: own.reduce((sum, count) => sum + count.infants, 0),
    }
    return { ...block, serviceData: { ...block.serviceData, paxGroupGuests } }
  })
}
