import { getSupplierVocabulary, type PaxGroupMeta, type PricingSnapshot, type PricingUnitRef, type SupplierKind } from "@/lib/types"

/** A quote_line_items / invoice line row, or the subset this module needs. */
export interface PaxGroupPricingLine {
  total: number | null
  pricing_snapshot: unknown
}

export interface PaxGroupPricingInput {
  lines: readonly PaxGroupPricingLine[]
  /** The figure the group subtotals add up to: the GROSS subtotal on both quote and invoice. */
  target: number
  /** rate_types.short_label by id; null/blank prints no tag. */
  rateLabels?: ReadonlyMap<string, string | null>
}

export interface PaxGroupPricePart {
  kind: "adult" | "child"
  count: number
  perPerson: number
  rateTypeId: string | null
  rateLabel: string | null
  /** A single supplement was charged to this guest (alone in the suite). */
  supplement: boolean
}

export interface PaxGroupPriceLine {
  groupId: string
  position: number
  label: string
  parts: PaxGroupPricePart[]
  /** Σ count × perPerson, exactly. */
  subtotal: number
  adults: number
  children: number
}

export interface PaxGroupPricing {
  lines: PaxGroupPriceLine[]
  adults: number
  children: number
  total: number
}

type PersonKind = "adult" | "child"

/** One paying guest of the booking's primary service, as allocation sees them. */
interface Person {
  groupId: string
  kind: PersonKind
  rateTypeId: string | null
  raw: number
  supplement: boolean
}

/** Where one unitRef's share of a line may land: `narrow` first, `wide` when that holds nobody fitting. */
interface RefScope {
  narrow: Person[]
  wide: Person[]
}

interface Bucket {
  kind: PersonKind
  rateTypeId: string | null
  supplement: boolean
  count: number
  sum: number
}

/** A part while cents are still being settled. */
interface CentPart extends Omit<PaxGroupPricePart, "perPerson"> {
  perPersonCents: number
  /** The bucket's scaled mean, in rand, before rounding. */
  rawMean: number
  /** Another group holds an identical part (same kind, rate, supplement and price): the two must print alike. */
  twin: boolean
}

/** Two raw means within half a cent price the same guest. */
const TWIN_TOLERANCE = 0.005

function isTwinOf(a: CentPart, b: CentPart): boolean {
  return (
    a.kind === b.kind &&
    a.rateTypeId === b.rateTypeId &&
    a.supplement === b.supplement &&
    Math.abs(a.rawMean - b.rawMean) < TWIN_TOLERANCE
  )
}

interface CentLine {
  group: PaxGroupMeta
  parts: CentPart[]
  adults: number
  children: number
}

function snapshotOf(line: { pricing_snapshot: unknown }): PricingSnapshot | null {
  const value = line.pricing_snapshot
  return value && typeof value === "object" ? (value as PricingSnapshot) : null
}

function headcount(value: unknown): number {
  const count = Math.floor(Number(value))
  return Number.isFinite(count) && count > 0 ? count : 0
}

/** Kinds whose lines belong to a suite, room or tour party — the lines that must carry unitRefs. */
const UNIT_KINDS: ReadonlySet<SupplierKind> = new Set<SupplierKind>([
  "hotel_property",
  "train_operator",
  "tour_operator",
  "cruise_line",
  "airline",
])

/** A line priced per unit of a suite/room/party, as opposed to a booking-wide shared cost. Lines
 *  built before unitRefs existed are unit lines without refs, so allocation bails out on them. */
function isUnitLine(snapshot: PricingSnapshot): boolean {
  return (
    !snapshot.commission &&
    !snapshot.isExtra &&
    !!snapshot.legId &&
    snapshot.pricingMode !== "fixed_package" &&
    !!snapshot.supplierKind &&
    UNIT_KINDS.has(snapshot.supplierKind)
  )
}

/** A line of the booking's primary service on a booking split into pax groups. */
function isPrimaryLine(snapshot: PricingSnapshot): boolean {
  return Array.isArray(snapshot.paxGroups) && snapshot.paxGroups.length >= 2
}

/** "per person", "per person sharing", "per person per night" — a fare charged per traveller. */
function isPerTravellerUnit(unit: string | null | undefined): boolean {
  return (unit ?? "").trim().toLowerCase().startsWith("per person")
}

/** The guest kind a per-traveller fare line charges, or null when the line is the unit's own cost
 *  (a per-room rate, a typed room or tour price) to split among its occupants. */
function fareKind(snapshot: PricingSnapshot): "adult" | "child" | "infant" | null {
  if (snapshot.manualRoomPrice != null || snapshot.manualTourPrice != null || !isPerTravellerUnit(snapshot.unit)) {
    return null
  }
  if (snapshot.passengerKind === "adult" || snapshot.passengerKind === "single_supplement") return "adult"
  if (snapshot.passengerKind === "child") return "child"
  if (snapshot.passengerKind === "infant") return "infant"
  return null
}

function isPaxGroupMeta(value: unknown): value is PaxGroupMeta {
  if (!value || typeof value !== "object") return false
  const group = value as Partial<PaxGroupMeta>
  return typeof group.id === "string" && group.id.length > 0 && typeof group.position === "number"
}

/**
 * The booking's pax groups as the pricing engine stamped them on its primary-service lines, in
 * position order — or null when the lines carry fewer than 2 (no group mode, or a quote built before
 * pax groups existed).
 */
export function readPaxGroups(lines: readonly { pricing_snapshot: unknown }[]): PaxGroupMeta[] | null {
  const byId = new Map<string, PaxGroupMeta>()
  for (const line of lines) {
    const snapshot = snapshotOf(line)
    if (!snapshot || !isPrimaryLine(snapshot)) continue
    for (const group of snapshot.paxGroups ?? []) {
      if (!isPaxGroupMeta(group) || byId.has(group.id)) continue
      const label = typeof group.label === "string" && group.label.trim() ? group.label.trim() : `Suite ${group.position}`
      byId.set(group.id, { id: group.id, position: group.position, label })
    }
  }
  if (byId.size < 2) return null
  return [...byId.values()].sort((a, b) => a.position - b.position)
}

/** One primary unit — or one rate slice of it — identified the way the engine's merge keeps it apart. */
function sliceKey(snapshot: PricingSnapshot, ref: PricingUnitRef): string {
  return [snapshot.legId ?? "", ref.unitId ?? `#${ref.index}`, ref.rateTypeId ?? snapshot.rateTypeId ?? ""].join("|")
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)]
}

/** The first candidate list holding anyone. */
function firstNonEmpty(...candidates: Person[][]): Person[] {
  return candidates.find((candidate) => candidate.length > 0) ?? []
}

function splitEvenly(amount: number, persons: readonly Person[]): void {
  if (persons.length === 0) return
  const share = amount / persons.length
  for (const person of persons) person.raw += share
}

function compareLabels(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a.localeCompare(b)
}

function compareParts(a: Omit<PaxGroupPricePart, "count" | "perPerson">, b: Omit<PaxGroupPricePart, "count" | "perPerson">): number {
  return (
    (a.kind === b.kind ? 0 : a.kind === "adult" ? -1 : 1) ||
    compareLabels(a.rateLabel, b.rateLabel) ||
    compareLabels(a.rateTypeId, b.rateTypeId) ||
    Number(a.supplement) - Number(b.supplement)
  )
}

/**
 * One line per pax group — "Twin Deluxe Suite 2 - 1 Adult x R24 100,00 (SA) & 1 Adult x R29 400,00
 * (TW)" — saying what that suite's guests pay for the whole package. Replaces the flat "Total per
 * Adult / Child" rows wherever it can be worked out; null tells the caller to keep those rows.
 *
 * Persons are the paying guests of the primary service's units (one group each), taken from the
 * primary-leg lines' unitRefs — one person per adult or child of each unit or rate slice, carrying
 * that slice's rate type. Infants are never persons.
 *
 * Splitting (commission lines and zero amounts are skipped):
 * - a per-person fare line goes evenly to the persons of its kind in the units it covers — on the
 *   primary leg, that unit slice's own guests; elsewhere, every guest of the groups the unit serves
 *   (all groups when it serves `[]`). An infant's fare goes to the adults there;
 * - a unit's own cost (a per-room rate, a typed room or tour price) is shared evenly by its refs,
 *   then evenly among each ref's paying guests — so an apartment for suites 2 and 3 is split per
 *   person across both;
 * - a transfer or rental with paxGroupIds goes evenly to those groups' paying guests;
 * - everything else (extras, a fixed package, an unassigned transfer) goes evenly to everyone;
 * - a recipient set that comes out empty falls back to the wider set, then to everyone;
 * - singleSupplementPct > 0 marks the recipients as carrying a single supplement.
 *
 * Every person is then scaled by `target / Σ`, which spreads commission (and the Rounding folded into
 * it) pro rata. Each group's persons are bucketed by (kind, rate type, supplement), each bucket priced
 * at its mean to the cent; identical buckets in different groups (a raw mean within half a cent)
 * share one price. The cent residual is then settled so the subtotals add up to `target` exactly, on
 * a bucket whose price no other group shares: a bucket of one, else the largest bucket the residual
 * divides evenly (ties to the highest-subtotal group). Failing that, on any bucket of one (the
 * highest-priced), else by splitting one guest off the highest-priced bucket of the highest-subtotal
 * group.
 *
 * Returns null when no line carries 2+ pax groups, when a unit line has no unitRefs (a quote built
 * before they existed), when `target ≤ 0`, or when the persons can't be built (a primary unit with no
 * known group, or a group with no paying guest).
 */
export function allocatePaxGroups({ lines, target, rateLabels }: PaxGroupPricingInput): PaxGroupPricing | null {
  if (!(target > 0) || !Number.isFinite(target)) return null
  const groups = readPaxGroups(lines)
  if (!groups) return null

  for (const line of lines) {
    const snapshot = snapshotOf(line)
    if (snapshot && isUnitLine(snapshot) && (snapshot.unitRefs ?? []).length === 0) return null
  }

  const groupIds = new Set(groups.map((group) => group.id))
  const allGroupIds = groups.map((group) => group.id)
  const personsByGroup = new Map<string, Person[]>(allGroupIds.map((id) => [id, []]))
  const slices = new Map<string, Person[]>()
  const everyone: Person[] = []

  for (const line of lines) {
    const snapshot = snapshotOf(line)
    if (!snapshot || !isPrimaryLine(snapshot) || !isUnitLine(snapshot)) continue
    for (const ref of snapshot.unitRefs ?? []) {
      const key = sliceKey(snapshot, ref)
      if (slices.has(key)) continue
      const groupId = ref.paxGroupIds?.[0]
      const groupPersons = groupId ? personsByGroup.get(groupId) : undefined
      if (!groupId || !groupPersons) return null
      const rateTypeId = ref.rateTypeId ?? snapshot.rateTypeId ?? null
      const slice: Person[] = []
      const add = (kind: PersonKind, count: number) => {
        for (let i = 0; i < count; i += 1) {
          slice.push({ groupId, kind, rateTypeId, raw: 0, supplement: false })
        }
      }
      add("adult", headcount(ref.adults))
      add("child", headcount(ref.children))
      slices.set(key, slice)
      groupPersons.push(...slice)
      everyone.push(...slice)
    }
  }
  if (everyone.length === 0) return null
  if ([...personsByGroup.values()].some((persons) => persons.length === 0)) return null

  /** The persons of the groups named, or of every group when none of them is known. */
  const personsOfGroups = (ids: readonly string[] | undefined): Person[] => {
    const known = unique((ids ?? []).filter((id) => groupIds.has(id)))
    return (known.length > 0 ? known : allGroupIds).flatMap((id) => personsByGroup.get(id) ?? [])
  }

  for (const line of lines) {
    const snapshot = snapshotOf(line)
    const amount = Number(line.total ?? 0)
    // Commission and the Rounding folded into it ride on everything else: the scale to `target`
    // below spreads them pro rata.
    if (snapshot?.commission || !Number.isFinite(amount) || amount === 0) continue

    if (!snapshot || !isUnitLine(snapshot)) {
      const ids = snapshot?.paxGroupIds ?? []
      splitEvenly(amount, ids.length > 0 ? firstNonEmpty(personsOfGroups(ids), everyone) : everyone)
      continue
    }

    const primary = isPrimaryLine(snapshot)
    const scopes: RefScope[] = (snapshot.unitRefs ?? []).map((ref) => {
      if (!primary) {
        const members = personsOfGroups(ref.paxGroupIds)
        return { narrow: members, wide: members }
      }
      // A primary ref is its own slice's guests; its whole suite stands behind it (an infant in a
      // slice whose adults all moved to another rate still lands on the suite's adults).
      const slice = slices.get(sliceKey(snapshot, ref)) ?? []
      const ownGroup = ref.paxGroupIds?.[0]
      const suite = (ownGroup ? personsByGroup.get(ownGroup) : undefined) ?? []
      return { narrow: slice, wide: suite.length > 0 ? suite : slice }
    })
    const supplement = (snapshot.singleSupplementPct ?? 0) > 0
    const mark = (persons: readonly Person[]) => {
      if (supplement) for (const person of persons) person.supplement = true
    }

    const kind = fareKind(snapshot)
    if (kind !== null) {
      const wanted: PersonKind = kind === "child" ? "child" : "adult"
      const narrow = unique(scopes.flatMap((scope) => scope.narrow))
      const wide = unique(scopes.flatMap((scope) => scope.wide))
      const recipients = firstNonEmpty(
        narrow.filter((person) => person.kind === wanted),
        wide.filter((person) => person.kind === wanted),
        narrow,
        wide,
        everyone,
      )
      splitEvenly(amount, recipients)
      mark(recipients)
      continue
    }

    // A unit's own cost: each ref carries an even share, split among its paying guests.
    const share = amount / Math.max(1, scopes.length)
    for (const scope of scopes) {
      const recipients = firstNonEmpty(scope.narrow, scope.wide, everyone)
      splitEvenly(share, recipients)
      mark(recipients)
    }
  }

  const rawSum = everyone.reduce((sum, person) => sum + person.raw, 0)
  if (!(rawSum > 0) || everyone.some((person) => person.raw < 0)) return null
  const scale = target / rawSum

  const labelOf = (rateTypeId: string | null): string | null => {
    if (!rateTypeId) return null
    return rateLabels?.get(rateTypeId)?.trim() || null
  }

  const centLines: CentLine[] = groups.map((group) => {
    const persons = personsByGroup.get(group.id) ?? []
    const buckets = new Map<string, Bucket>()
    for (const person of persons) {
      const key = [person.kind, person.rateTypeId ?? "", person.supplement ? "1" : "0"].join("|")
      const bucket = buckets.get(key) ?? {
        kind: person.kind,
        rateTypeId: person.rateTypeId,
        supplement: person.supplement,
        count: 0,
        sum: 0,
      }
      bucket.count += 1
      bucket.sum += person.raw * scale
      buckets.set(key, bucket)
    }
    const parts: CentPart[] = [...buckets.values()]
      .map((bucket) => ({
        kind: bucket.kind,
        count: bucket.count,
        perPersonCents: Math.round((bucket.sum / bucket.count) * 100),
        rawMean: bucket.sum / bucket.count,
        twin: false,
        rateTypeId: bucket.rateTypeId,
        rateLabel: labelOf(bucket.rateTypeId),
        supplement: bucket.supplement,
      }))
      .sort(compareParts)
    return {
      group,
      parts,
      adults: persons.filter((person) => person.kind === "adult").length,
      children: persons.filter((person) => person.kind === "child").length,
    }
  })

  // Identical guests print one price: a part matching an earlier group's part (same kind, rate,
  // supplement, and a raw mean within half a cent) takes that part's rounded price.
  const seen: CentPart[] = []
  for (const line of centLines) {
    for (const part of line.parts) {
      const anchor = seen.find((other) => isTwinOf(other, part))
      if (anchor) {
        part.perPersonCents = anchor.perPersonCents
        part.twin = true
        anchor.twin = true
      } else {
        seen.push(part)
      }
    }
  }

  const subtotalCents = (line: CentLine) => line.parts.reduce((sum, part) => sum + part.count * part.perPersonCents, 0)
  const targetCents = Math.round(target * 100)
  const residual = targetCents - centLines.reduce((sum, line) => sum + subtotalCents(line), 0)

  if (residual !== 0) {
    // The cents land where no other group prints the same price, so identical guests stay alike:
    // first a guest priced on their own, then the largest bucket the residual divides evenly. Never
    // a child sharing free, who would otherwise print R0,01 or -R0,01. Ties go to the
    // highest-subtotal group, then the highest price.
    const candidates = centLines.flatMap((line) =>
      line.parts
        .filter((part) => !part.twin && part.perPersonCents > 0)
        .map((part) => ({ line, part, subtotal: subtotalCents(line) })),
    )
    const better = (a: (typeof candidates)[number], b: (typeof candidates)[number] | null): boolean =>
      !b || a.subtotal > b.subtotal || (a.subtotal === b.subtotal && a.part.perPersonCents > b.part.perPersonCents)

    let chosen: { part: CentPart; add: number } | null = null
    let best: (typeof candidates)[number] | null = null
    for (const candidate of candidates) {
      if (candidate.part.count !== 1 || candidate.part.perPersonCents + residual < 0) continue
      if (better(candidate, best)) best = candidate
    }
    if (best) chosen = { part: best.part, add: residual }
    if (!chosen) {
      for (const candidate of candidates) {
        const { count, perPersonCents } = candidate.part
        if (count < 2 || residual % count !== 0 || perPersonCents + residual / count < 0) continue
        if (!best || count > best.part.count || (count === best.part.count && better(candidate, best))) best = candidate
      }
      if (best) chosen = { part: best.part, add: residual / best.part.count }
    }

    // Today's fallback when every priced part has a twin or nothing divides: a guest priced on their
    // own, the highest-priced first.
    if (!chosen) {
      let single: CentPart | null = null
      for (const line of centLines) {
        for (const part of line.parts) {
          if (part.count !== 1 || part.perPersonCents <= 0 || part.perPersonCents + residual < 0) continue
          if (!single || part.perPersonCents > single.perPersonCents) single = part
        }
      }
      if (single) chosen = { part: single, add: residual }
    }

    if (chosen) {
      chosen.part.perPersonCents += chosen.add
    } else {
      // Nobody alone in a bucket: one guest of the highest-priced bucket in the highest-subtotal
      // group is split off at their own price.
      let host: CentLine | null = null
      for (const line of centLines) {
        if (!host || subtotalCents(line) > subtotalCents(host)) host = line
      }
      const parts = host?.parts ?? []
      let index = -1
      parts.forEach((part, partIndex) => {
        if (index === -1 || part.perPersonCents > parts[index].perPersonCents) index = partIndex
      })
      if (index === -1) return null
      const part = parts[index]
      if (part.count === 1) {
        part.perPersonCents += residual
      } else {
        part.count -= 1
        parts.splice(index + 1, 0, { ...part, count: 1, perPersonCents: part.perPersonCents + residual })
      }
    }
  }

  const priced: PaxGroupPriceLine[] = centLines.map((line) => ({
    groupId: line.group.id,
    position: line.group.position,
    label: line.group.label,
    parts: line.parts.map(({ perPersonCents, rawMean: _rawMean, twin: _twin, ...part }) => ({
      ...part,
      perPerson: perPersonCents / 100,
    })),
    subtotal: subtotalCents(line) / 100,
    adults: line.adults,
    children: line.children,
  }))

  return {
    lines: priced,
    adults: priced.reduce((sum, line) => sum + line.adults, 0),
    children: priced.reduce((sum, line) => sum + line.children, 0),
    total: targetCents / 100,
  }
}

function formatPart(part: PaxGroupPricePart, money: (n: number) => string): string {
  const one = part.count === 1
  const noun = part.kind === "adult" ? (one ? "Adult" : "Adults") : one ? "Child" : "Children"
  let text = `${part.count} ${noun} x ${money(part.perPerson)}`
  if (!one) text += part.kind === "adult" ? " per person" : " per child"
  if (part.supplement) text += " (single, supplement incl.)"
  const label = part.rateLabel?.trim()
  if (label) text += ` (${label})`
  return text
}

/** "1 Adult x R24 100,00 (SA) & 1 Adult x R29 400,00 (TW)" — the group's parts, without its name. */
export function formatPaxGroupParts(line: PaxGroupPriceLine, money: (n: number) => string): string {
  return line.parts.map((part) => formatPart(part, money)).join(" & ")
}

/** One string per part, for a narrow column that prints each on its own line:
 *  ["1 Adult x R41 939,17 (SA)", "1 Adult x R65 339,13 (TW)"]. Each is held together with
 *  non-breaking spaces between the count, its guests, the "x" and the price. */
export function formatPaxGroupPartLines(line: PaxGroupPriceLine, money: (n: number) => string): string[] {
  return line.parts.map((part) =>
    formatPart(part, money).replace(
      /^(\d+) (Adults?|Child(?:ren)?) x /,
      (_match, count: string, noun: string) => `${count} ${noun} x `,
    ),
  )
}

/** "Twin Deluxe Suite 2 - 1 Adult x R24 100,00 (SA) & 1 Adult x R29 400,00 (TW)". */
export function formatPaxGroupLine(line: PaxGroupPriceLine, money: (n: number) => string): string {
  return `${line.label} - ${formatPaxGroupParts(line, money)}`
}

/** formatPaxGroupLine for the quote PDF's narrow column, without rate labels: "2 Adults" and "x R23 800,00" each held together with
 *  a non-breaking space, so a wrapped line never strands a count from its guests or an "x" from its
 *  price ("… 2 Adults / x R23 800,00 per person"). */
export function formatPaxGroupLineForPrint(line: PaxGroupPriceLine, money: (n: number) => string): string {
  const unlabelled = { ...line, parts: line.parts.map((part) => ({ ...part, rateLabel: null })) }
  return formatPaxGroupLine(unlabelled, money).replace(
    /(\d+) (Adults?|Child(?:ren)?) x /g,
    (_match, count: string, noun: string) => `${count} ${noun} x `,
  )
}

/** The groups one line serves, or null when it serves every group. */
function servedGroupIds(snapshot: PricingSnapshot, known: ReadonlySet<string>): Set<string> | null {
  if (isPrimaryLine(snapshot)) return null
  const refs = snapshot.unitRefs ?? []
  if (isUnitLine(snapshot) || refs.length > 0) {
    if (refs.length === 0) return null
    const served = new Set<string>()
    for (const ref of refs) {
      const ids = (ref.paxGroupIds ?? []).filter((id) => known.has(id))
      if (ids.length === 0) return null
      for (const id of ids) served.add(id)
    }
    return served
  }
  const ids = (snapshot.paxGroupIds ?? []).filter((id) => known.has(id))
  return ids.length > 0 ? new Set(ids) : null
}

function joinPositions(positions: readonly number[]): string {
  if (positions.length <= 1) return positions.join("")
  // A run of three or more reads as a range, as the Build Booking "For" control words it.
  const consecutive = positions.every((position, index) => index === 0 || position === positions[index - 1] + 1)
  if (positions.length >= 3 && consecutive) return `${positions[0]}–${positions[positions.length - 1]}`
  return `${positions.slice(0, -1).join(", ")} & ${positions[positions.length - 1]}`
}

/**
 * What a pax group is called on client documents, from the primary product's own vocabulary:
 * "Suite" on a train, "Room" on a hotel, "Cabin" on a cruise. "Suite" when the kind is unknown.
 */
export function paxGroupNoun(kind: SupplierKind | null | undefined): string {
  // A kind string the vocabulary doesn't know (an older row) reads as the default.
  const vocabulary = kind ? (getSupplierVocabulary(kind) as ReturnType<typeof getSupplierVocabulary> | undefined) : undefined
  const noun = vocabulary?.unitNoun.trim() ?? ""
  return noun ?`${noun.charAt(0).toUpperCase()}${noun.slice(1)}` : "Suite"
}

/**
 * The itinerary tag for a leg or transport request that serves only some pax groups: "(Suite 2
 * only)", "(Suites 2 & 3 only)", "(Suites 1, 2 & 4 only)". `scopeId` is matched against each line's
 * legId and transportRequestId. `noun` names a group the way the primary product does ("Room 2
 * only" on a hotel-led booking; see paxGroupNoun). Null when the booking has no groups, no line
 * matches, or the lines matched serve every group between them.
 */
export function paxGroupScopeTag(
  lines: readonly { pricing_snapshot: unknown }[],
  scopeId: string | null | undefined,
  noun = "Suite",
): string | null {
  if (!scopeId) return null
  const groups = readPaxGroups(lines)
  if (!groups) return null
  const known = new Set(groups.map((group) => group.id))

  const served = new Set<string>()
  let matched = false
  for (const line of lines) {
    const snapshot = snapshotOf(line)
    if (!snapshot || snapshot.commission) continue
    if (snapshot.legId !== scopeId && snapshot.transportRequestId !== scopeId) continue
    matched = true
    const ids = servedGroupIds(snapshot, known)
    if (ids === null) return null
    for (const id of ids) served.add(id)
  }
  if (!matched || served.size === 0 || served.size >= known.size) return null

  const positions = groups.filter((group) => served.has(group.id)).map((group) => group.position)
  const name = noun.trim() || "Suite"
  return positions.length === 1
    ? `(${name} ${positions[0]} only)`
    : `(${name}s ${joinPositions(positions)} only)`
}
