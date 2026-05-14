import type { PackageDetail, QuoteLineItem } from "@/lib/types"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import {
  buildPackagePricing,
  calculateQuoteTotals,
  type PackageLegSelection,
  type PricingTransportRequest,
} from "@/lib/quotes/pricing-engine"

interface TransportRequestRow {
  service_type: "transfer" | "rental"
  route_id: string | null
  suite_type_id: string | null
  pickup_point: string
  dropoff_point: string
  pickup_at: string | null
  rental_details?: { return_at: string | null } | { return_at: string | null }[] | null
}

interface BuildPackageQuoteLineItemsInput {
  supabase: SupabaseClient<Database>
  packageDetail: PackageDetail
  jobId: string
  travelDate: string
  selections?: PackageLegSelection[]
}

interface BuildPackageQuoteLineItemsResult {
  lineItems: QuoteLineItem[]
}

function mapTransportRequest(row: TransportRequestRow): PricingTransportRequest {
  const rentalDetails = Array.isArray(row.rental_details)
    ? row.rental_details.map((details) => ({ returnAt: details.return_at }))
    : row.rental_details
      ? { returnAt: row.rental_details.return_at }
      : null

  return {
    serviceType: row.service_type,
    routeId: row.route_id,
    suiteTypeId: row.suite_type_id,
    pickupPoint: row.pickup_point,
    dropoffPoint: row.dropoff_point,
    pickupAt: row.pickup_at,
    rentalDetails,
  }
}

export async function buildPackageQuoteLineItems({
  supabase,
  packageDetail,
  jobId,
  travelDate,
  selections = [],
}: BuildPackageQuoteLineItemsInput): Promise<BuildPackageQuoteLineItemsResult> {
  const { data: job, error: jobError } = await supabase
    .from("bookings")
    .select("id, no_of_adults, no_of_children, no_of_suites, child_ages, departure_date")
    .eq("id", jobId)
    .single()

  if (jobError || !job) {
    throw new Error("Job not found")
  }

  const { data: transportRequests } = await supabase
    .from("booking_transport_requests")
    .select("service_type, route_id, suite_type_id, pickup_point, dropoff_point, pickup_at, rental_details:booking_vehicle_rental_details(return_at)")
    .eq("booking_id", jobId)
    .order("sort_order", { ascending: true })

  return {
    lineItems: buildPackagePricing({
      packageDetail,
      booking: {
        noOfAdults: job.no_of_adults,
        noOfChildren: job.no_of_children,
        noOfSuites: job.no_of_suites,
        childAges: job.child_ages ?? [],
      },
      travelDate,
      selections,
      transportRequests: ((transportRequests ?? []) as TransportRequestRow[]).map(mapTransportRequest),
    }),
  }
}

export { calculateQuoteTotals, type PackageLegSelection }
