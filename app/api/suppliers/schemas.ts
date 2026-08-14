import { z } from "zod"
import { SUPPLIER_VOCABULARY, SUPPORTED_CURRENCY_VALUES } from "@/lib/types"

/**
 * Rate-card currencies were free text (any string up to 10 chars) until the value started
 * driving conversion arithmetic. Uppercased first so a lowercase "usd" from an older client is
 * accepted rather than 400'd on a formatting difference.
 */
const currencySchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.enum(SUPPORTED_CURRENCY_VALUES))

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^[+\d\s()-]*$/
const WEBSITE_PATTERN = /^\S+\.\S+$/
const TIME_PATTERN = /^\d{2}:\d{2}$/

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")

/** Stricter than TIME_PATTERN: a real wall-clock time, so an out-of-range hour is a 400 here rather
 * than a raw Postgres error at insert. */
const CLOCK_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/** A route's departure/arrival time. A cleared `<input type="time">` posts "", which means "unset"
 * here rather than a validation error — the route simply has no schedule captured yet. */
const routeTimeSchema = z
  .union([z.string().regex(CLOCK_TIME_PATTERN, "Expected HH:MM"), z.literal("")])
  .nullable()
  .transform((value) => (value ? value : null))

export const suiteTypeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Suite type name is required"),
  passengerCapacity: z.number().int().nonnegative().nullable().optional(),
  luggageCapacity: z.number().int().nonnegative().nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  active: z.boolean(),
  sortOrder: z.number().int().nonnegative().default(0),
  bedroomTypeIds: z.array(z.string().uuid()).default([]),
  bedroomLayoutIds: z.array(z.string().uuid()).default([]),
  bathroomTypeIds: z.array(z.string().uuid()).default([]),
})

const variantValueSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Name is required").max(200),
  sortOrder: z.number().int().nonnegative().default(0),
  archivedAt: z.string().nullable().optional(),
})

// Intentionally drops min(1) from variantValueSchema.name — drafts may have an empty name
const draftVariantValueSchema = variantValueSchema.extend({
  name: z.string().trim().max(200).default(""),
})

export const rateCardSchema = z.object({
  id: z.string().uuid().optional(),
  routeId: z.string().uuid(),
  suiteTypeId: z.string().uuid(),
  rateTypeId: z.string().uuid(),
  pricePerPerson: z.number().finite().nonnegative(),
  childPrice: z.number().finite().nonnegative().nullable(),
  infantPrice: z.number().finite().nonnegative().nullable(),
  // An allowlist, not free text: this value now drives conversion arithmetic, so an unrecognised
  // code has to be rejected at the boundary rather than silently priced as-is.
  currency: currencySchema,
  validFrom: dateSchema,
  validTo: z.union([dateSchema, z.literal(""), z.null()]),
})

/**
 * A tour operator prices the tour type, not the itinerary, so its cards arrive at the top level of
 * the payload with no route of their own and are stored with `route_id = NULL`. Every other kind
 * keeps posting cards nested under the route they price.
 */
export const supplierRateCardSchema = rateCardSchema.omit({ routeId: true })

const supplierKindSchema = z.enum([
  "train_operator",
  "hotel_property",
  "transfers",
  "vehicle_rental",
  "tour_operator",
  "airline",
])

/** 'manual' suppliers (airlines, by default) skip rate cards entirely -- their price is typed
 *  per unit at quote-build time instead. */
const supplierPricingModeSchema = z.enum(["rate_card", "manual"])

const vehicleRentalRouteDetailsSchema = z.object({
  includedKmPerDay: z.number().finite().nonnegative().nullable().optional(),
  extraKmPrice: z.number().finite().nonnegative().nullable().optional(),
  securityDeposit: z.number().finite().nonnegative().nullable().optional(),
  oneWayFee: z.number().finite().nonnegative().nullable().optional(),
})

const routeDirectionModeSchema = z.enum(["one_way", "round_trip"])

/** Client-facing inclusion/exclusion bullets; blanks are dropped so the UI can post empty rows. */
const bulletListSchema = z
  .array(z.string().trim().max(300))
  .max(30)
  .transform((values) => values.filter(Boolean))
  .default([])

export const rateAdjustmentSchema = z.object({
  rateTypeId: z.string().uuid(),
  discountPct: z.number().finite().min(0).max(100),
})

/** The supplier's base rate; null means "fall back to the system default rate type". */
export const baseRateTypeIdSchema = z.string().uuid().nullable().optional()

/** The rate this supplier's quotes use; null means "quote at the base rate". */
export const quoteRateTypeIdSchema = z.string().uuid().nullable().optional()

/**
 * The base rate is the implicit 0% baseline, so it is never stored as an adjustment.
 *
 * The quoted rate must be one this supplier actually prices at -- its base rate, or a rate it
 * carries a markdown for. Starring anything else would nominate a rate with no defined price,
 * which is the mistake this whole split exists to prevent.
 */
function checkRateAdjustments(
  value: {
    rateAdjustments: { rateTypeId: string }[]
    baseRateTypeId?: string | null
    quoteRateTypeId?: string | null
  },
  ctx: z.RefinementCtx,
) {
  const rateTypeIds = value.rateAdjustments.map((a) => a.rateTypeId)
  if (new Set(rateTypeIds).size !== rateTypeIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rateAdjustments"],
      message: "Each rate type may only appear once in rate adjustments",
    })
  }

  if (value.baseRateTypeId && rateTypeIds.includes(value.baseRateTypeId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rateAdjustments"],
      message: "The base rate is the 0% baseline and cannot also be a rate adjustment",
    })
  }

  if (
    value.quoteRateTypeId &&
    value.quoteRateTypeId !== value.baseRateTypeId &&
    !rateTypeIds.includes(value.quoteRateTypeId)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["quoteRateTypeId"],
      message: "The quoted rate must be the base rate or one of this supplier's applicable rates",
    })
  }
}

/**
 * A train supplier's boarding/alighting address in one city. Keyed by city because a route resolves
 * its boarding point from its own origin location -- see lib/voucher/build-service-blocks.ts.
 */
export const stationAddressSchema = z.object({
  id: z.string().uuid().optional(),
  locationId: z.string().uuid(),
  stationName: z.string().trim().max(255).nullable().optional(),
  streetAddress: z.string().trim().max(255).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
})

export const draftStationAddressSchema = z.object({
  id: z.string().uuid().optional(),
  locationId: z.union([z.string().uuid(), z.literal("")]).default(""),
  stationName: z.string().trim().max(255).nullable().default(null),
  streetAddress: z.string().trim().max(255).nullable().default(null),
  notes: z.string().trim().max(1000).nullable().default(null),
})

/** One station per city per supplier -- the DB enforces this with a unique index, so catch it here
 * and return a field-level 400 instead of letting the upsert surface a raw Postgres conflict. */
function checkStationAddresses(
  value: { stationAddresses: { locationId: string }[] },
  ctx: z.RefinementCtx,
) {
  const seen = new Set<string>()
  for (const [index, station] of value.stationAddresses.entries()) {
    if (!station.locationId) continue
    if (seen.has(station.locationId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stationAddresses", index, "locationId"],
        message: "Each city may only have one station address",
      })
    }
    seen.add(station.locationId)
  }
}

/**
 * A route needs a name, but for kinds whose name is derived from origin -> destination the save
 * handler already knows how to build one, and `POST /api/suppliers/quick` has always derived it.
 * Rejecting an empty name at the schema meant that fallback could never run and the two create
 * paths disagreed. Allow the blank only where it can actually be filled in -- the kind derives its
 * names and both endpoints are present.
 */
function checkRouteNames(
  value: {
    kind: string
    routes: {
      name: string
      originLocationId?: string | null
      destinationLocationId?: string | null
      suiteTypeId?: string | null
    }[]
  },
  ctx: z.RefinementCtx,
) {
  const vocabulary = SUPPLIER_VOCABULARY[value.kind as keyof typeof SUPPLIER_VOCABULARY]
  const canDeriveName = vocabulary?.routeNameAutoDerived ?? false

  for (const [index, route] of value.routes.entries()) {
    if (route.name.trim().length > 0) continue
    if (!canDeriveName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["routes", index, "name"],
        message: "Route name is required",
      })
      continue
    }
    // Derivation source differs per kind: trains derive from origin/destination locations,
    // tour operators derive from the tour type they're linked to.
    if (value.kind === "tour_operator") {
      if (route.suiteTypeId) continue
    } else if (route.originLocationId && route.destinationLocationId) {
      continue
    }
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["routes", index, "name"],
      message: "Route name is required",
    })
  }
}

/**
 * Tour operators split the two concepts this endpoint used to conflate: the tour type carries the
 * price (top-level `rateCards`, no route id) and the itinerary carries the description (a route
 * that must name its tour type). Enforced here so neither half can be posted the old way.
 */
function checkTourOperatorItineraries(
  value: {
    kind: string
    suiteTypes: { id?: string }[]
    routes: { suiteTypeId?: string | null; rateCards: unknown[] }[]
    rateCards: unknown[]
  },
  ctx: z.RefinementCtx,
) {
  if (value.kind !== "tour_operator") {
    if (value.rateCards.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rateCards"],
        message: "Only tour operators price without an itinerary",
      })
    }
    return
  }

  const suiteTypeIds = new Set(
    value.suiteTypes.flatMap((suiteType) => (suiteType.id ? [suiteType.id] : [])),
  )
  // One itinerary per tour type: the itinerary's name is now derived straight from the tour
  // type's name, so a second itinerary on the same type would collide on the DB unique-name
  // constraint. Caught here with a readable message instead of a raw 500 at insert.
  const seenSuiteTypeIds = new Set<string>()

  for (const [index, route] of value.routes.entries()) {
    if (!route.suiteTypeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["routes", index, "suiteTypeId"],
        message: "Each itinerary must belong to a tour type",
      })
    } else if (suiteTypeIds.size > 0 && !suiteTypeIds.has(route.suiteTypeId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["routes", index, "suiteTypeId"],
        message: "The tour type must be one of this supplier's tour types",
      })
    } else if (seenSuiteTypeIds.has(route.suiteTypeId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["routes", index, "suiteTypeId"],
        message: "Each tour type can only have one itinerary",
      })
    } else {
      seenSuiteTypeIds.add(route.suiteTypeId)
    }

    if (route.rateCards.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["routes", index, "rateCards"],
        message: "Tour operator rates belong to the tour type, not the itinerary",
      })
    }
  }
}

export const routeSchema = z.object({
  id: z.string().uuid().optional(),
  /** Emptiness is judged per kind in `checkRouteNames` -- kinds whose route name is derived from
   *  origin/destination may send "" and let the handler fill it in, the way the quick-create
   *  endpoint already does. Every other kind still has to name its route. */
  name: z.string().trim(),
  /** Tour operators only: the tour type this itinerary describes. Required for that kind, see
   * `checkTourOperatorItineraries`. */
  suiteTypeId: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  originLocationId: z.string().uuid().nullable().optional(),
  destinationLocationId: z.string().uuid().nullable().optional(),
  pickupPoint: z.string().trim().max(500).nullable().optional(),
  dropoffPoint: z.string().trim().max(500).nullable().optional(),
  vehicleRentalDetails: vehicleRentalRouteDetailsSchema.nullable().optional(),
  directionMode: routeDirectionModeSchema.default("one_way"),
  durationDays: z.number().int().min(1).nullable().optional(),
  departureTime: routeTimeSchema.optional(),
  arrivalTime: routeTimeSchema.optional(),
  returnDepartureTime: routeTimeSchema.optional(),
  returnArrivalTime: routeTimeSchema.optional(),
  active: z.boolean(),
  rateCards: z.array(rateCardSchema).default([]),
})

export const supplierEmailSchema = z.object({
  id: z.string().uuid().optional(),
  email: z
    .string()
    .trim()
    .max(255)
    .refine((value) => EMAIL_PATTERN.test(value), {
      message: "Enter a valid email (e.g. name@example.com)",
    }),
  label: z.string().trim().min(1, "Label is required").max(100),
  /** Position in the supplier's email list; the first entry is the primary contact. Optional so a
   *  caller that doesn't care about order falls back to array position. */
  sortOrder: z.number().int().nonnegative().optional(),
})

export const draftSupplierEmailSchema = z.object({
  id: z.string().uuid().optional(),
  email: z
    .string()
    .trim()
    .max(255)
    .refine((value) => value === "" || EMAIL_PATTERN.test(value), {
      message: "Enter a valid email (e.g. name@example.com)",
    })
    .default(""),
  label: z.string().trim().max(100).default("General"),
  sortOrder: z.number().int().nonnegative().optional(),
})

export const supplierSaveSchema = z.object({
  name: z.string().trim().min(2, "Supplier name must be at least 2 characters").max(200),
  kind: supplierKindSchema,
  pricingMode: supplierPricingModeSchema.default("rate_card"),
  email: z
    .string()
    .trim()
    .max(255)
    .refine((value) => value === "" || EMAIL_PATTERN.test(value), {
      message: "Enter a valid email (e.g. name@example.com)",
    }),
  phone: z
    .string()
    .trim()
    .max(100)
    .refine((value) => value === "" || PHONE_PATTERN.test(value), {
      message: "Phone can include digits, spaces, +, -, and parentheses only",
    })
    .refine((value) => value === "" || value.length >= 7, {
      message: "Phone must be at least 7 characters",
    }),
  website: z
    .string()
    .trim()
    .max(255)
    .refine((value) => value === "" || WEBSITE_PATTERN.test(value), {
      message: "Enter a valid website (e.g. example.com)",
    }),
  location: z
    .string()
    .trim()
    .max(255)
    .refine((value) => value === "" || value.length >= 2, {
      message: "Location must be at least 2 characters",
    }),
  locationDetail: z.string().trim().max(255).nullable().optional(),
  /** The supplier's own street address. Trains use per-city `stationAddresses` instead — a train
   * boards guests at a different station in every city it serves. */
  streetAddress: z.string().trim().max(255).nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  notes: z.string().trim().max(5000),
  singleSupplementPct: z.number().finite().min(0).max(1000).default(0),
  infantMaxAge: z.number().int().min(0).max(17).nullable().optional(),
  childMaxAge: z.number().int().min(0).max(17).nullable().optional(),
  defaultTimeStart: z.string().regex(TIME_PATTERN, "Expected HH:MM").nullable().optional(),
  defaultTimeEnd: z.string().regex(TIME_PATTERN, "Expected HH:MM").nullable().optional(),
  inclusions: bulletListSchema,
  exclusions: bulletListSchema,
  active: z.boolean(),
  /** The sibling record (same company, different category) this supplier inherits its contact
   * details from. `null` unlinks and keeps the last mirrored values as this record's own. Omit the
   * key entirely to leave the current link untouched. */
  parentSupplierId: z.string().uuid().nullable().optional(),
  emails: z.array(supplierEmailSchema).default([]),
  suiteTypes: z.array(suiteTypeSchema),
  routes: z.array(routeSchema).default([]),
  /** Tour operators only -- rates that price a tour type across every itinerary. */
  rateCards: z.array(supplierRateCardSchema).default([]),
  stationAddresses: z.array(stationAddressSchema).default([]),
  bedroomTypes: z.array(variantValueSchema).default([]),
  bedroomLayouts: z.array(variantValueSchema).default([]),
  bathroomTypes: z.array(variantValueSchema).default([]),
  rateAdjustments: z.array(rateAdjustmentSchema).default([]),
  baseRateTypeId: baseRateTypeIdSchema,
  quoteRateTypeId: quoteRateTypeIdSchema,
  expectedUpdatedAt: z.string().optional(),
}).superRefine((value, ctx) => {
  checkRateAdjustments(value, ctx)
  checkStationAddresses(value, ctx)
  checkTourOperatorItineraries(value, ctx)
  checkRouteNames(value, ctx)

  for (const [index, route] of value.routes.entries()) {
    if (value.kind === "transfers" || value.kind === "vehicle_rental") {
      if (!route.pickupPoint?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["routes", index, "pickupPoint"],
          message: "Pickup point is required",
        })
      }
      if (!route.dropoffPoint?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["routes", index, "dropoffPoint"],
          message: "Drop-off point is required",
        })
      }
      if (value.kind === "vehicle_rental" && route.vehicleRentalDetails === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["routes", index, "vehicleRentalDetails"],
          message: "Vehicle rental details are required",
        })
      }
      if (value.kind === "transfers" && route.vehicleRentalDetails) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["routes", index, "vehicleRentalDetails"],
          message: "Transfer routes cannot include vehicle rental details",
        })
      }
      continue
    }

    if (
      (value.kind === "train_operator" || value.kind === "airline") &&
      (!route.originLocationId || !route.destinationLocationId)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["routes", index],
        message: "Origin and destination are required for this supplier category",
      })
    }
  }
})

export type SupplierSaveInput = z.infer<typeof supplierSaveSchema>

export const draftSuiteTypeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().max(200).default(""),
  passengerCapacity: z.number().int().nonnegative().nullable().default(null),
  luggageCapacity: z.number().int().nonnegative().nullable().default(null),
  description: z.string().trim().max(1000).nullable().default(null),
  active: z.boolean().default(true),
  sortOrder: z.number().int().nonnegative().default(0),
  bedroomTypeIds: z.array(z.string().uuid()).default([]),
  bedroomLayoutIds: z.array(z.string().uuid()).default([]),
  bathroomTypeIds: z.array(z.string().uuid()).default([]),
})

export const draftRateCardSchema = z.object({
  id: z.string().uuid().optional(),
  routeId: z.union([z.string().uuid(), z.literal("")]).default(""),
  suiteTypeId: z.union([z.string().uuid(), z.literal("")]).default(""),
  rateTypeId: z.union([z.string().uuid(), z.literal("")]).optional().default(""),
  pricePerPerson: z.number().finite().nonnegative().default(0),
  childPrice: z.number().finite().nonnegative().nullable().default(null),
  infantPrice: z.number().finite().nonnegative().nullable().default(null),
  // A draft save happens mid-edit, so an empty currency is normal here — it falls back to the
  // base currency rather than blocking the save. A full save still requires a real code.
  currency: z.union([currencySchema, z.literal("")]).default("ZAR").catch("ZAR"),
  validFrom: z.union([dateSchema, z.literal("")]).default(""),
  validTo: z.union([dateSchema, z.literal(""), z.null()]).default(""),
})

export const draftRouteSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().max(200).default(""),
  // Drafts may still be missing their tour type -- the required check lives on the full save.
  suiteTypeId: z.union([z.string().uuid(), z.literal(""), z.null()]).default(null),
  description: z.string().trim().max(2000).nullable().default(null),
  originLocationId: z.union([z.string().uuid(), z.literal(""), z.null()]).default(""),
  destinationLocationId: z.union([z.string().uuid(), z.literal(""), z.null()]).default(""),
  pickupPoint: z.string().trim().max(500).nullable().default(null),
  dropoffPoint: z.string().trim().max(500).nullable().default(null),
  vehicleRentalDetails: vehicleRentalRouteDetailsSchema.nullable().default(null),
  directionMode: routeDirectionModeSchema.default("one_way"),
  durationDays: z.number().int().min(1).nullable().default(null),
  departureTime: routeTimeSchema.default(null),
  arrivalTime: routeTimeSchema.default(null),
  returnDepartureTime: routeTimeSchema.default(null),
  returnArrivalTime: routeTimeSchema.default(null),
  active: z.boolean().default(true),
  rateCards: z.array(draftRateCardSchema).default([]),
})

export const supplierDraftSaveSchema = z.object({
  name: z.string().trim().max(200).default(""),
  kind: supplierKindSchema,
  pricingMode: supplierPricingModeSchema.default("rate_card"),
  email: z
    .string()
    .trim()
    .max(255)
    .refine((value) => value === "" || EMAIL_PATTERN.test(value), {
      message: "Enter a valid email (e.g. name@example.com)",
    })
    .default(""),
  phone: z
    .string()
    .trim()
    .max(100)
    .refine((value) => value === "" || PHONE_PATTERN.test(value), {
      message: "Phone can include digits, spaces, +, -, and parentheses only",
    })
    .default(""),
  website: z
    .string()
    .trim()
    .max(255)
    .refine((value) => value === "" || WEBSITE_PATTERN.test(value), {
      message: "Enter a valid website (e.g. example.com)",
    })
    .default(""),
  location: z.string().trim().max(255).default(""),
  locationDetail: z.string().trim().max(255).nullable().default(null),
  streetAddress: z.string().trim().max(255).nullable().default(null),
  locationId: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(2000).nullable().default(null),
  notes: z.string().trim().max(5000).default(""),
  singleSupplementPct: z.number().finite().min(0).max(1000).default(0),
  infantMaxAge: z.number().int().min(0).max(17).nullable().optional(),
  childMaxAge: z.number().int().min(0).max(17).nullable().optional(),
  defaultTimeStart: z.string().regex(TIME_PATTERN, "Expected HH:MM").nullable().optional(),
  defaultTimeEnd: z.string().regex(TIME_PATTERN, "Expected HH:MM").nullable().optional(),
  inclusions: bulletListSchema,
  exclusions: bulletListSchema,
  active: z.boolean().default(true),
  /** See `parentSupplierId` on supplierSaveSchema. */
  parentSupplierId: z.string().uuid().nullable().optional(),
  emails: z.array(draftSupplierEmailSchema).default([]),
  suiteTypes: z.array(draftSuiteTypeSchema).default([]),
  routes: z.array(draftRouteSchema).default([]),
  rateCards: z.array(draftRateCardSchema.omit({ routeId: true })).default([]),
  stationAddresses: z.array(draftStationAddressSchema).default([]),
  bedroomTypes: z.array(draftVariantValueSchema).default([]),
  bedroomLayouts: z.array(draftVariantValueSchema).default([]),
  bathroomTypes: z.array(draftVariantValueSchema).default([]),
  rateAdjustments: z.array(rateAdjustmentSchema).default([]),
  baseRateTypeId: baseRateTypeIdSchema,
  quoteRateTypeId: quoteRateTypeIdSchema,
  expectedUpdatedAt: z.string().optional(),
}).superRefine((value, ctx) => {
  checkRateAdjustments(value, ctx)
  checkStationAddresses(value, ctx)
})

export type SupplierDraftSaveInput = z.infer<typeof supplierDraftSaveSchema>
