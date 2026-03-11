import { z } from "zod"

const nullableString = z.string().trim().max(255).nullable().optional()

export const importRowSchema = z.object({
  title: z.string().trim().max(50).nullable().optional(),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(255),
  phone: z.string().trim().max(40).nullable().optional(),
  country: z.string().trim().max(100).nullable().optional(),
  booking_reference: z.string().trim().min(1).max(100),
  departure_date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
  route: z.string().trim().min(1).max(255),
  consultant: z.string().trim().min(1).max(50),
  source: z.enum([
    "web_form",
    "paste_import",
    "advertisement",
    "walk_in",
    "referral",
    "social_media",
    "phone_call",
    "email",
    "travel_agent",
  ]),
  adults: z.number().int().min(0).max(20),
  children: z.number().int().min(0).max(20),
  suites: z.number().int().min(1).max(20),
  cabin_type: z.string().trim().min(1).max(150),
  import_notes: nullableString,
})

export const payloadSchema = z.object({
  rows: z.array(importRowSchema).min(1).max(1000),
  mode: z.literal("csv").optional(),
})
