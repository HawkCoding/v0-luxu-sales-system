import { describe, expect, it } from "vitest"
import {
  getDocumentBrandSettings,
  getDocumentTextSettings,
  resolveProductCopy,
} from "./settings-access"

type Row = { key: string; value: string }

/** Minimal supabase double covering only the two tables these resolvers read. */
function buildSupabase(opts: { appSettingsRows?: Row[]; kindRows?: Row[] } = {}) {
  const appSettingsRows = opts.appSettingsRows ?? []
  const kindRows = opts.kindRows ?? []
  return {
    from: (table: string) => {
      if (table === "app_settings") {
        return { select: () => ({ in: async () => ({ data: appSettingsRows, error: null }) }) }
      }
      if (table === "supplier_kind_document_text") {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({ data: kindRows, error: null }),
            }),
          }),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe("getDocumentTextSettings", () => {
  it("returns the global value when no kind is given", async () => {
    const supabase = buildSupabase({
      appSettingsRows: [{ key: "quote_doc_footer_text", value: "Global footer." }],
    })

    const settings = await getDocumentTextSettings(supabase)
    expect(settings.quote_doc_footer_text).toBe("Global footer.")
  })

  it("overlays a per-kind override on top of the global value", async () => {
    const supabase = buildSupabase({
      appSettingsRows: [{ key: "quote_doc_footer_text", value: "Global footer." }],
      kindRows: [{ key: "quote_doc_footer_text", value: "Stay footer." }],
    })

    const settings = await getDocumentTextSettings(supabase, "hotel_property")
    expect(settings.quote_doc_footer_text).toBe("Stay footer.")
    // Untouched keys still fall through to the global/code default.
    expect(settings.quote_doc_title).toBe("QUOTATION")
  })

  it("treats an empty-string override row as absent, falling back to the global value", async () => {
    const supabase = buildSupabase({
      appSettingsRows: [{ key: "quote_doc_footer_text", value: "Global footer." }],
      kindRows: [{ key: "quote_doc_footer_text", value: "   " }],
    })

    const settings = await getDocumentTextSettings(supabase, "hotel_property")
    expect(settings.quote_doc_footer_text).toBe("Global footer.")
  })

  it("falls back to the global value for a kind with no override rows at all", async () => {
    const supabase = buildSupabase({
      appSettingsRows: [{ key: "quote_doc_footer_text", value: "Global footer." }],
    })

    const settings = await getDocumentTextSettings(supabase, "tour_operator")
    expect(settings.quote_doc_footer_text).toBe("Global footer.")
  })
})

describe("getDocumentBrandSettings", () => {
  it("overlays only heading/subheading, never the logo or placement", async () => {
    const supabase = buildSupabase({
      appSettingsRows: [
        { key: "brand_block_heading", value: "Global heading" },
        { key: "brand_block_subheading", value: "Luxury Rail Journeys" },
        { key: "brand_block_position_quote", value: "top" },
      ],
      // Even if a row exists for a non-overridable key, it must never apply.
      kindRows: [
        { key: "brand_block_subheading", value: "Luxury Stays" },
        { key: "brand_block_position_quote", value: "hidden" },
      ],
    })

    const settings = await getDocumentBrandSettings(supabase, "hotel_property")
    expect(settings.brand_block_subheading).toBe("Luxury Stays")
    expect(settings.brand_block_heading).toBe("Global heading")
    expect(settings.brand_block_position_quote).toBe("top")
  })

  it("returns the global settings unchanged when no kind is given", async () => {
    const supabase = buildSupabase({
      appSettingsRows: [{ key: "brand_block_subheading", value: "Luxury Rail Journeys" }],
    })

    const settings = await getDocumentBrandSettings(supabase)
    expect(settings.brand_block_subheading).toBe("Luxury Rail Journeys")
  })
})

describe("resolveProductCopy", () => {
  it("falls back to the code vocabulary noun when nothing is overridden", async () => {
    const supabase = buildSupabase()

    const copy = await resolveProductCopy(supabase, "hotel_property")
    expect(copy.bookingNoun).toBe("Stay")
    expect(copy.startDateLabel).toBe("Check-in Date")
  })

  it("prefers a per-kind override over the code vocabulary noun", async () => {
    const supabase = buildSupabase({
      kindRows: [{ key: "product_booking_noun", value: "Getaway" }],
    })

    const copy = await resolveProductCopy(supabase, "hotel_property")
    expect(copy.bookingNoun).toBe("Getaway")
    // The unrelated field still comes from the vocabulary.
    expect(copy.startDateLabel).toBe("Check-in Date")
  })

  it("falls back to the train_operator vocabulary (Journey) for a null kind", async () => {
    const supabase = buildSupabase()

    const copy = await resolveProductCopy(supabase, null)
    expect(copy.bookingNoun).toBe("Journey")
  })
})
