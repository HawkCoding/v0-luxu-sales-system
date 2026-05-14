import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

export type JobNumberPrefix = "BT" | "RR" | "REV"

export interface JobNumberResolution {
  prefix: JobNumberPrefix
  needsReview: boolean
  reason: string
  sources: Record<string, string | null>
}

export interface JobNumberAllocation {
  bookingNumber: string
  resolution: JobNumberResolution
}

interface BookingProductInput {
  supplierId?: string | null
  supplierName?: string | null
  routeId?: string | null
  routeName?: string | null
  packageId?: string | null
  packageName?: string | null
  rawText?: string | null
  parsedSupplier?: string | null
  direction?: string | null
}

type SupabaseServerClient = SupabaseClient<Database>

const TRAIN_PRODUCT_REVIEW_WARNING = "Train product needs review"

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function addSource(
  sources: Record<string, string | null>,
  key: string,
  value: string | null | undefined,
) {
  sources[key] = typeof value === "string" && value.trim() ? value.trim() : null
}

export function getTrainProductReviewWarning(): string {
  return TRAIN_PRODUCT_REVIEW_WARNING
}

export function resolveJobNumberPrefixFromSources(
  sources: Record<string, string | null | undefined>,
): JobNumberResolution {
  const normalizedSources: Record<string, string | null> = {}
  let blueTrainMatched = false
  let rovosRailMatched = false

  for (const [key, value] of Object.entries(sources)) {
    addSource(normalizedSources, key, value)
    if (!value) continue

    const normalized = normalizeText(value)
    if (/\bblue\s+train\b/.test(normalized)) blueTrainMatched = true
    if (/\brovos(?:\s+rail)?\b/.test(normalized)) rovosRailMatched = true
  }

  if (blueTrainMatched && !rovosRailMatched) {
    return {
      prefix: "BT",
      needsReview: false,
      reason: "matched_blue_train",
      sources: normalizedSources,
    }
  }

  if (rovosRailMatched && !blueTrainMatched) {
    return {
      prefix: "RR",
      needsReview: false,
      reason: "matched_rovos_rail",
      sources: normalizedSources,
    }
  }

  return {
    prefix: "REV",
    needsReview: true,
    reason: blueTrainMatched && rovosRailMatched ? "ambiguous_train_product" : "unknown_train_product",
    sources: normalizedSources,
  }
}

async function loadProductSources(
  supabase: SupabaseServerClient,
  input: BookingProductInput,
): Promise<Record<string, string | null>> {
  const sources: Record<string, string | null> = {}
  const supplierIds = new Set<string>()

  addSource(sources, "supplierName", input.supplierName ?? input.parsedSupplier)
  addSource(sources, "routeName", input.routeName ?? input.direction)
  addSource(sources, "packageName", input.packageName)
  addSource(sources, "rawText", input.rawText)

  if (input.supplierId) supplierIds.add(input.supplierId)

  if (input.routeId) {
    const { data: route } = await supabase
      .from("routes")
      .select("id, name, supplier_id")
      .eq("id", input.routeId)
      .maybeSingle()

    if (route?.supplier_id) supplierIds.add(route.supplier_id)
    addSource(sources, "routeRecordName", route?.name)
  }

  if (input.packageId) {
    const { data: packageLegs } = await supabase
      .from("package_legs")
      .select("supplier_id")
      .eq("package_id", input.packageId)

    for (const leg of packageLegs ?? []) {
      if (leg.supplier_id) supplierIds.add(leg.supplier_id)
    }
  }

  if (supplierIds.size > 0) {
    const { data: suppliers } = await supabase
      .from("suppliers")
      .select("id, name, kind")
      .in("id", Array.from(supplierIds))

    for (const supplier of suppliers ?? []) {
      if (supplier.kind !== "train_operator") continue
      addSource(sources, `supplier:${supplier.id}`, supplier.name)
    }
  }

  return sources
}

export async function resolveJobNumberProduct(
  supabase: SupabaseServerClient,
  input: BookingProductInput,
): Promise<JobNumberResolution> {
  return resolveJobNumberPrefixFromSources(await loadProductSources(supabase, input))
}

function getNumberYear(createdAt: Date = new Date()): number {
  return Number.isFinite(createdAt.getTime()) ? createdAt.getUTCFullYear() : new Date().getUTCFullYear()
}

export async function allocateJobNumber(
  supabase: SupabaseServerClient,
  prefix: JobNumberPrefix,
  createdAt: Date = new Date(),
): Promise<string> {
  const { data, error } = await supabase.rpc("allocate_job_number", {
    p_number_year: getNumberYear(createdAt),
    p_product_prefix: prefix,
  })

  if (error || !data) {
    throw new Error(error?.message || "Failed to allocate job number")
  }

  return data
}

export async function allocateJobNumberForBooking(
  supabase: SupabaseServerClient,
  input: BookingProductInput,
  createdAt: Date = new Date(),
): Promise<JobNumberAllocation> {
  const resolution = await resolveJobNumberProduct(supabase, input)
  return {
    bookingNumber: await allocateJobNumber(supabase, resolution.prefix, createdAt),
    resolution,
  }
}

export function addJobNumberingMetadata(
  extractedJson: Record<string, unknown>,
  resolution: JobNumberResolution,
): Record<string, unknown> {
  return {
    ...extractedJson,
    numbering: {
      productPrefix: resolution.prefix,
      needsReview: resolution.needsReview,
      reason: resolution.reason,
      sources: resolution.sources,
    },
  }
}
