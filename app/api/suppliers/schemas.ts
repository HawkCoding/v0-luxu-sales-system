import { z } from "zod"

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")

export const pricingOptionSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Pricing option name is required"),
  singlePrice: z.number().finite().nonnegative(),
  doublePrice: z.number().finite().nonnegative(),
  familyPrice: z.number().finite().nonnegative(),
  currency: z.string().trim().min(1).max(10),
  isPrimary: z.boolean(),
})

export const seasonalPriceSchema = z.object({
  id: z.string().uuid().optional(),
  optionId: z.string().uuid(),
  singlePrice: z.number().finite().nonnegative(),
  doublePrice: z.number().finite().nonnegative(),
  familyPrice: z.number().finite().nonnegative(),
})

export const seasonalPeriodSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().max(255).nullable(),
  validFrom: dateSchema,
  validTo: dateSchema,
  prices: z.array(seasonalPriceSchema),
})

export const routeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Route name is required"),
  originLocationId: z.string().uuid(),
  destinationLocationId: z.string().uuid(),
  active: z.boolean(),
})

export const suiteTypeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Suite type name is required"),
  active: z.boolean(),
})

export const rateCardSchema = z.object({
  id: z.string().uuid().optional(),
  routeId: z.string().uuid().nullable(),
  suiteTypeId: z.string().uuid(),
  pricePerPerson: z.number().finite().nonnegative(),
  currency: z.string().trim().min(1).max(10),
  validFrom: dateSchema,
  validTo: z.union([dateSchema, z.literal(""), z.null()]),
})

export const packageSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Package name is required"),
  description: z.string().trim().max(5000).nullable(),
  durationNights: z.number().int().nonnegative().nullable(),
  singleSupplementPct: z.number().finite().min(0).max(1000),
  currency: z.string().trim().min(1).max(10),
  active: z.boolean(),
  routes: z.array(routeSchema),
  suiteTypes: z.array(suiteTypeSchema),
  rateCards: z.array(rateCardSchema),
})

export const supplierSaveSchema = z.object({
  name: z.string().trim().min(1, "Supplier name is required"),
  kind: z.enum(["train_operator", "hotel_property", "transfers"]),
  email: z.string().trim().email().or(z.literal("")),
  phone: z.string().trim().max(100),
  website: z.string().trim().max(255),
  location: z.string().trim().max(255),
  notes: z.string().trim().max(5000),
  active: z.boolean(),
  pricingOptions: z.array(pricingOptionSchema).superRefine((options, ctx) => {
    const primaryCount = options.filter((option) => option.isPrimary).length
    if (primaryCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only one pricing option can be marked as primary.",
      })
    }

    const seenNames = new Set<string>()
    for (const option of options) {
      const normalizedName = option.name.trim().toLowerCase()
      if (!normalizedName) continue
      if (seenNames.has(normalizedName)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Pricing option names must be unique per supplier.",
        })
        break
      }
      seenNames.add(normalizedName)
    }
  }),
  packages: z.array(packageSchema),
  seasonalPeriods: z.array(seasonalPeriodSchema),
})

export type SupplierSaveInput = z.infer<typeof supplierSaveSchema>
