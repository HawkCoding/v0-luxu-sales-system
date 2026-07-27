import { resolveEntity } from "@/lib/matching/resolve-entity"
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
