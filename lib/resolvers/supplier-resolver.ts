import { resolveEntity } from "@/lib/matching/resolve-entity"
import type { SupplierKind } from "@/lib/types"
import type { createServiceClient } from "@/lib/supabase/server"

type ServiceClient = ReturnType<typeof createServiceClient>

/**
 * Resolve free-text supplier wording (e.g. a parsed email's "trip.supplier", or an enquiry's
 * hotel/operator field) against a supplier pool of a given kind. Replaces the old
 * bidirectional-substring "first match wins" lookup with the same accept-threshold +
 * ambiguity-margin discipline as the suite resolver: an ambiguous or low-confidence phrase
 * resolves to null rather than silently taking whichever row the query happened to return first.
 * Shared by both the enquiries API and the inbound-email importer so they can't drift apart.
 */
async function resolveSupplierIdByKind(
  supabase: ServiceClient,
  kind: "train_operator" | "hotel_property",
  freeText: unknown,
): Promise<string | null> {
  if (typeof freeText !== "string" || !freeText.trim()) return null

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("kind", kind)
    .eq("active", true)

  return resolveEntity(freeText, suppliers ?? []).value
}

export async function resolveTrainSupplierId(supabase: ServiceClient, supplierName: unknown): Promise<string | null> {
  return resolveSupplierIdByKind(supabase, "train_operator", supplierName)
}

export async function findHotelSupplierId(supabase: ServiceClient, hotelOption: unknown): Promise<string | null> {
  return resolveSupplierIdByKind(supabase, "hotel_property", hotelOption)
}

/** A booking's primary supplier: the train operator, or the hotel on a standalone hotel booking. */
export interface PrimarySupplier {
  id: string
  kind: SupplierKind
  name: string
}

/**
 * Resolve free-text wording against every supplier that may head a booking of its own
 * (suppliers.sells_standalone) -- both train operators and standalone hotels such as Kruger
 * Shalati. Same never-guess rule as above: ambiguous wording resolves to null.
 *
 * Deliberately a wider pool than resolveTrainSupplierId, which stays for the add-on paths where a
 * hotel must never be mistaken for the journey.
 */
export async function resolveStandaloneSupplier(
  supabase: ServiceClient,
  freeText: unknown,
): Promise<PrimarySupplier | null> {
  if (typeof freeText !== "string" || !freeText.trim()) return null

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name, kind")
    .eq("sells_standalone", true)
    .eq("active", true)

  const matchedId = resolveEntity(freeText, suppliers ?? []).value
  if (!matchedId) return null

  const matched = (suppliers ?? []).find((supplier) => supplier.id === matchedId)
  return matched ? { id: matched.id, kind: matched.kind, name: matched.name } : null
}

/**
 * Load a supplier the caller already has an id for -- used when the review modal sends a resolved
 * supplierId and the server still needs its kind to decide how to shape the booking.
 */
export async function loadPrimarySupplier(
  supabase: ServiceClient,
  supplierId: unknown,
): Promise<PrimarySupplier | null> {
  if (typeof supplierId !== "string" || !supplierId.trim()) return null

  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id, name, kind")
    .eq("id", supplierId)
    .maybeSingle()

  return supplier ? { id: supplier.id, kind: supplier.kind, name: supplier.name } : null
}
