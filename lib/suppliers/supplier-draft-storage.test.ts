import { describe, expect, it } from "vitest"
import type { SupplierFormState } from "@/components/supplier-detail-view"
import {
  SUPPLIER_DRAFT_SCHEMA_VERSION,
  readSupplierDraft,
  serializeSupplierDraft,
} from "./supplier-draft-storage"

function buildFallback(overrides: Partial<SupplierFormState> = {}): SupplierFormState {
  return {
    name: "Rovos Rail",
    kind: "train_operator",
    pricingMode: "rate_card",
    emails: [{ id: "email-1", email: "res@rovos.test", label: "Reservations" }],
    phone: "",
    website: "",
    location: "",
    locationDetail: "",
    streetAddress: "",
    locationId: null,
    stationAddresses: [],
    description: "Server description",
    notes: "",
    active: true,
    singleSupplementPct: 0,
    infantMaxAge: null,
    childMaxAge: null,
    defaultTimeStart: "",
    defaultTimeEnd: "",
    inclusions: "",
    exclusions: "",
    baseRateTypeId: null,
    quoteRateTypeId: null,
    rateAdjustments: [],
    suiteTypes: [],
    packages: [],
    bedroomTypes: [],
    bedroomLayouts: [],
    bathroomTypes: [],
    ...overrides,
  }
}

function buildDraft(overrides: Partial<SupplierFormState> = {}): SupplierFormState {
  return buildFallback({ name: "Rovos Rail (edited)", ...overrides })
}

describe("SUPPLIER_DRAFT_SCHEMA_VERSION", () => {
  /**
   * Pins the persisted shape. Adding, removing or renaming a `SupplierFormState` field fails this
   * test, which is the point: drafts already in a user's browser were written against the old
   * shape, so the version must be bumped in the same change to make them get dropped rather than
   * restored with a stale or missing value.
   */
  it("is bumped whenever the persisted form shape changes", () => {
    expect(Object.keys(buildFallback()).sort()).toEqual(
      [
        "active",
        "baseRateTypeId",
        "bathroomTypes",
        "bedroomLayouts",
        "bedroomTypes",
        "childMaxAge",
        "defaultTimeEnd",
        "defaultTimeStart",
        "description",
        "emails",
        "exclusions",
        "inclusions",
        "infantMaxAge",
        "kind",
        "location",
        "locationDetail",
        "locationId",
        "name",
        "notes",
        "packages",
        "phone",
        "pricingMode",
        "quoteRateTypeId",
        "rateAdjustments",
        "singleSupplementPct",
        "stationAddresses",
        "streetAddress",
        "suiteTypes",
        "website",
      ].sort(),
    )
    expect(SUPPLIER_DRAFT_SCHEMA_VERSION).toBe(1)
  })
})

describe("readSupplierDraft", () => {
  it("returns null when nothing is stored", () => {
    expect(readSupplierDraft(null, buildFallback())).toBeNull()
    expect(readSupplierDraft("", buildFallback())).toBeNull()
  })

  it("returns null for unparseable payloads", () => {
    expect(readSupplierDraft("{not json", buildFallback())).toBeNull()
    expect(readSupplierDraft("[]", buildFallback())).toBeNull()
  })

  it("drops legacy unversioned drafts", () => {
    // How drafts were stored before the envelope: the bare form state.
    const legacy = JSON.stringify(buildDraft())
    expect(readSupplierDraft(legacy, buildFallback())).toBeNull()
  })

  it("drops drafts written by a different schema version", () => {
    const stored = JSON.stringify({
      version: SUPPLIER_DRAFT_SCHEMA_VERSION + 1,
      savedAt: "2026-08-14T00:00:00.000Z",
      form: buildDraft(),
    })
    expect(readSupplierDraft(stored, buildFallback())).toBeNull()
  })

  it("drops drafts whose core arrays are missing", () => {
    const { suiteTypes: _suiteTypes, ...withoutSuiteTypes } = buildDraft()
    const stored = JSON.stringify({
      version: SUPPLIER_DRAFT_SCHEMA_VERSION,
      savedAt: "2026-08-14T00:00:00.000Z",
      form: withoutSuiteTypes,
    })
    expect(readSupplierDraft(stored, buildFallback())).toBeNull()
  })

  it("round-trips a current draft", () => {
    const draft = buildDraft({ notes: "Call before 10h00" })
    const restored = readSupplierDraft(serializeSupplierDraft(draft), buildFallback())
    expect(restored).toEqual(draft)
  })

  it("fills fields the stored draft never had, instead of leaving them undefined", () => {
    const draft = buildDraft()
    // A draft written before these fields existed.
    const partial = { ...draft } as Partial<SupplierFormState>
    delete partial.rateAdjustments
    delete partial.bedroomTypes
    delete partial.bedroomLayouts
    delete partial.bathroomTypes
    delete partial.stationAddresses
    delete partial.description

    const stored = JSON.stringify({
      version: SUPPLIER_DRAFT_SCHEMA_VERSION,
      savedAt: "2026-08-14T00:00:00.000Z",
      form: partial,
    })

    const fallback = buildFallback({
      rateAdjustments: [{ rateTypeId: "rate-1", discountPct: 10 }],
      description: "Server description",
    })
    const restored = readSupplierDraft(stored, fallback)

    expect(restored).not.toBeNull()
    expect(restored?.rateAdjustments).toEqual([{ rateTypeId: "rate-1", discountPct: 10 }])
    expect(restored?.bedroomTypes).toEqual([])
    expect(restored?.bedroomLayouts).toEqual([])
    expect(restored?.bathroomTypes).toEqual([])
    expect(restored?.stationAddresses).toEqual([])
    expect(restored?.description).toBe("Server description")
    // The draft's own edits survive.
    expect(restored?.name).toBe("Rovos Rail (edited)")
  })

  it("defaults suite type variant ids that a stored draft predates", () => {
    const draft = buildDraft({
      suiteTypes: [
        {
          id: "suite-1",
          name: "Royal Suite",
          passengerCapacity: 2,
          luggageCapacity: null,
          description: null,
          active: true,
          sortOrder: 0,
          bedroomTypeIds: [],
          bedroomLayoutIds: [],
          bathroomTypeIds: [],
        },
      ],
    })
    const storedSuite = { ...draft.suiteTypes[0] } as Record<string, unknown>
    delete storedSuite.bedroomTypeIds
    delete storedSuite.bedroomLayoutIds
    delete storedSuite.bathroomTypeIds

    const stored = JSON.stringify({
      version: SUPPLIER_DRAFT_SCHEMA_VERSION,
      savedAt: "2026-08-14T00:00:00.000Z",
      form: { ...draft, suiteTypes: [storedSuite] },
    })

    const restored = readSupplierDraft(stored, buildFallback())
    expect(restored?.suiteTypes[0].bedroomTypeIds).toEqual([])
    expect(restored?.suiteTypes[0].bedroomLayoutIds).toEqual([])
    expect(restored?.suiteTypes[0].bathroomTypeIds).toEqual([])
    expect(restored?.suiteTypes[0].name).toBe("Royal Suite")
  })

  it("falls back to the server email list when the draft has none", () => {
    const stored = JSON.stringify({
      version: SUPPLIER_DRAFT_SCHEMA_VERSION,
      savedAt: "2026-08-14T00:00:00.000Z",
      form: { ...buildDraft(), emails: [] },
    })
    const restored = readSupplierDraft(stored, buildFallback())
    expect(restored?.emails).toEqual([
      { id: "email-1", email: "res@rovos.test", label: "Reservations" },
    ])
  })

  it("replaces values stored with the wrong type", () => {
    const stored = JSON.stringify({
      version: SUPPLIER_DRAFT_SCHEMA_VERSION,
      savedAt: "2026-08-14T00:00:00.000Z",
      form: { ...buildDraft(), description: null, packages: [], rateAdjustments: "nope" },
    })
    const restored = readSupplierDraft(stored, buildFallback())
    expect(restored?.description).toBe("Server description")
    expect(restored?.rateAdjustments).toEqual([])
  })
})
