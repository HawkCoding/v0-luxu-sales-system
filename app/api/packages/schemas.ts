import { z } from "zod"

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")

export const packageRouteSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Route name is required"),
  originLocationId: z.string().uuid().nullable().optional(),
  destinationLocationId: z.string().uuid().nullable().optional(),
  pickupPoint: z.string().trim().max(500).nullable().optional(),
  dropoffPoint: z.string().trim().max(500).nullable().optional(),
  vehicleRentalDetails: z.object({
    includedKmPerDay: z.number().finite().nonnegative().nullable().optional(),
    extraKmPrice: z.number().finite().nonnegative().nullable().optional(),
    securityDeposit: z.number().finite().nonnegative().nullable().optional(),
    oneWayFee: z.number().finite().nonnegative().nullable().optional(),
  }).nullable().optional(),
  active: z.boolean().default(true),
  existing: z.boolean().default(false),
})

export const packageRateCardSchema = z.object({
  id: z.string().uuid().optional(),
  routeId: z.string().uuid(),
  suiteTypeId: z.string().uuid(),
  pricePerPerson: z.number().finite().nonnegative(),
  childPrice: z.number().finite().nonnegative().nullable().optional(),
  infantPrice: z.number().finite().nonnegative().nullable().optional(),
  currency: z.string().trim().min(1).max(10),
  validFrom: dateSchema,
  validTo: z.union([dateSchema, z.literal(""), z.null()]),
  existing: z.boolean().default(false),
})

export const packageLegSchema = z.object({
  id: z.string().uuid().optional(),
  supplierId: z.string().uuid(),
  label: z.string().trim().max(200).nullable().optional(),
  sortOrder: z.number().int().nonnegative().default(0),
  routes: z.array(packageRouteSchema).default([]),
  rateCards: z.array(packageRateCardSchema).default([]),
})

export const createPackageSchema = z.object({
  name: z.string().trim().min(1, "Package name is required").max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  durationNights: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().trim().min(1).max(10).default("ZAR"),
  singleSupplementPct: z.number().finite().min(0).max(1000).default(50),
  markupPct: z.number().finite().min(0).max(1000).default(0),
  fixedPricePerPerson: z.number().positive().nullable().optional(),
  active: z.boolean().default(true),
  legs: z.array(packageLegSchema).default([]),
})

export const upsertPackageSchema = createPackageSchema.extend({
  expectedUpdatedAt: z.string().optional(),
})

export type CreatePackageInput = z.infer<typeof createPackageSchema>
export type UpsertPackageInput = z.infer<typeof upsertPackageSchema>
