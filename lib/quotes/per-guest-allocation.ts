import type { PricingSnapshot, PricingUnitRef, SupplierKind } from "@/lib/types"

/** A quote_line_items row, or the subset this module needs. */
export interface PerGuestLine {
  total: number | null
  pricing_snapshot: unknown
}

export interface PerGuestInput {
  /** The quote's priced lines, commission line included. */
  lines: readonly PerGuestLine[]
  /** Paying adults (resolvePayingPax). */
  adults: number
  /** Paying children (resolvePayingPax). Infants are never a guest row of their own. */
  children: number
  /** The paying children's ages, in booking order — "Child 1" is childAges[0]. */
  childAges?: readonly number[]
  /** The figure the rows must add up to: the gross subtotal on the quote, the net total on the invoice. */
  target: number
}

/** One "what this person pays" row on the quote, the invoice and the quote email. */
export interface GuestShare {
  kind: "adult" | "child"
  /** 1-based within its kind: Adult 1, Adult 2, Child 1. */
  ordinal: number
  label: string
  amount: number
  /** True when this guest is the only paying occupant of every unit they were seated in. */
  single: boolean
  /** True when a single-supplement line was allocated to this guest. */
  supplement: boolean
  age: number | null
}

interface Guest {
  kind: "adult" | "child"
  ordinal: number
  raw: number
  soloUnits: number
  sharedUnits: number
  supplement: boolean
}

interface SeatedUnit {
  adults: Guest[]
  children: Guest[]
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function snapshotOf(line: PerGuestLine): PricingSnapshot | null {
  return (line.pricing_snapshot as PricingSnapshot | null) ?? null
}

/** Kinds whose lines belong to a suite, room or tour party — the lines that must carry unitRefs. */
const UNIT_KINDS: ReadonlySet<SupplierKind> = new Set<SupplierKind>([
  "hotel_property",
  "train_operator",
  "tour_operator",
  "cruise_line",
  "airline",
])
const ROOM_KINDS: ReadonlySet<SupplierKind> = new Set<SupplierKind>(["hotel_property", "train_operator", "cruise_line"])

/** A line priced per unit of a suite/room/party, as opposed to a booking-wide shared cost. Lines
 *  built before unitRefs existed are unit lines without refs, so the whole allocation bails out. */
function isUnitLine(snapshot: PricingSnapshot | null): boolean {
  return (
    !!snapshot &&
    !snapshot.commission &&
    !snapshot.isExtra &&
    !!snapshot.legId &&
    snapshot.pricingMode !== "fixed_package" &&
    !!snapshot.supplierKind &&
    UNIT_KINDS.has(snapshot.supplierKind)
  )
}

/** "per person", "per person sharing", "per person per night" — a fare charged per traveller. */
function isPerTravellerUnit(unit: string | null | undefined): boolean {
  return (unit ?? "").trim().toLowerCase().startsWith("per person")
}

/** The guest kind a per-traveller fare line charges, or null when the line is the unit's own cost
 *  (a per-room rate, a typed room or tour price) to split among its occupants. */
function fareKind(snapshot: PricingSnapshot): "adult" | "child" | "infant" | null {
  if (
    snapshot.manualRoomPrice != null ||
    snapshot.manualTourPrice != null ||
    !isPerTravellerUnit(snapshot.unit)
  ) {
    return null
  }
  if (snapshot.passengerKind === "adult" || snapshot.passengerKind === "single_supplement") return "adult"
  if (snapshot.passengerKind === "child") return "child"
  if (snapshot.passengerKind === "infant") return "infant"
  return null
}

function splitEvenly(amount: number, guests: readonly Guest[]): void {
  if (guests.length === 0) return
  const share = amount / guests.length
  for (const guest of guests) guest.raw += share
}

function labelFor(guest: Guest, age: number | null): string {
  if (guest.kind === "child") return `Child ${guest.ordinal}${age != null ? ` (age ${age})` : ""}`
  const base = `Adult ${guest.ordinal}`
  if (guest.supplement) return `${base} (single, supplement incl.)`
  if (guest.soloUnits > 0 && guest.sharedUnits === 0) return `${base} (single)`
  if (guest.sharedUnits > 0) return `${base} (sharing)`
  return base
}

/**
 * One row per paying guest — "Adult 1 (sharing)", "Adult 3 (single, supplement incl.)", "Child 1
 * (age 6)" — saying what that person pays. Replaces the flat "Total per Adult / Total per Child"
 * split wherever it can be worked out; null tells the caller to keep those rows.
 *
 * Seating: on each leg the units (suites, rooms, tour parties) are ordered by paying occupants,
 * largest first, then by their position on the leg, and guests are seated in that order — so a lone
 * traveller takes the highest ordinal on every leg and is the same "Adult 3" throughout.
 *
 * Splitting:
 * - a per-person fare line goes to the guests of its kind in the units it covers;
 * - an infant's fare goes to the paying occupants of the infant's unit;
 * - a per-room or per-unit line (a hotel room rate, a typed room or tour price) is split evenly
 *   among its unit's paying occupants, so a lone occupant carries the whole room;
 * - every other line (transfers, rentals, extras, a fixed package) is shared evenly by all guests;
 * - Commission (and the Rounding folded into it) and any quote-level discount are spread pro rata,
 *   by scaling every row to `target`.
 *
 * Rows are rounded to cents and the last of the highest-paying guests takes the remainder, so they
 * add up to `target` exactly.
 *
 * Returns null — keep today's rows — when there are no guests or no target, when a unit line carries
 * no unitRefs (a quote built before they existed), or when a leg seats more adults or children than
 * the booking pays for.
 */
export function allocatePerGuest({ lines, adults, children, childAges = [], target }: PerGuestInput): GuestShare[] | null {
  if (!(target > 0)) return null
  const adultCount = Math.max(0, Math.floor(adults))
  const childCount = Math.max(0, Math.floor(children))
  if (adultCount + childCount === 0) return null

  const makeGuest = (kind: Guest["kind"], ordinal: number): Guest => ({
    kind,
    ordinal,
    raw: 0,
    soloUnits: 0,
    sharedUnits: 0,
    supplement: false,
  })
  const adultGuests = Array.from({ length: adultCount }, (_, index) => makeGuest("adult", index + 1))
  const childGuests = Array.from({ length: childCount }, (_, index) => makeGuest("child", index + 1))
  const allGuests = [...adultGuests, ...childGuests]

  // Every unit each leg's lines refer to, so the leg can be seated once before any line is split.
  const unitsByLeg = new Map<string, Map<number, PricingUnitRef>>()
  // Legs whose units are rooms or suites — the only ones that make a guest "sharing" or "single".
  // A tour party or a flight booking of one is not a single room.
  const roomLegs = new Set<string>()
  for (const line of lines) {
    const snapshot = snapshotOf(line)
    if (!isUnitLine(snapshot) || !snapshot) continue
    const refs = snapshot.unitRefs ?? []
    if (refs.length === 0) return null
    const legKey = snapshot.legId ?? ""
    if (snapshot.supplierKind && ROOM_KINDS.has(snapshot.supplierKind)) roomLegs.add(legKey)
    const legUnits = unitsByLeg.get(legKey) ?? new Map<number, PricingUnitRef>()
    for (const ref of refs) if (!legUnits.has(ref.index)) legUnits.set(ref.index, ref)
    unitsByLeg.set(legKey, legUnits)
  }

  const seating = new Map<string, Map<number, SeatedUnit>>()
  for (const [legKey, legUnits] of unitsByLeg) {
    const countsRoom = roomLegs.has(legKey)
    // Equal-sized units seat adults-only ones first, so a pair of 2 adults and a parent with a child
    // seat the same way on the train and at the hotel whichever order they were entered in.
    const ordered = [...legUnits.values()].sort(
      (a, b) => b.adults + b.children - (a.adults + a.children) || a.children - b.children || a.index - b.index,
    )
    const seated = new Map<number, SeatedUnit>()
    let nextAdult = 0
    let nextChild = 0
    for (const ref of ordered) {
      if (nextAdult + ref.adults > adultCount || nextChild + ref.children > childCount) return null
      const unit: SeatedUnit = {
        adults: adultGuests.slice(nextAdult, nextAdult + ref.adults),
        children: childGuests.slice(nextChild, nextChild + ref.children),
      }
      nextAdult += ref.adults
      nextChild += ref.children
      const occupants = [...unit.adults, ...unit.children]
      if (countsRoom) {
        // An infant counts here as pricing counts it: an adult alone with a baby is not a single.
        const alone = ref.adults + ref.children + ref.infants === 1
        for (const guest of occupants) {
          if (alone) guest.soloUnits += 1
          else guest.sharedUnits += 1
        }
      }
      seated.set(ref.index, unit)
    }
    seating.set(legKey, seated)
  }

  for (const line of lines) {
    const snapshot = snapshotOf(line)
    const amount = Number(line.total ?? 0)
    // Commission and the Rounding folded into it ride on everything else: the scale to `target`
    // below spreads them pro rata.
    if (snapshot?.commission || amount === 0) continue
    if (!isUnitLine(snapshot) || !snapshot) {
      splitEvenly(amount, allGuests)
      continue
    }

    const legSeating = seating.get(snapshot.legId ?? "")
    const units = (snapshot.unitRefs ?? [])
      .map((ref) => legSeating?.get(ref.index))
      .filter((unit): unit is SeatedUnit => !!unit)
    const kind = fareKind(snapshot)
    const recipients =
      kind === "adult"
        ? units.flatMap((unit) => unit.adults)
        : kind === "child"
          ? units.flatMap((unit) => unit.children)
          : null

    if (recipients && recipients.length > 0) {
      splitEvenly(amount, recipients)
      if ((snapshot.singleSupplementPct ?? 0) > 0) for (const guest of recipients) guest.supplement = true
      continue
    }

    // A unit's own cost (per room, per unit, an infant's fare): each unit carries an even share,
    // split among its paying occupants. A unit with nobody paying in it falls back to everyone.
    const share = amount / Math.max(1, units.length)
    for (const unit of units) {
      const occupants = [...unit.adults, ...unit.children]
      splitEvenly(share, occupants.length > 0 ? occupants : allGuests)
    }
    if (units.length === 0) splitEvenly(amount, allGuests)
  }

  const rawSum = allGuests.reduce((sum, guest) => sum + guest.raw, 0)
  if (!(rawSum > 0) || allGuests.some((guest) => guest.raw < 0)) return null

  const scale = target / rawSum
  const amounts = allGuests.map((guest) => round2(guest.raw * scale))
  // The cent left over goes to the last of the guests paying the most — never to a child sharing
  // free, who would otherwise print R0,01 or -R0,01.
  let absorber = 0
  allGuests.forEach((guest, index) => {
    if (guest.raw >= allGuests[absorber].raw) absorber = index
  })
  const others = amounts.reduce((sum, value, index) => (index === absorber ? sum : sum + value), 0)
  amounts[absorber] = round2(target - others)

  return allGuests.map((guest, index) => {
    const age = guest.kind === "child" ? (childAges[guest.ordinal - 1] ?? null) : null
    return {
      kind: guest.kind,
      ordinal: guest.ordinal,
      label: labelFor(guest, age),
      amount: amounts[index],
      single: guest.soloUnits > 0 && guest.sharedUnits === 0,
      supplement: guest.supplement,
      age,
    }
  })
}
