import { describe, expect, it } from "vitest"
import {
  dateSchema,
  draftRateCardSchema,
  draftSupplierEmailSchema,
  packageSchema,
  rateCardSchema,
  routeSchema,
  supplierDraftSaveSchema,
  supplierEmailSchema,
  supplierSaveSchema,
} from "./schemas"

const UUID_1 = "00000000-0000-4000-8000-000000000001"
const UUID_2 = "00000000-0000-4000-8000-000000000002"
const UUID_3 = "00000000-0000-4000-8000-000000000003"

function buildValidRateCard() {
  return {
    routeId: UUID_1,
    suiteTypeId: UUID_2,
    pricePerPerson: 1200,
    currency: "ZAR",
    validFrom: "2026-01-01",
    validTo: null,
  }
}

function buildValidPayload() {
  return {
    name: "Blue Train",
    kind: "train_operator" as const,
    email: "ops@example.com",
    phone: "+27 (12) 345-6789",
    website: "example.com",
    location: "Cape Town",
    notes: "Preferred supplier",
    active: true,
    emails: [{ email: "sales@example.com", label: "General" }],
    suiteTypes: [{ id: UUID_2, name: "Suite", active: true }],
    packages: [
      {
        id: UUID_3,
        name: "Cape Explorer",
        description: null,
        durationNights: 3,
        singleSupplementPct: 50,
        currency: "ZAR",
        active: true,
        routes: [
          {
            id: UUID_1,
            name: "Cape Town - Pretoria",
            originLocationId: UUID_1,
            destinationLocationId: UUID_2,
            active: true,
          },
        ],
        rateCards: [buildValidRateCard()],
      },
    ],
    expectedUpdatedAt: "2026-03-28T10:00:00.000Z",
  }
}

describe("dateSchema", () => {
  it("accepts valid YYYY-MM-DD", () => {
    expect(dateSchema.safeParse("2026-01-15").success).toBe(true)
  })

  it.each(["01-15-2026", "2026/01/15", "2026-1-5", "not-a-date", ""])(
    "rejects invalid date format: %s",
    (value) => {
      expect(dateSchema.safeParse(value).success).toBe(false)
    },
  )
})

describe("supplierEmailSchema", () => {
  it("accepts valid strict supplier email", () => {
    expect(
      supplierEmailSchema.safeParse({ email: "a@b.com", label: "General" }).success,
    ).toBe(true)
  })

  it.each([
    { email: "", label: "General" },
    { email: "ab.com", label: "General" },
    { email: "a b@c.com", label: "General" },
    { email: "a@b.com", label: "" },
    { email: "a@b.com", label: "x".repeat(101) },
  ])("rejects invalid supplier email payload %#", (value) => {
    expect(supplierEmailSchema.safeParse(value).success).toBe(false)
  })
})

describe("draftSupplierEmailSchema", () => {
  it("accepts empty email and defaults values", () => {
    const parsed = draftSupplierEmailSchema.parse({})
    expect(parsed.email).toBe("")
    expect(parsed.label).toBe("General")
  })

  it("rejects invalid non-empty email", () => {
    expect(
      draftSupplierEmailSchema.safeParse({ email: "bad email", label: "General" }).success,
    ).toBe(false)
  })
})

describe("routeSchema", () => {
  it("accepts strict route payload", () => {
    expect(
      routeSchema.safeParse({
        name: "Route 1",
        originLocationId: UUID_1,
        destinationLocationId: UUID_2,
        active: true,
      }).success,
    ).toBe(true)
  })

  it("rejects empty names and invalid location UUIDs", () => {
    expect(
      routeSchema.safeParse({
        name: "",
        originLocationId: UUID_1,
        destinationLocationId: UUID_2,
        active: true,
      }).success,
    ).toBe(false)
    expect(
      routeSchema.safeParse({
        name: "Route 1",
        originLocationId: "not-uuid",
        destinationLocationId: UUID_2,
        active: true,
      }).success,
    ).toBe(false)
  })
})

describe("rateCardSchema", () => {
  it("accepts nullable routeId and valid ranges", () => {
    expect(rateCardSchema.safeParse(buildValidRateCard()).success).toBe(true)
    expect(
      rateCardSchema.safeParse({ ...buildValidRateCard(), routeId: null, validTo: "" }).success,
    ).toBe(true)
  })

  it("rejects invalid numeric and date values", () => {
    expect(
      rateCardSchema.safeParse({ ...buildValidRateCard(), pricePerPerson: -1 }).success,
    ).toBe(false)
    expect(
      rateCardSchema.safeParse({ ...buildValidRateCard(), pricePerPerson: Number.POSITIVE_INFINITY })
        .success,
    ).toBe(false)
    expect(
      rateCardSchema.safeParse({ ...buildValidRateCard(), validFrom: "2026/01/01" }).success,
    ).toBe(false)
  })
})

describe("packageSchema", () => {
  it("accepts valid package payload", () => {
    const payload = buildValidPayload()
    expect(packageSchema.safeParse(payload.packages[0]).success).toBe(true)
  })

  it("rejects invalid package constraints", () => {
    const payload = buildValidPayload().packages[0]
    expect(packageSchema.safeParse({ ...payload, name: "" }).success).toBe(false)
    expect(packageSchema.safeParse({ ...payload, durationNights: -1 }).success).toBe(false)
    expect(packageSchema.safeParse({ ...payload, singleSupplementPct: 1001 }).success).toBe(
      false,
    )
  })
})

describe("supplierSaveSchema", () => {
  it("accepts all supplier kinds", () => {
    const kinds = [
      "train_operator",
      "hotel_property",
      "transfers",
      "tour_operator",
      "airline",
    ] as const
    for (const kind of kinds) {
      expect(supplierSaveSchema.safeParse({ ...buildValidPayload(), kind }).success).toBe(true)
    }
  })

  it("defaults emails to an empty list", () => {
    const { emails, ...rest } = buildValidPayload()
    const parsed = supplierSaveSchema.parse(rest)
    expect(parsed.emails).toEqual([])
  })

  it("rejects invalid top-level fields", () => {
    expect(
      supplierSaveSchema.safeParse({ ...buildValidPayload(), name: "A" }).success,
    ).toBe(false)
    expect(
      supplierSaveSchema.safeParse({ ...buildValidPayload(), kind: "boat" }).success,
    ).toBe(false)
    expect(
      supplierSaveSchema.safeParse({ ...buildValidPayload(), email: "no-at-sign" }).success,
    ).toBe(false)
    expect(
      supplierSaveSchema.safeParse({ ...buildValidPayload(), phone: "abc" }).success,
    ).toBe(false)
    expect(
      supplierSaveSchema.safeParse({ ...buildValidPayload(), website: "bad website" }).success,
    ).toBe(false)
    expect(
      supplierSaveSchema.safeParse({ ...buildValidPayload(), location: "A" }).success,
    ).toBe(false)
  })
})

describe("supplierDraftSaveSchema", () => {
  it("allows sparse payloads with defaults", () => {
    const parsed = supplierDraftSaveSchema.parse({ kind: "airline" })
    expect(parsed.name).toBe("")
    expect(parsed.email).toBe("")
    expect(parsed.phone).toBe("")
    expect(parsed.website).toBe("")
    expect(parsed.location).toBe("")
    expect(parsed.notes).toBe("")
    expect(parsed.active).toBe(true)
    expect(parsed.emails).toEqual([])
    expect(parsed.suiteTypes).toEqual([])
    expect(parsed.packages).toEqual([])
  })

  it("transforms draft routeId empty string to null", () => {
    const parsed = draftRateCardSchema.parse({
      routeId: "",
      suiteTypeId: "",
      pricePerPerson: 0,
      currency: "ZAR",
      validFrom: "",
      validTo: "",
    })
    expect(parsed.routeId).toBeNull()
  })

  it("does not enforce non-draft minimums for name and location", () => {
    expect(
      supplierDraftSaveSchema.safeParse({
        kind: "transfers",
        name: "",
        location: "A",
      }).success,
    ).toBe(true)
  })
})
