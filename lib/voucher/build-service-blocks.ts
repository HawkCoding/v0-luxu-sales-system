import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  VoucherServiceBlock,
  VoucherServiceBlockContact,
  VoucherServiceBlockData,
  VoucherServiceType,
} from "@/lib/generate-voucher"
import { voucherServiceTypeLabel } from "@/lib/generate-voucher"
import type { Database } from "@/lib/supabase/types"
import type { SupplierKind } from "@/lib/types"

export function mapSupplierKindToServiceType(kind: SupplierKind | string | null): VoucherServiceType {
  switch (kind) {
    case "train_operator":
      return "train"
    case "hotel_property":
      return "hotel"
    case "transfers":
    case "vehicle_rental":
      return "transfer"
    case "tour_operator":
      return "tour"
    case "airline":
      return "airline"
    default:
      return "additional_service"
  }
}

interface BuildContext {
  bookingId: string
  supplierReferenceFallback?: string | null
  additionalServicesDetails?: string | null
}

interface SelectionJoinRow {
  id: string
  package_leg_id: string
  selected: boolean
  supplier_id: string | null
  route_id: string | null
  suite_type_id: string | null
  service_date: string | null
  notes: string | null
  package_legs: { sort_order: number; label: string | null } | { sort_order: number; label: string | null }[] | null
  suppliers: {
    name: string | null
    phone: string | null
    email: string | null
    website: string | null
    location: string | null
    kind: SupplierKind | string | null
  } | Array<{
    name: string | null
    phone: string | null
    email: string | null
    website: string | null
    location: string | null
    kind: SupplierKind | string | null
  }> | null
  routes: { name: string | null } | { name: string | null }[] | null
  suite_types: { name: string | null } | { name: string | null }[] | null
}

function firstRecord<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export interface BuildVoucherServiceBlocksResult {
  blocks: VoucherServiceBlock[]
}

export async function buildVoucherServiceBlocks(
  supabase: SupabaseClient<Database>,
  context: BuildContext,
): Promise<BuildVoucherServiceBlocksResult> {
  const { data: rows, error } = await supabase
    .from("booking_package_selections")
    .select(
      `id, package_leg_id, selected, supplier_id, route_id, suite_type_id, service_date, notes,
       package_legs(sort_order, label),
       suppliers(name, phone, email, website, location, kind),
       routes(name),
       suite_types(name)`,
    )
    .eq("booking_id", context.bookingId)

  if (error) throw error

  const selections = (rows ?? []) as unknown as SelectionJoinRow[]

  const blocks: VoucherServiceBlock[] = selections
    .filter((row) => row.selected)
    .map((row, idx) => {
      const supplier = firstRecord(row.suppliers)
      const route = firstRecord(row.routes)
      const suite = firstRecord(row.suite_types)
      const leg = firstRecord(row.package_legs)

      const serviceType = mapSupplierKindToServiceType(supplier?.kind ?? null)
      const contactDetails: VoucherServiceBlockContact = {
        name: supplier?.name ?? null,
        phone: supplier?.phone ?? null,
        email: supplier?.email ?? null,
        website: supplier?.website ?? null,
        location: supplier?.location ?? null,
      }

      const serviceData: VoucherServiceBlockData = {
        route: route?.name ?? null,
        suiteType: suite?.name ?? null,
        departureDate: row.service_date ?? null,
        notes: row.notes ?? null,
      }

      return {
        serviceType,
        title: leg?.label?.trim() || voucherServiceTypeLabel(serviceType),
        supplierReference: context.supplierReferenceFallback ?? null,
        contactDetails,
        serviceData,
        displayOrder: leg?.sort_order ?? idx,
      }
    })

  if (context.additionalServicesDetails && context.additionalServicesDetails.trim()) {
    blocks.push({
      serviceType: "additional_service",
      title: "Additional Services",
      supplierReference: context.supplierReferenceFallback ?? null,
      contactDetails: {},
      serviceData: { notes: context.additionalServicesDetails.trim() },
      displayOrder: blocks.length,
    })
  }

  return { blocks }
}
