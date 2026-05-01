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
  active: z.boolean(),
})

export const rateCardSchema = z.object({
  id: z.string().uuid().optional(),
  routeId: z.string().uuid(),
  suiteTypeId: z.string().uuid(),
  pricePerPerson: z.number().finite().nonnegative(),
  childPrice: z.number().finite().nonnegative().nullable(),
  infantPrice: z.number().finite().nonnegative().nullable(),
  currency: z.string().trim().min(1).max(10),
  validFrom: dateSchema,
  validTo: z.union([dateSchema, z.literal(""), z.null()]),
})

export const routeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Route name is required"),
  originLocationId: z.string().uuid(),
  destinationLocationId: z.string().uuid(),
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
  kind: z.enum(["train_operator", "hotel_property", "transfers", "tour_operator", "airline"]),
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
  locationId: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(5000),
  singleSupplementPct: z.number().finite().min(0).max(1000).default(0),
  active: z.boolean(),
  emails: z.array(supplierEmailSchema).default([]),
  suiteTypes: z.array(suiteTypeSchema),
  routes: z.array(routeSchema).default([]),
  expectedUpdatedAt: z.string().optional(),
})

export type SupplierSaveInput = z.infer<typeof supplierSaveSchema>

export const draftSuiteTypeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().max(200).default(""),
  active: z.boolean().default(true),
})

export const draftRateCardSchema = z.object({
  id: z.string().uuid().optional(),
  routeId: z.union([z.string().uuid(), z.literal("")]).default(""),
  suiteTypeId: z.union([z.string().uuid(), z.literal("")]).default(""),
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
  originLocationId: z.union([z.string().uuid(), z.literal("")]).default(""),
  destinationLocationId: z.union([z.string().uuid(), z.literal("")]).default(""),
  active: z.boolean().default(true),
  rateCards: z.array(draftRateCardSchema).default([]),
})

export const supplierDraftSaveSchema = z.object({
  name: z.string().trim().max(200).default(""),
  kind: z.enum(["train_operator", "hotel_property", "transfers", "tour_operator", "airline"]),
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
  locationId: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(5000).default(""),
  singleSupplementPct: z.number().finite().min(0).max(1000).default(0),
  active: z.boolean().default(true),
  emails: z.array(draftSupplierEmailSchema).default([]),
  suiteTypes: z.array(draftSuiteTypeSchema).default([]),
  routes: z.array(draftRouteSchema).default([]),
  expectedUpdatedAt: z.string().optional(),
})

export type SupplierDraftSaveInput = z.infer<typeof supplierDraftSaveSchema>
