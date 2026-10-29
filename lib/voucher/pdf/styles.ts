import { StyleSheet } from "@react-pdf/renderer"
import { BOLD, BOX_RADIUS, DESIGN_COLORS, PAGE_BOTTOM, PAGE_TOP, REGULAR, type PagePadding } from "@/lib/pdf/sarail-design"

// The voucher and itinerary PDFs in the SA-Rail document design (Figma "SA-Rail new Templates",
// Travel Vouchers). Colours and type are the design's own — the voucher template's accent colour,
// section colour and font picker only drive the HTML preview now.

/** The gap between boxes. It sits ABOVE each box (a trailing bottom margin would count against the
 * page's last box and push a box that fits onto the next page), so continuation pages start their
 * padding one gap higher and a box at the top of a page still lands on PAGE_TOP. */
const BOX_GAP = 14.7

/** Page padding: the Swirl boxes run x 30.4 → 565, centred like the quote's and invoice's (the
 * template's page-one boxes sit 3pt right of centre; its page-two box is the centred one). */
export const VOUCHER_PAGE_PADDING: PagePadding = { top: PAGE_TOP - BOX_GAP, left: 30.4, right: 30.28 }

/** Inside a box: labels at x 58.1, values at x 165.6 (the template's page-two box). Values run to
 * x 545 — the template lets a long station address reach 543.8 on one line. */
const BOX_INSET = 27.7
const BOX_INSET_RIGHT = 20
/** Pulls centred lines back onto the page's centre line despite the uneven box insets. */
const RECENTRE = BOX_INSET - BOX_INSET_RIGHT
export const VOUCHER_LABEL_WIDTH = 107.5
/** Cell columns inside a row's value area (Adults / Children / Infants; the room name / QTY). */
export const VOUCHER_CELL_COLUMNS = [126.7, 140] as const

/** 8pt rows on the template's 11.1pt pitch. */
const ROW_LINE = 11.1 / 8

export function voucherStyles() {
  return StyleSheet.create({
    // NOTE: do not set lineHeight on the Page — react-pdf drops `fixed` render-prop text (the
    // last-page footer) when a Page ancestor has lineHeight. Apply it on the text styles instead.
    page: {
      ...REGULAR,
      fontSize: 10,
      color: DESIGN_COLORS.ink,
      backgroundColor: DESIGN_COLORS.page,
      paddingTop: VOUCHER_PAGE_PADDING.top,
      paddingLeft: VOUCHER_PAGE_PADDING.left,
      paddingRight: VOUCHER_PAGE_PADDING.right,
      paddingBottom: PAGE_BOTTOM,
    },
    // Title glyphs sit where the template's do (its title box is taller than Manrope's own line).
    titleRow: {
      flexDirection: "row",
      marginTop: 8.6,
      marginLeft: 29.1,
    },
    title: {
      ...BOLD,
      fontSize: 21.66,
      width: 268.1,
    },
    reference: {
      flexDirection: "row",
      flex: 1,
      paddingTop: 8.5,
    },
    referenceLabel: { ...BOLD, fontSize: 10, width: 100.4 },
    referenceValue: { fontSize: 10, flex: 1 },
    box: {
      backgroundColor: DESIGN_COLORS.box,
      borderRadius: BOX_RADIUS,
      paddingTop: 10.3,
      paddingBottom: 12.7,
      paddingLeft: BOX_INSET,
      paddingRight: BOX_INSET_RIGHT,
      marginTop: BOX_GAP,
    },
    guestBox: {
      marginTop: 4.3,
      paddingTop: 11.2,
      paddingBottom: 9.6,
    },
    guidance: {
      fontSize: 6,
      lineHeight: 1.37,
      marginTop: 6.6,
      marginLeft: -7 - RECENTRE,
      marginRight: -7,
      textAlign: "center",
    },
    guidanceStandalone: {
      fontSize: 6,
      lineHeight: 1.37,
      textAlign: "center",
    },
    providerName: {
      ...BOLD,
      fontSize: 10,
      marginLeft: -RECENTRE,
      textAlign: "center",
    },
    providerContact: {
      fontSize: 6,
      lineHeight: 1.37,
      marginTop: 3.5,
      marginLeft: -RECENTRE,
      textAlign: "center",
    },
    providerDescription: {
      fontSize: 8,
      lineHeight: 1.33,
      marginTop: 8,
    },
    rows: {
      marginTop: 8.7,
    },
    guestRows: {
      marginTop: 0,
    },
    infoRow: {
      flexDirection: "row",
    },
    infoLabel: {
      ...BOLD,
      fontSize: 8,
      lineHeight: ROW_LINE,
      width: VOUCHER_LABEL_WIDTH,
    },
    infoValue: {
      fontSize: 8,
      lineHeight: ROW_LINE,
      flex: 1,
    },
    cellGroup: {
      flex: 1,
      flexDirection: "row",
    },
    cell: {
      flexDirection: "row",
    },
    cellLabel: {
      ...BOLD,
      fontSize: 8,
      lineHeight: ROW_LINE,
    },
    cellValue: {
      fontSize: 8,
      lineHeight: ROW_LINE,
      flex: 1,
    },
    providerFootnote: {
      fontSize: 7,
      lineHeight: 1.3,
      marginTop: 4,
    },
    endOfServices: {
      fontSize: 10,
      marginTop: 7 + BOX_GAP,
      textAlign: "center",
    },
  })
}

export type VoucherStyles = ReturnType<typeof voucherStyles>
