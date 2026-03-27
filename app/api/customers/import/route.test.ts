import { describe, expect, it } from "vitest"

import { importRowSchema, payloadSchema } from "./schemas"

describe("customer import schemas", () => {
  it("accepts a valid supplier lead row", () => {
    const parsed = importRowSchema.parse({
      source_row_id: "row-1",
      title: "Mr",
      first_name: "John",
      last_name: "Smith",
      email: "  JOHN.SMITH@EXAMPLE.COM  ",
      phone: "  +27 82 555 1234  ",
      country: "  South Africa  ",
    })

    expect(parsed).toEqual({
      source_row_id: "row-1",
      title: "Mr",
      first_name: "John",
      last_name: "Smith",
      email: "john.smith@example.com",
      phone: "+27 82 555 1234",
      country: "South Africa",
    })
  })

  it("rejects rows with missing names or invalid email addresses", () => {
    expect(
      importRowSchema.safeParse({
        first_name: "",
        last_name: "Smith",
        email: "john@example.com",
      }).success,
    ).toBe(false)

    expect(
      importRowSchema.safeParse({
        first_name: "John",
        last_name: "",
        email: "john@example.com",
      }).success,
    ).toBe(false)

    expect(
      importRowSchema.safeParse({
        first_name: "John",
        last_name: "Smith",
        email: "not-an-email",
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
      })),
    }

    expect(payloadSchema.safeParse(largePayload).success).toBe(false)
  })

  it("accepts a valid payload with optional supplier and route ids", () => {
    const parsed = payloadSchema.parse({
      rows: [
        {
          first_name: "Jane",
          last_name: "Doe",
          email: "jane@example.com",
        },
      ],
      supplierId: "00000000-0000-0000-0000-000000000111",
      routeId: "00000000-0000-0000-0000-000000000222",
    })

    expect(parsed.rows).toHaveLength(1)
    expect(parsed.supplierId).toBe("00000000-0000-0000-0000-000000000111")
    expect(parsed.routeId).toBe("00000000-0000-0000-0000-000000000222")
  })

  it("accepts null supplier and route ids", () => {
    const parsed = payloadSchema.parse({
      rows: [{ first_name: "Jane", last_name: "Doe", email: "jane@example.com" }],
      supplierId: null,
      routeId: null,
    })

    expect(parsed.supplierId).toBeNull()
    expect(parsed.routeId).toBeNull()
  })

  it("accepts optional source row id for idempotent retries", () => {
    const parsed = importRowSchema.parse({
      source_row_id: "import-row-42",
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@example.com",
    })

    expect(parsed.source_row_id).toBe("import-row-42")
  })
})
