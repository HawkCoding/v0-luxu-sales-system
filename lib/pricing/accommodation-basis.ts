import type { SupplierKind } from "@/lib/types"
import { hotelRateCardFares, type FareRateCard } from "@/lib/pricing/passenger-fares"

/**
 * How a hotel stay prices: separate adult/child/infant fares per night ("per_person", the
 * long-standing default) or one flat nightly rate for the whole room whoever sleeps in it
 * ("per_room", opt-in per supplier). Mirrors the Postgres enum
 * public.accommodation_pricing_basis (supabase/migrations/20260904090000_hotel_room_pricing.sql).
 * Pure and sync so both the server pricer and the client-side leg editor resolve it identically.
 *
 * Deliberately a sibling of lib/pricing/transfer-basis.ts rather than a generalisation of it: the
 * two bases have different enums, different defaults and different rules about which supplier kind
 * may opt in, so a shared resolver would take a SupplierKind and immediately branch on it again.
 */
export type AccommodationPricingBasis = "per_person" | "per_room"

/**
 * Resolves the pricing basis for one booking_services row.
 *
 * - Any non-hotel kind is always per_person -- per-room pricing is scoped to hotels, and unlike
 *   transfers this cannot be a CHECK constraint because booking_services holds every supplier
 *   kind and the kind lives on `suppliers` (see the migration's trigger comment).
 * - An explicit row-level basis (set by the consultant, or already persisted on a saved stay)
 *   always wins -- this is what lets a stay keep the basis it was quoted under even after its
 *   supplier's default is later flipped.
 * - `supplierBasis` is the fallback for a brand-new row that hasn't been saved yet, the same
 *   value the DB's BEFORE INSERT trigger (stamp_booking_service_pricing_basis) would stamp.
 * - With neither, per_person -- note this default runs the opposite way to transfers, where the
 *   legacy basis was the flat one. Hotels have always priced per head, so per_person is the
 *   reading that leaves an existing stay's total unchanged.
 */
export function resolveAccommodationPricingBasis(input: {
  supplierKind: SupplierKind | null | undefined
  rowBasis: AccommodationPricingBasis | null | undefined
  supplierBasis: AccommodationPricingBasis | null | undefined
}): AccommodationPricingBasis {
  if (input.supplierKind !== "hotel_property") return "per_person"
  return input.rowBasis ?? input.supplierBasis ?? "per_person"
}

/**
 * Vocabulary label for a hotel's price basis -- the text a consultant reads beside a quote line's
 * quantity, and the reason SUPPLIER_VOCABULARY.hotel_property.priceLabel alone is not enough (it
 * is a static Record indexed by kind, and says "per room per night" for every hotel regardless of
 * how the line was actually priced). See lib/types.ts resolveSupplierPriceLabel.
 */
export function accommodationPriceLabel(basis: AccommodationPricingBasis): string {
  return basis === "per_room" ? "per room per night" : "per person per night"
}

/** Who sleeps in one room -- the three counts a per-person hotel card is read against. */
export interface RoomOccupancy {
  adultCount: number
  childCount: number
  infantCount: number
}

/**
 * What a rate card charges one room for one night. Under per_room the card's price already is the
 * room's nightly rate; under per_person it is a fare per guest, so the room costs the card read
 * against who is actually in it (hotelRateCardFares: an unset child or infant fare means free).
 *
 * A typed room price override replaces exactly this figure, so the leg editor (what the override
 * "replaces") and the pricer (the manualRoomPriceBase stamped on the quote line) both read it from
 * here -- they used to disagree, the editor quoting the room's sum and the line the bare adult fare.
 */
export function cardNightlyRoomRate(
  card: FareRateCard,
  basis: AccommodationPricingBasis,
  occupancy: RoomOccupancy,
): number {
  if (basis === "per_room") return card.pricePerPerson
  const sum = hotelRateCardFares(card).reduce(
    (total, fare) => total + Math.max(0, occupancy[fare.key]) * fare.unitPrice,
    0,
  )
  return Math.round(sum * 100) / 100
}

/**
 * How a per-person card adds up to the room's nightly rate, e.g. "2 adults × R4 130,00" or
 * "2 adults × R4 130,00 + 1 child free". Shown beside the room's nightly figure so a consultant
 * whose rate sheet quotes the room (not the guest) can see at once that the card is being read per
 * person -- otherwise R8 260 "per night for this room" reads as an unexplained doubling. Null when
 * nobody is in the room yet.
 */
export function describeCardRoomRateBreakdown(
  card: FareRateCard,
  occupancy: RoomOccupancy,
  formatAmount: (amount: number) => string,
): string | null {
  const nouns: Record<keyof RoomOccupancy, [string, string]> = {
    adultCount: ["adult", "adults"],
    childCount: ["child", "children"],
    infantCount: ["infant", "infants"],
  }
  const parts = hotelRateCardFares(card)
    .filter((fare) => occupancy[fare.key] > 0)
    .map((fare) => {
      const count = occupancy[fare.key]
      const [one, many] = nouns[fare.key]
      const who = `${count} ${count === 1 ? one : many}`
      return fare.unitPrice > 0 ? `${who} × ${formatAmount(fare.unitPrice)}` : `${who} free`
    })
  return parts.length > 0 ? parts.join(" + ") : null
}
