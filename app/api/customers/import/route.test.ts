import { describe, expect, it } from "vitest"

import { importRowSchema, payloadSchema } from "./schemas"

describe("customer import schemas", () => {
  it("accepts a valid customer and historical booking row", () => {
    const parsed = importRowSchema.parse({
      title: "Mr",
      first_name: "John",
      last_name: "Smith",
      email: "  JOHN.SMITH@EXAMPLE.COM  ",
      phone: "  +27 82 555 1234  ",
      country: "  South Africa  ",
      booking_reference: "  HIST-001  ",
      departure_date: "2025-11-14",
      route: "  Pretoria to Cape Town  ",
      consultant: "  lb  ",
      source: "paste_import",
      adults: 2,
      children: 1,
      suites: 1,
      cabin_type: "  De Luxe Suite  ",
    })

    expect(parsed).toEqual({
      title: "Mr",
      first_name: "John",
      last_name: "Smith",
      email: "john.smith@example.com",
      phone: "+27 82 555 1234",
      country: "South Africa",
      booking_reference: "HIST-001",
      departure_date: "2025-11-14",
      route: "Pretoria to Cape Town",
      consultant: "lb",
      source: "paste_import",
      adults: 2,
      children: 1,
      suites: 1,
      cabin_type: "De Luxe Suite",
    })
  })

  it("rejects rows with missing names, invalid email addresses, or incomplete booking fields", () => {
    expect(
      importRowSchema.safeParse({
        first_name: "",
        last_name: "Smith",
        email: "john@example.com",
        booking_reference: "HIST-001",
        departure_date: "2025-11-14",
        route: "Pretoria to Cape Town",
        consultant: "LB",
        source: "paste_import",
        adults: 2,
        children: 0,
        suites: 1,
        cabin_type: "De Luxe Suite",
      }).success,
    ).toBe(false)

    expect(
      importRowSchema.safeParse({
        first_name: "John",
        last_name: "",
        email: "john@example.com",
        booking_reference: "HIST-001",
        departure_date: "2025-11-14",
        route: "Pretoria to Cape Town",
        consultant: "LB",
        source: "paste_import",
        adults: 2,
        children: 0,
        suites: 1,
        cabin_type: "De Luxe Suite",
      }).success,
    ).toBe(false)

    expect(
      importRowSchema.safeParse({
        first_name: "John",
        last_name: "Smith",
        email: "not-an-email",
        booking_reference: "HIST-001",
        departure_date: "2025-11-14",
        route: "Pretoria to Cape Town",
        consultant: "LB",
        source: "paste_import",
        adults: 2,
        children: 0,
        suites: 1,
        cabin_type: "De Luxe Suite",
      }).success,
    ).toBe(false)

    expect(
      importRowSchema.safeParse({
        first_name: "John",
        last_name: "Smith",
        email: "john@example.com",
        booking_reference: "",
        departure_date: "14/11/2025",
        route: "",
        consultant: "",
        source: "email",
        adults: -1,
        children: 0,
        suites: 0,
        cabin_type: "",
      }).success,
    ).toBe(false)
  })

  it("allows nullable and optional secondary fields", () => {
    const parsed = importRowSchema.parse({
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@example.com",
      title: null,
      phone: null,
      country: null,
      booking_reference: "HIST-002",
      departure_date: "2024-07-02",
      route: "Cape Town to Pretoria",
      consultant: "CDJ",
      source: "web_form",
      adults: 2,
      children: 0,
      suites: 2,
      cabin_type: "Royal Suite",
    })

    expect(parsed.title).toBeNull()
    expect(parsed.phone).toBeNull()
    expect(parsed.country).toBeNull()
  })

  it("requires at least one import row in the payload", () => {
    expect(payloadSchema.safeParse({ rows: [] }).success).toBe(false)
  })

  it("rejects payloads larger than 1000 rows", () => {
    const largePayload = {
      rows: Array.from({ length: 1001 }, (_, index) => ({
        first_name: `Name${index}`,
        last_name: "Smith",
        email: `person${index}@example.com`,
        booking_reference: `HIST-${index}`,
        departure_date: "2025-11-14",
        route: "Pretoria to Cape Town",
        consultant: "LB",
        source: "paste_import",
        adults: 2,
        children: 0,
        suites: 1,
        cabin_type: "De Luxe Suite",
      })),
    }

    expect(payloadSchema.safeParse(largePayload).success).toBe(false)
  })

  it("accepts a valid payload with csv mode", () => {
    const parsed = payloadSchema.parse({
      rows: [
        {
          first_name: "Jane",
          last_name: "Doe",
          email: "jane@example.com",
          booking_reference: "HIST-001",
          departure_date: "2025-11-14",
          route: "Pretoria to Cape Town",
          consultant: "LB",
          source: "paste_import",
          adults: 2,
          children: 0,
          suites: 1,
          cabin_type: "De Luxe Suite",
        },
      ],
      mode: "csv",
    })

    expect(parsed.rows).toHaveLength(1)
    expect(parsed.mode).toBe("csv")
  })
})
