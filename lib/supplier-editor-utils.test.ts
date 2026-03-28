import { describe, expect, it } from "vitest"
import {
  getOverlapValidationSignature,
  shouldHydrateFormFromServer,
  type OverlapValidationSignatureInput,
} from "@/lib/supplier-editor-utils"

function buildSignatureInput(): OverlapValidationSignatureInput {
  return {
    suiteTypes: [{ id: "suite-1" }],
    packages: [
      {
        id: "pkg-1",
        rateCards: [
          {
            suiteTypeId: "suite-1",
            routeId: "route-1",
            currency: "ZAR",
            validFrom: "2026-01-01",
            validTo: null,
          },
        ],
      },
    ],
  }
}

describe("shouldHydrateFormFromServer", () => {
  it("keeps local draft edits while actively editing same supplier", () => {
    expect(
      shouldHydrateFormFromServer({
        hasLocalForm: true,
        isEditing: true,
        supplierStatus: "draft",
        supplierIdentityChanged: false,
      }),
    ).toBe(false)
  })

  it("hydrates when supplier identity changes", () => {
    expect(
      shouldHydrateFormFromServer({
        hasLocalForm: true,
        isEditing: true,
        supplierStatus: "draft",
        supplierIdentityChanged: true,
      }),
    ).toBe(true)
  })

  it("hydrates when there is no local form state", () => {
    expect(
      shouldHydrateFormFromServer({
        hasLocalForm: false,
        isEditing: true,
        supplierStatus: "draft",
        supplierIdentityChanged: false,
      }),
    ).toBe(true)
  })

  it.each(["active", "inactive"] as const)(
    "hydrates for non-draft supplier status: %s",
    (supplierStatus) => {
      expect(
        shouldHydrateFormFromServer({
          hasLocalForm: true,
          isEditing: true,
          supplierStatus,
          supplierIdentityChanged: false,
        }),
      ).toBe(true)
    },
  )

  it("hydrates when draft is not actively being edited", () => {
    expect(
      shouldHydrateFormFromServer({
        hasLocalForm: true,
        isEditing: false,
        supplierStatus: "draft",
        supplierIdentityChanged: false,
      }),
    ).toBe(true)
  })
})

describe("getOverlapValidationSignature", () => {
  it("does not change for price-only edits", () => {
    const base = buildSignatureInput()
    const updatedPrice: OverlapValidationSignatureInput = {
      ...base,
      packages: [
        {
          ...base.packages[0],
          rateCards: [
            {
              ...base.packages[0].rateCards[0],
              // price is intentionally omitted from overlap signature data shape
            },
          ],
        },
      ],
    }

    expect(getOverlapValidationSignature(updatedPrice)).toBe(
      getOverlapValidationSignature(base),
    )
  })

  it("changes when overlap-relevant fields change", () => {
    const base = buildSignatureInput()
    const changedDate: OverlapValidationSignatureInput = {
      ...base,
      packages: [
        {
          ...base.packages[0],
          rateCards: [
            {
              ...base.packages[0].rateCards[0],
              validFrom: "2026-02-01",
            },
          ],
        },
      ],
    }

    expect(getOverlapValidationSignature(changedDate)).not.toBe(
      getOverlapValidationSignature(base),
    )
  })

  it("uses __null__ placeholder when routeId is null", () => {
    const signature = getOverlapValidationSignature({
      suiteTypes: [{ id: "suite-1" }],
      packages: [
        {
          id: "pkg-1",
          rateCards: [
            {
              suiteTypeId: "suite-1",
              routeId: null,
              currency: "ZAR",
              validFrom: "2026-01-01",
              validTo: null,
            },
          ],
        },
      ],
    })

    expect(signature).toContain("rate:suite-1:__null__:ZAR:2026-01-01:")
  })

  it("changes when currency changes", () => {
    const base = buildSignatureInput()
    const changedCurrency: OverlapValidationSignatureInput = {
      ...base,
      packages: [
        {
          ...base.packages[0],
          rateCards: [{ ...base.packages[0].rateCards[0], currency: "USD" }],
        },
      ],
    }
    expect(getOverlapValidationSignature(changedCurrency)).not.toBe(
      getOverlapValidationSignature(base),
    )
  })

  it("distinguishes validTo null and empty string", () => {
    const withNull: OverlapValidationSignatureInput = {
      suiteTypes: [{ id: "suite-1" }],
      packages: [
        {
          id: "pkg-1",
          rateCards: [
            {
              suiteTypeId: "suite-1",
              routeId: "route-1",
              currency: "ZAR",
              validFrom: "2026-01-01",
              validTo: null,
            },
          ],
        },
      ],
    }
    const withEmpty: OverlapValidationSignatureInput = {
      ...withNull,
      packages: [
        {
          ...withNull.packages[0],
          rateCards: [{ ...withNull.packages[0].rateCards[0], validTo: "" }],
        },
      ],
    }

    expect(getOverlapValidationSignature(withNull)).toBe(
      getOverlapValidationSignature(withEmpty),
    )
  })

  it("returns empty string for empty inputs", () => {
    expect(getOverlapValidationSignature({ suiteTypes: [], packages: [] })).toBe("")
  })

  it("is order-dependent for suiteTypes and packages", () => {
    const firstOrder: OverlapValidationSignatureInput = {
      suiteTypes: [{ id: "suite-1" }, { id: "suite-2" }],
      packages: [
        {
          id: "pkg-1",
          rateCards: [],
        },
        {
          id: "pkg-2",
          rateCards: [],
        },
      ],
    }
    const secondOrder: OverlapValidationSignatureInput = {
      suiteTypes: [{ id: "suite-2" }, { id: "suite-1" }],
      packages: [
        {
          id: "pkg-2",
          rateCards: [],
        },
        {
          id: "pkg-1",
          rateCards: [],
        },
      ],
    }

    expect(getOverlapValidationSignature(firstOrder)).not.toBe(
      getOverlapValidationSignature(secondOrder),
    )
  })
})
