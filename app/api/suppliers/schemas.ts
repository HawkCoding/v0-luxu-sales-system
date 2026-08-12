import { z } from "zod"

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
  currency: z.string().trim().min(1).max(10),
  validFrom: dateSchema,
  validTo: z.union([dateSchema, z.literal(""), z.null()]),
})

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

export const routeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Route name is required"),
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
  emails: z.array(supplierEmailSchema).default([]),
  suiteTypes: z.array(suiteTypeSchema),
  routes: z.array(routeSchema).default([]),
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
  currency: z.string().trim().max(10).default("ZAR"),
  validFrom: z.union([dateSchema, z.literal("")]).default(""),
  validTo: z.union([dateSchema, z.literal(""), z.null()]).default(""),
})

export const draftRouteSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().max(200).default(""),
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
  emails: z.array(draftSupplierEmailSchema).default([]),
  suiteTypes: z.array(draftSuiteTypeSchema).default([]),
  routes: z.array(draftRouteSchema).default([]),
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
