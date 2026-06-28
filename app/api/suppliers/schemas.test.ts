import { describe, expect, it } from "vitest"
import {
  draftSupplierEmailSchema,
  supplierDraftSaveSchema,
  supplierEmailSchema,
  supplierSaveSchema,
} from "./schemas"

const UUID_2 = "00000000-0000-4000-8000-000000000002"
const UUID_3 = "00000000-0000-4000-8000-000000000003"
const UUID_4 = "00000000-0000-4000-8000-000000000004"

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
    expectedUpdatedAt: "2026-03-28T10:00:00.000Z",
  }
}

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

  it("accepts transport services with free-form pickup and drop-off points", () => {
    const parsed = supplierSaveSchema.parse({
      ...buildValidPayload(),
      kind: "transfers",
      suiteTypes: [
        {
          id: UUID_2,
          name: "Premium SUV",
          passengerCapacity: 4,
          luggageCapacity: 4,
          description: "Luxury airport transfer vehicle",
          active: true,
        },
      ],
      routes: [
        {
          id: UUID_3,
          name: "OR Tambo to Hotel",
          transportServiceType: "transfer",
          pickupPoint: "OR Tambo International Airport",
          dropoffPoint: "Sandton hotel",
          active: true,
          rateCards: [
            {
              routeId: UUID_3,
              suiteTypeId: UUID_2,
              rateTypeId: UUID_4,
              pricePerPerson: 950,
              childPrice: 300,
              infantPrice: 100,
              currency: "ZAR",
              validFrom: "2026-01-01",
              validTo: null,
            },
          ],
        },
      ],
    })

    expect(parsed.routes[0].originLocationId).toBeUndefined()
    expect(parsed.routes[0].pickupPoint).toBe("OR Tambo International Airport")
  })

  it("requires global locations for train and airline routes", () => {
    expect(
      supplierSaveSchema.safeParse({
        ...buildValidPayload(),
        kind: "train_operator",
        routes: [
          {
            id: UUID_3,
            name: "Cape Town to Pretoria",
            active: true,
            rateCards: [],
          },
        ],
      }).success,
    ).toBe(false)

    expect(
      supplierSaveSchema.safeParse({
        ...buildValidPayload(),
        kind: "airline",
        routes: [
          {
            id: UUID_3,
            name: "Cape Town to Johannesburg",
            originLocationId: UUID_3,
            destinationLocationId: UUID_4,
            active: true,
            rateCards: [],
          },
        ],
      }).success,
    ).toBe(true)
  })
})

describe("route directionMode", () => {
  function trainRoutePayload(directionMode: string) {
    return {
      ...buildValidPayload(),
      kind: "train_operator" as const,
      routes: [
        {
          id: UUID_3,
          name: "Pretoria ↔ Cape Town",
          originLocationId: UUID_3,
          destinationLocationId: UUID_4,
          directionMode,
          active: true,
          rateCards: [],
        },
      ],
    }
  }

  it.each(["one_way", "round_trip"])("accepts %s", (directionMode) => {
    expect(supplierSaveSchema.safeParse(trainRoutePayload(directionMode)).success).toBe(true)
  })

  it("rejects the removed loop direction", () => {
    expect(supplierSaveSchema.safeParse(trainRoutePayload("loop")).success).toBe(false)
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
