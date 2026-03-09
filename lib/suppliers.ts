import type { Database } from "@/lib/supabase/types"
import type { Supplier, SupplierDetail, SupplierPricingOption } from "@/lib/types"

type SupplierRow = Database["public"]["Tables"]["suppliers"]["Row"]
type SupplierPricingOptionRow = Database["public"]["Tables"]["supplier_pricing_options"]["Row"]

export function mapSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    email: row.email,
    phone: row.phone,
    website: row.website,
    location: row.location,
    notes: row.notes,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapSupplierPricingOption(
  row: SupplierPricingOptionRow,
): SupplierPricingOption {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    name: row.name,
    singlePrice: row.single_price,
    doublePrice: row.double_price,
    familyPrice: row.family_price,
    currency: row.currency,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapSupplierDetail(
  supplier: SupplierRow,
  pricingOptions: SupplierPricingOptionRow[],
): SupplierDetail {
  return {
    ...mapSupplier(supplier),
    pricingOptions: pricingOptions.map(mapSupplierPricingOption),
  }
}
