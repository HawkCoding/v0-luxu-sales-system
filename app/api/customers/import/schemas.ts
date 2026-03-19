import { z } from "zod"

const nullableShortString = z.string().trim().max(255).nullable().optional()
const nullableUuid = z.string().uuid().nullable().optional()

export const importRowSchema = z.object({
  title: z.string().trim().max(50).nullable().optional(),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(255),
  phone: z.string().trim().max(40).nullable().optional(),
  country: z.string().trim().max(100).nullable().optional(),
  import_notes: nullableShortString,
})

export const payloadSchema = z.object({
  rows: z.array(importRowSchema).min(1).max(1000),
  supplierId: nullableUuid,
  routeId: nullableUuid,
})
