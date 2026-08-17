// Density token sets for the voucher stylesheet (`./styles.ts`). `comfortable`
// reproduces the pre-existing hard-coded numbers exactly, so the itinerary PDF
// (which shares `voucherStyles`/`ServiceBlock` but always passes no density —
// i.e. defaults to "comfortable") renders byte-for-byte the same as before.
// `compact` is the voucher's own density: a booking with 5-6 services should
// fit in ~2 pages instead of 4+.
export type DocumentDensity = "comfortable" | "compact"

export interface DensityTokens {
  page: { paddingTop: number; paddingHorizontal: number; paddingBottom: number }
  frame: { outerInset: number; innerInset: number }
  header: {
    marginBottom: number
    logoCenterHeight: number
    logoCenterWidth: number
  }
  title: { fontSize: number; letterSpacing: number }
  voucherNumberRow: { marginTop: number; marginBottom: number }
  stub: { paddingVertical: number; numberFontSize: number }
  guidance: { fontSize: number; lineHeight: number; marginBottom: number }
  section: { marginBottom: number }
  sectionTitle: { fontSize: number; letterSpacing: number; paddingBottom: number; marginBottom: number }
  infoRow: { marginBottom: number }
  infoRowDotted: { paddingBottom: number }
  infoLabel: { width: number; fontSize: number; letterSpacing: number; textAlign: "left" | "right" }
  infoValue: { fontSize: number; lineHeight: number }
  infoRowShaded: { paddingVertical: number; paddingHorizontal: number }
  cell: { marginRight: number; labelFontSize: number; valueFontSize: number }
  providerBox: { paddingHorizontal: number; paddingVertical: number }
  providerName: { fontSize: number; marginBottom: number }
  providerContact: { fontSize: number; marginBottom: number }
  endOfServices: { marginTop: number; marginBottom: number }
  footerSection: { marginTop: number }
  pageNumber: { bottom: number }
  /** Rough char budget a `ServiceBlock` can hold on one page before it must be
   * allowed to wrap — see `sections/service-block.tsx`. */
  singlePageCharBudget: number
}

const comfortable: DensityTokens = {
  page: { paddingTop: 48, paddingHorizontal: 56, paddingBottom: 56 },
  frame: { outerInset: 20, innerInset: 24 },
  header: {
    marginBottom: 18,
    logoCenterHeight: 70,
    logoCenterWidth: 180,
  },
  title: { fontSize: 22, letterSpacing: 3 },
  voucherNumberRow: { marginTop: 18, marginBottom: 10 },
  stub: { paddingVertical: 6, numberFontSize: 14 },
  guidance: { fontSize: 9, lineHeight: 1.5, marginBottom: 18 },
  section: { marginBottom: 18 },
  sectionTitle: { fontSize: 8.5, letterSpacing: 2, paddingBottom: 6, marginBottom: 10 },
  infoRow: { marginBottom: 6 },
  infoRowDotted: { paddingBottom: 5 },
  infoLabel: { width: 140, fontSize: 8.5, letterSpacing: 1, textAlign: "left" },
  infoValue: { fontSize: 10, lineHeight: 1.4 },
  infoRowShaded: { paddingVertical: 3, paddingHorizontal: 6 },
  cell: { marginRight: 24, labelFontSize: 7.5, valueFontSize: 10 },
  providerBox: { paddingHorizontal: 14, paddingVertical: 14 },
  providerName: { fontSize: 13, marginBottom: 4 },
  providerContact: { fontSize: 8, marginBottom: 10 },
  endOfServices: { marginTop: 4, marginBottom: 18 },
  footerSection: { marginTop: 8 },
  pageNumber: { bottom: 32 },
  singlePageCharBudget: 1800,
}

const compact: DensityTokens = {
  page: { paddingTop: 34, paddingHorizontal: 40, paddingBottom: 40 },
  frame: { outerInset: 14, innerInset: 17 },
  header: {
    marginBottom: 10,
    logoCenterHeight: 52,
    logoCenterWidth: 140,
  },
  title: { fontSize: 16, letterSpacing: 2 },
  voucherNumberRow: { marginTop: 10, marginBottom: 6 },
  stub: { paddingVertical: 3, numberFontSize: 11 },
  guidance: { fontSize: 7.5, lineHeight: 1.3, marginBottom: 10 },
  section: { marginBottom: 10 },
  sectionTitle: { fontSize: 7.5, letterSpacing: 1.2, paddingBottom: 3, marginBottom: 5 },
  infoRow: { marginBottom: 1.5 },
  infoRowDotted: { paddingBottom: 2.5 },
  infoLabel: { width: 108, fontSize: 7.5, letterSpacing: 0.4, textAlign: "right" },
  infoValue: { fontSize: 9, lineHeight: 1.25 },
  infoRowShaded: { paddingVertical: 1.5, paddingHorizontal: 5 },
  cell: { marginRight: 16, labelFontSize: 6.5, valueFontSize: 9 },
  providerBox: { paddingHorizontal: 9, paddingVertical: 7 },
  providerName: { fontSize: 11, marginBottom: 1.5 },
  providerContact: { fontSize: 7, marginBottom: 5 },
  endOfServices: { marginTop: 2, marginBottom: 8 },
  footerSection: { marginTop: 6 },
  pageNumber: { bottom: 22 },
  // Deliberately conservative, not a measurement of real per-page capacity (which is far
  // higher at this row height) — just enough headroom above `comfortable` that ordinary
  // blocks never wrap, while single-row content in the thousands of characters still does.
  singlePageCharBudget: 2200,
}

export const DENSITY: Record<DocumentDensity, DensityTokens> = { comfortable, compact }
