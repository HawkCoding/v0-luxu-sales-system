import { z } from "zod"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^[+\d\s()-]*$/
const WEBSITE_PATTERN = /^\S+\.\S+$/

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")

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

const draftVariantValueSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().max(200).default(""),
  sortOrder: z.number().int().nonnegative().default(0),
  archivedAt: z.string().nullable().optional(),
})

export const rateCardSchema = z.object({
  id: z.string().uuid().optional(),
  routeId: z.string().uuid(),
  suiteTypeId: z.string().uuid(),
  rateTypeId: z.string().uuid().optional(),
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

const vehicleRentalRouteDetailsSchema = z.object({
  includedKmPerDay: z.number().finite().nonnegative().nullable().optional(),
  extraKmPrice: z.number().finite().nonnegative().nullable().optional(),
  securityDeposit: z.number().finite().nonnegative().nullable().optional(),
  oneWayFee: z.number().finite().nonnegative().nullable().optional(),
})

const routeDirectionModeSchema = z.enum(["one_way", "round_trip", "loop"])

const commissionKindSchema = z.enum(["percent", "per_person"])

export const routeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Route name is required"),
  originLocationId: z.string().uuid().nullable().optional(),
  destinationLocationId: z.string().uuid().nullable().optional(),
  pickupPoint: z.string().trim().max(500).nullable().optional(),
  dropoffPoint: z.string().trim().max(500).nullable().optional(),
  vehicleRentalDetails: vehicleRentalRouteDetailsSchema.nullable().optional(),
  directionMode: routeDirectionModeSchema.default("one_way"),
  commissionType: commissionKindSchema.nullable().optional(),
  commissionValue: z.number().finite().nonnegative().nullable().optional(),
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
  locationId: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  notes: z.string().trim().max(5000),
  singleSupplementPct: z.number().finite().min(0).max(1000).default(0),
  infantMaxAge: z.number().int().min(0).max(17).nullable().optional(),
  childMaxAge: z.number().int().min(0).max(17).nullable().optional(),
  defaultCommissionType: commissionKindSchema.nullable().optional(),
  defaultCommissionValue: z.number().finite().nonnegative().nullable().optional(),
  active: z.boolean(),
  emails: z.array(supplierEmailSchema).default([]),
  suiteTypes: z.array(suiteTypeSchema),
  routes: z.array(routeSchema).default([]),
  bedroomTypes: z.array(variantValueSchema).default([]),
  bedroomLayouts: z.array(variantValueSchema).default([]),
  bathroomTypes: z.array(variantValueSchema).default([]),
  expectedUpdatedAt: z.string().optional(),
}).superRefine((value, ctx) => {
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
  commissionType: commissionKindSchema.nullable().optional(),
  commissionValue: z.number().finite().nonnegative().nullable().optional(),
  active: z.boolean().default(true),
  rateCards: z.array(draftRateCardSchema).default([]),
})

export const supplierDraftSaveSchema = z.object({
  name: z.string().trim().max(200).default(""),
  kind: supplierKindSchema,
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
  locationId: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(2000).nullable().default(null),
  notes: z.string().trim().max(5000).default(""),
  singleSupplementPct: z.number().finite().min(0).max(1000).default(0),
  infantMaxAge: z.number().int().min(0).max(17).nullable().optional(),
  childMaxAge: z.number().int().min(0).max(17).nullable().optional(),
  defaultCommissionType: commissionKindSchema.nullable().optional(),
  defaultCommissionValue: z.number().finite().nonnegative().nullable().optional(),
  active: z.boolean().default(true),
  emails: z.array(draftSupplierEmailSchema).default([]),
  suiteTypes: z.array(draftSuiteTypeSchema).default([]),
  routes: z.array(draftRouteSchema).default([]),
  bedroomTypes: z.array(draftVariantValueSchema).default([]),
  bedroomLayouts: z.array(draftVariantValueSchema).default([]),
  bathroomTypes: z.array(draftVariantValueSchema).default([]),
  expectedUpdatedAt: z.string().optional(),
})

export type SupplierDraftSaveInput = z.infer<typeof supplierDraftSaveSchema>
