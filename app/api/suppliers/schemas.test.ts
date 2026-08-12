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

  it("defaults stationAddresses to an empty list and accepts one row per city", () => {
    expect(supplierSaveSchema.parse(buildValidPayload()).stationAddresses).toEqual([])

    const parsed = supplierSaveSchema.parse({
      ...buildValidPayload(),
      stationAddresses: [
        { locationId: UUID_3, stationName: "Rovos Rail Station", streetAddress: "Capital Park" },
        { locationId: UUID_4, stationName: "Cape Town Station", streetAddress: null },
      ],
    })
    expect(parsed.stationAddresses).toHaveLength(2)
  })

  it("rejects two station addresses for the same city", () => {
    const result = supplierSaveSchema.safeParse({
      ...buildValidPayload(),
      stationAddresses: [
        { locationId: UUID_3, stationName: "Rovos Rail Station" },
        { locationId: UUID_3, stationName: "Another Station" },
      ],
    })
    expect(result.success).toBe(false)
    expect(result.success === false && result.error.issues[0].path).toEqual([
      "stationAddresses",
      1,
      "locationId",
    ])
  })

  it("accepts HH:MM default times and null unset", () => {
    expect(
      supplierSaveSchema.safeParse({
        ...buildValidPayload(),
        kind: "hotel_property",
        defaultTimeStart: "14:00",
        defaultTimeEnd: "11:00",
      }).success,
    ).toBe(true)
    expect(
      supplierSaveSchema.safeParse({
        ...buildValidPayload(),
        defaultTimeStart: null,
        defaultTimeEnd: null,
      }).success,
    ).toBe(true)
  })

  it.each(["14:00:00", "2pm", "9:00", ""])(
    "rejects malformed default time %#",
    (value) => {
      expect(
        supplierSaveSchema.safeParse({ ...buildValidPayload(), defaultTimeStart: value }).success,
      ).toBe(false)
    },
  )

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

describe("route durationDays", () => {
  function trainRouteWithDuration(durationDays: unknown) {
    return {
      ...buildValidPayload(),
      kind: "train_operator" as const,
      routes: [
        {
          id: UUID_3,
          name: "Pretoria ↔ Cape Town",
          originLocationId: UUID_3,
          destinationLocationId: UUID_4,
          directionMode: "one_way",
          durationDays,
          active: true,
          rateCards: [],
        },
      ],
    }
  }

  it("accepts a positive integer duration", () => {
    const result = supplierSaveSchema.safeParse(trainRouteWithDuration(2))
    expect(result.success).toBe(true)
  })

  it("accepts a null duration", () => {
    expect(supplierSaveSchema.safeParse(trainRouteWithDuration(null)).success).toBe(true)
  })

  it("rejects zero and negative durations", () => {
    expect(supplierSaveSchema.safeParse(trainRouteWithDuration(0)).success).toBe(false)
    expect(supplierSaveSchema.safeParse(trainRouteWithDuration(-1)).success).toBe(false)
  })

  it("rejects fractional durations", () => {
    expect(supplierSaveSchema.safeParse(trainRouteWithDuration(1.5)).success).toBe(false)
  })
})

describe("route departure/arrival times", () => {
  function trainRouteWithTimes(times: Record<string, unknown>) {
    return {
      ...buildValidPayload(),
      kind: "train_operator" as const,
      routes: [
        {
          id: UUID_3,
          name: "Pretoria ↔ Cape Town",
          originLocationId: UUID_3,
          destinationLocationId: UUID_4,
          directionMode: "round_trip",
          durationDays: 2,
          active: true,
          rateCards: [],
          ...times,
        },
      ],
    }
  }

  it("accepts an HH:MM pair on both legs", () => {
    const result = supplierSaveSchema.safeParse(
      trainRouteWithTimes({
        departureTime: "08:30",
        arrivalTime: "17:45",
        returnDepartureTime: "10:15",
        returnArrivalTime: "19:00",
      }),
    )
    expect(result.success).toBe(true)
  })

  it("treats omitted times as unset", () => {
    expect(supplierSaveSchema.safeParse(trainRouteWithTimes({})).success).toBe(true)
  })

  it("normalises a cleared time input to null", () => {
    const result = supplierSaveSchema.safeParse(
      trainRouteWithTimes({ departureTime: "", arrivalTime: null }),
    )
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.routes[0].departureTime).toBeNull()
    expect(result.data.routes[0].arrivalTime).toBeNull()
  })

  it.each(["8:30", "0830", "08:30:00", "25:00"])("rejects %s", (value) => {
    expect(supplierSaveSchema.safeParse(trainRouteWithTimes({ departureTime: value })).success).toBe(
      false,
    )
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

describe("rate adjustments, the supplier base rate, and the quoted rate", () => {
  const RAC = "00000000-0000-4000-8000-0000000000a1"
  const STO = "00000000-0000-4000-8000-0000000000a2"
  const NETT = "00000000-0000-4000-8000-0000000000a3"

  it("accepts a null base rate (inherit the system default) and an omitted one", () => {
    expect(
      supplierSaveSchema.safeParse({ ...buildValidPayload(), baseRateTypeId: null }).success,
    ).toBe(true)
    expect(supplierSaveSchema.safeParse(buildValidPayload()).success).toBe(true)
  })

  it("accepts adjustments for rates other than the base rate", () => {
    const parsed = supplierSaveSchema.safeParse({
      ...buildValidPayload(),
      baseRateTypeId: RAC,
      rateAdjustments: [{ rateTypeId: STO, discountPct: 20 }],
    })
    expect(parsed.success).toBe(true)
  })

  it("rejects an adjustment that references the supplier's own base rate", () => {
    // The base rate is the implicit 0% baseline and is never stored as an adjustment.
    const parsed = supplierSaveSchema.safeParse({
      ...buildValidPayload(),
      baseRateTypeId: RAC,
      rateAdjustments: [{ rateTypeId: RAC, discountPct: 0 }],
    })
    expect(parsed.success).toBe(false)
    expect(parsed.success ? [] : parsed.error.issues.map((issue) => issue.message)).toContain(
      "The base rate is the 0% baseline and cannot also be a rate adjustment",
    )
  })

  describe("the quoted rate", () => {
    it("accepts the base rate itself", () => {
      expect(
        supplierSaveSchema.safeParse({
          ...buildValidPayload(),
          baseRateTypeId: RAC,
          quoteRateTypeId: RAC,
          rateAdjustments: [{ rateTypeId: STO, discountPct: 20 }],
        }).success,
      ).toBe(true)
    })

    it("accepts one of this supplier's applicable rates", () => {
      expect(
        supplierSaveSchema.safeParse({
          ...buildValidPayload(),
          baseRateTypeId: RAC,
          quoteRateTypeId: STO,
          rateAdjustments: [{ rateTypeId: STO, discountPct: 20 }],
        }).success,
      ).toBe(true)
    })

    it("accepts null (quote at the base rate)", () => {
      expect(
        supplierSaveSchema.safeParse({
          ...buildValidPayload(),
          baseRateTypeId: RAC,
          quoteRateTypeId: null,
        }).success,
      ).toBe(true)
    })

    it("rejects a rate this supplier does not price at", () => {
      // Starring a rate with no baseline and no markdown would nominate an undefined price.
      const parsed = supplierSaveSchema.safeParse({
        ...buildValidPayload(),
        baseRateTypeId: RAC,
        quoteRateTypeId: NETT,
        rateAdjustments: [{ rateTypeId: STO, discountPct: 20 }],
      })
      expect(parsed.success).toBe(false)
      expect(parsed.success ? [] : parsed.error.issues.map((issue) => issue.message)).toContain(
        "The quoted rate must be the base rate or one of this supplier's applicable rates",
      )
    })
  })

  it("rejects a duplicated rate type across adjustments", () => {
    const parsed = supplierSaveSchema.safeParse({
      ...buildValidPayload(),
      rateAdjustments: [
        { rateTypeId: STO, discountPct: 20 },
        { rateTypeId: STO, discountPct: 30 },
      ],
    })
    expect(parsed.success).toBe(false)
  })

  it("rejects a discount outside 0-100", () => {
    for (const discountPct of [-1, 101]) {
      expect(
        supplierSaveSchema.safeParse({
          ...buildValidPayload(),
          rateAdjustments: [{ rateTypeId: STO, discountPct }],
        }).success,
      ).toBe(false)
    }
  })

  it("applies the same rules to the draft schema", () => {
    expect(
      supplierDraftSaveSchema.safeParse({
        kind: "train_operator",
        name: "Draft",
        baseRateTypeId: RAC,
        rateAdjustments: [{ rateTypeId: RAC, discountPct: 0 }],
      }).success,
    ).toBe(false)
    expect(
      supplierDraftSaveSchema.safeParse({
        kind: "train_operator",
        name: "Draft",
        baseRateTypeId: RAC,
        rateAdjustments: [{ rateTypeId: STO, discountPct: 50 }],
      }).success,
    ).toBe(true)
  })
})
