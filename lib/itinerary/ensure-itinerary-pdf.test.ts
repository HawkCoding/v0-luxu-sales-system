import { beforeEach, describe, expect, it, vi } from "vitest"

const buildMocks = vi.hoisted(() => ({
  buildItineraryData: vi.fn(),
}))

const renderMocks = vi.hoisted(() => ({
  renderItineraryPdf: vi.fn(),
}))

const settingsMocks = vi.hoisted(() => ({
  getDocumentTextSettings: vi.fn(),
  getDocumentBrandSettings: vi.fn(),
  resolveDocumentBrand: vi.fn(),
}))

vi.mock("@/lib/itinerary/build-itinerary", () => ({
  buildItineraryData: buildMocks.buildItineraryData,
}))

vi.mock("@/lib/itinerary/render-pdf", () => ({
  renderItineraryPdf: renderMocks.renderItineraryPdf,
}))

vi.mock("@/lib/settings-access", () => ({
  getDocumentTextSettings: settingsMocks.getDocumentTextSettings,
  getDocumentBrandSettings: settingsMocks.getDocumentBrandSettings,
  resolveDocumentBrand: settingsMocks.resolveDocumentBrand,
}))

import { ensureItineraryPdf } from "./ensure-itinerary-pdf"

const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"

interface BuildOptions {
  existingDocument?: { id: string; booking_id: string; storage_path: string } | null
  existingItinerary?: { id: string; name: string; notes: string } | null
  uploadError?: { message: string } | null
}

function buildSupabase(options: BuildOptions = {}) {
  const { existingDocument = null, existingItinerary = null, uploadError = null } = options

  const documentInsertResult = {
    id: "doc-new",
    booking_id: BOOKING_ID,
    storage_path: "vouchers/BT-2026-0001/itinerary-BT-2026-0001.pdf",
    created_at: "2026-07-22T00:00:00Z",
  }

  const upload = vi.fn(async () => ({ error: uploadError }))
  const remove = vi.fn(async () => ({ error: null }))

  let documentsSelectCallCount = 0

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "documents") {
        documentsSelectCallCount += 1
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: existingDocument, error: null })),
          update: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          single: vi.fn(async () => ({ data: documentInsertResult, error: null })),
        }
      }
      if (table === "itineraries") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: existingItinerary, error: null })),
          update: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          single: vi.fn(async () => ({
            data: existingItinerary ?? { id: "itin-new" },
            error: null,
          })),
        }
      }
      if (table === "bookings") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn(async () => ({
            data: {
              id: BOOKING_ID,
              booking_number: "BT-2026-0001",
              consultant: "CDJ",
              departure_date: "2026-09-14",
              no_of_adults: 2,
              no_of_children: 0,
              route_reversed: false,
              customer: { first_name: "Jane", last_name: "Smith", email: "guest@example.test", phone: null, title: "Mrs" },
              route: {
                name: "Pretoria ↔ Cape Town",
                direction_mode: "round_trip",
                origin: { name: "Pretoria" },
                destination: { name: "Cape Town" },
              },
            },
            error: null,
          })),
        }
      }
      if (table === "voucher_template") {
        return {
          select: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
    storage: {
      from: vi.fn(() => ({ upload, remove })),
    },
  }

  return { supabase, upload, remove, documentInsertResult }
}

describe("ensureItineraryPdf", () => {
  beforeEach(() => {
    buildMocks.buildItineraryData.mockReset()
    buildMocks.buildItineraryData.mockResolvedValue({
      bookingNumber: "BT-2026-0001",
      tripTitle: "Pretoria → Cape Town — Smith Family",
      tripNotes: "",
      guestNames: "Mrs Smith — 2 adults",
      departure: "14 September 2026",
      consultantName: "Carla de Jager",
      serviceBlocks: [],
    })
    renderMocks.renderItineraryPdf.mockReset()
    renderMocks.renderItineraryPdf.mockResolvedValue(Buffer.from("pdf-bytes"))
    settingsMocks.getDocumentTextSettings.mockReset()
    settingsMocks.getDocumentTextSettings.mockResolvedValue({
      itinerary_doc_journey_heading: "Your Journey",
      itinerary_doc_intro_text: "",
    })
    settingsMocks.getDocumentBrandSettings.mockReset()
    settingsMocks.getDocumentBrandSettings.mockResolvedValue({})
    settingsMocks.resolveDocumentBrand.mockReset()
    settingsMocks.resolveDocumentBrand.mockReturnValue({ brand: {}, position: {} })
  })

  it("returns the existing document without rebuilding when one already exists", async () => {
    const { supabase, upload } = buildSupabase({
      existingDocument: {
        id: "doc-existing",
        booking_id: BOOKING_ID,
        storage_path: "vouchers/BT-2026-0001/itinerary-BT-2026-0001.pdf",
      },
      existingItinerary: { id: "itin-existing", name: "Existing Trip", notes: "" },
    })

    const result = await ensureItineraryPdf(supabase as never, { bookingId: BOOKING_ID })

    expect(result.regenerated).toBe(false)
    expect(result.documentId).toBe("doc-existing")
    expect(upload).not.toHaveBeenCalled()
    expect(buildMocks.buildItineraryData).not.toHaveBeenCalled()
  })

  it("builds and stores a new itinerary PDF, auto-deriving the trip title, when none exists", async () => {
    const { supabase, upload } = buildSupabase({ existingDocument: null, existingItinerary: null })

    const result = await ensureItineraryPdf(supabase as never, { bookingId: BOOKING_ID })

    expect(result.regenerated).toBe(true)
    expect(result.documentId).toBe("doc-new")
    expect(upload).toHaveBeenCalledTimes(1)
    expect(buildMocks.buildItineraryData).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        bookingId: BOOKING_ID,
        tripTitle: "Pretoria → Cape Town — Smith Family",
        tripNotes: "",
      }),
    )
  })

  it("reuses an existing itineraries row's name/notes instead of the auto-derived default", async () => {
    const { supabase } = buildSupabase({
      existingDocument: null,
      existingItinerary: { id: "itin-existing", name: "Custom Honeymoon Title", notes: "Anniversary trip" },
    })

    await ensureItineraryPdf(supabase as never, { bookingId: BOOKING_ID })

    expect(buildMocks.buildItineraryData).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        tripTitle: "Custom Honeymoon Title",
        tripNotes: "Anniversary trip",
      }),
    )
  })

  it("throws and does not leave an orphaned upload when storage upload fails", async () => {
    const { supabase, remove } = buildSupabase({
      existingDocument: null,
      existingItinerary: null,
      uploadError: { message: "storage down" },
    })

    await expect(ensureItineraryPdf(supabase as never, { bookingId: BOOKING_ID })).rejects.toThrow(
      "Itinerary PDF could not be stored",
    )
    expect(remove).not.toHaveBeenCalled()
  })
})
