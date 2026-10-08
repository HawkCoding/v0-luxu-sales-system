import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer"
import {
  FOOTER_BRAND_DIVISION_LINE,
  FOOTER_BRAND_PRODUCT_LINE,
} from "@/lib/assets/footer-brand"
import { formatDisplayDate, formatDisplayDateLong } from "@/lib/date-format"
import type { InvoiceDepartureRow } from "@/lib/invoices/departure-rows"
import { formatMoney } from "@/lib/money"
import type { BrandLogoImage } from "@/lib/pdf/brand-logo"
import { registerDocumentFonts } from "@/lib/pdf/document-fonts"
import {
  BOLD,
  BOX_RADIUS,
  BulletRow,
  DESIGN_COLORS,
  DocumentFooter,
  DocumentHeader,
  PAGE_BOTTOM,
  PAGE_TOP,
  PageBackground,
  REGULAR,
  RULE_WIDTH,
  buildDocumentFooterLines,
  footerCompanyFromBanking,
  withColon,
  type PagePadding,
} from "@/lib/pdf/sarail-design"
import {
  AGENT_COMMISSION_LABEL,
  DISCOUNT_LABEL,
  formatAgentCommission,
  formatDiscount,
} from "@/lib/quotes/quote-presentation"
import type { BankingSettings, BrandBlockPosition, DocumentBrand } from "@/lib/settings-access"

/** The invoice recipient. A full tax invoice must name and address them. */
export interface InvoiceBillingParty {
  companyName?: string | null
  /** Street / estate / town, province / postal code / country, already ordered for display — the
   *  postal code is one of these lines (see buildBillingParty). Empty renders a dash. */
  addressLines?: string[]
  phone?: string | null
  email?: string | null
  vatNumber?: string | null
}

/** One direction of travel — a round trip renders one block per leg. Its rows are built by
 *  `invoiceRowsForBlock` (lib/invoices/departure-rows.ts) from the same per-kind logic the
 *  voucher uses, so the two documents can never again disagree about what a booking is. */
export interface InvoiceDepartureLeg {
  heading: string
  rows: InvoiceDepartureRow[]
}

export interface InvoiceDeparture {
  /** Train / product name, e.g. "The Blue Train" — the primary supplier's own name, whatever kind
   *  it is. */
  trainName?: string | null
  /** What `trainName` names, per kind ("Train", "Tour Operator", "Hotel", …). */
  productLabel?: string | null
  /** Tour or package name, e.g. "Pretoria Journey". */
  tourName?: string | null
  /** e.g. "2 Nights / 3 Days", or "4 Days" for a kind that counts in days. */
  daysLabel?: string | null
  /** Number of suites booked. */
  qty?: string | null
  adults?: string | null
  children?: string | null
  /** One block per direction — a round trip (two train blocks) renders a second, headed "Return
   *  Journey". Every other kind has exactly one. */
  legs: InvoiceDepartureLeg[]
}

export interface InvoiceItem {
  pax: number
  description: string
  unitPrice: number
  total: number
  /** The day the service is used (YYYY-MM-DD) — printed in the description table's date column. */
  date?: string | null
  /** HH:MM the service starts, when the booking has one captured for it. */
  time?: string | null
}

/**
 * The money ladder down the right of the invoice. Amounts are shown
 * VAT-inclusive only — the sales team's invoices never break out VAT.
 */
export interface InvoiceTotals {
  /** VAT-inclusive subtotal — the reference's "Subtotal incl. VAT". Gross of any agent commission. */
  subtotalInclVat: number
  /** Positive magnitude of the agency discount. Zero/absent renders the ladder exactly as it did
   *  before this field existed — no commission row, no separate total row. */
  agentCommission?: number
  /** subtotalInclVat − agentCommission. Only rendered as its own row when agentCommission > 0;
   *  the deposit/final/outstanding figures below already derive from this, not from subtotalInclVat. */
  totalInclVat?: number
  /** Client-facing Discount. Only rendered as its own row when discountVisible and discount > 0. */
  discount?: number
  discountVisible?: boolean
  depositPercentage?: number | null
  depositAmount?: number | null
  finalAmount: number
  finalDueDate?: string | null
  amountReceived: number
  amountReceivedAt?: string | null
  outstanding: number
  /** True when the client owes the full amount in one payment (no deposit split). */
  fullPayment?: boolean
  /** "Total per Adult" / "Total per Child" at the top of the totals, above the (Sub) Total rows
   *  (derivePerPersonTotals). Null/absent omits the row — no adults or no total (perAdult), no
   *  paying children (perChild). */
  perAdult?: number | null
  perChild?: number | null
}

/** The figure the "Total incl. VAT:" row prints: net of any printed deduction, else the subtotal. */
export function printedTotalInclVat(totals: InvoiceTotals): number {
  const hasDeduction =
    Boolean(totals.agentCommission) || ((totals.discountVisible ?? true) && Boolean(totals.discount))
  return hasDeduction ? (totals.totalInclVat ?? totals.subtotalInclVat) : totals.subtotalInclVat
}

export interface InvoicePdfData {
  invoiceNumber: string
  bookingNumber: string
  customerName: string
  issueDate: string
  dueDate: string | null
  /** Initials or name of the consultant handling the booking. */
  consultant?: string | null
  /** Traveller names printed as Guest 1 / Guest 2. Falls back to customerName. */
  guestNames?: string[]
  billing?: InvoiceBillingParty
  departure?: InvoiceDeparture | null
  items: InvoiceItem[]
  totals: InvoiceTotals
  currency?: string
  statusLabel?: string
  banking: BankingSettings
  /** Settings' invoice footer wording. The SA-Rail design's footer is the company block alone, so
   *  this is no longer printed; kept so callers and the Settings field stay valid. */
  footerText?: string
  paymentNote?: string
  bankChargesNote?: string
  /** SARAIL brand block copy + logo. Omitted falls back to the fixed constants. */
  brand?: DocumentBrand
  /** "hidden" drops the letterhead; the design has no bottom slot, so "bottom" prints it on top. */
  brandPosition?: BrandBlockPosition
  brandLogo?: BrandLogoImage | null
}

function formatDate(value: string | null | undefined): string {
  return formatDisplayDate(value?.slice(0, 10)) || "To be confirmed"
}

/** "16 March 2027" — the description table's date column. Blank when the line has no date. */
export function formatInvoiceItemDate(date: string | null | undefined): string {
  return date ? formatDisplayDateLong(date.slice(0, 10)) : ""
}

/** "12h00" — the description table's time column, its own column between the date and the
 *  description. Blank when the line has no date or no captured start time. */
export function formatInvoiceItemTime(date: string | null | undefined, time: string | null | undefined): string {
  if (!formatInvoiceItemDate(date)) return ""
  const [hours, minutes] = (time ?? "").split(":")
  return hours && minutes ? `${hours}h${minutes.slice(0, 2)}` : ""
}

/** Empty cells print as an en dash so a blank never reads as missing data. */
const EMPTY = "–"

function orDash(value: string | null | undefined): string {
  return value?.trim() || EMPTY
}

interface GuestCell {
  label: string
  name: string
}

/** The guests as box rows, two to a row: Guest 1 | Guest 2, Guest 3 | Guest 4, … Guest 1 falls back
 *  to the customer and Guest 2 always prints (a dash when missing); an odd last guest gets an empty
 *  right cell. */
function guestRows(guestNames: string[] | undefined, customerName: string): Array<[GuestCell, GuestCell | null]> {
  const guests = (guestNames ?? []).map((name) => name.trim()).filter(Boolean)
  const names = [guests[0] ?? customerName ?? "Valued Guest", guests[1] ?? EMPTY, ...guests.slice(2)]
  const rows: Array<[GuestCell, GuestCell | null]> = []
  for (let index = 0; index < names.length; index += 2) {
    const right = names[index + 1]
    rows.push([
      { label: `Guest ${index + 1}:`, name: names[index] },
      right === undefined ? null : { label: `Guest ${index + 2}:`, name: right },
    ])
  }
  return rows
}

/** How the billing rows share the box's two columns under the guest grid. */
type BillingLayout = "standard" | "address-alone" | "contacts-right"

/**
 * - "standard" (1–2 guests): Company, Address, Phone, E-mail | VAT — the original block.
 * Each guest row past the first adds height, so from 3 guests the block rebalances to stay on one page:
 * - "address-alone" (a 3+ line address): Address | Company, VAT, Phone, E-mail.
 * - "contacts-right" (a 0–2 line address, or none): Company, Address | VAT, Phone, E-mail.
 */
function billingLayout(guestRowCount: number, addressLineCount: number): BillingLayout {
  if (guestRowCount <= 1) return "standard"
  return addressLineCount >= 3 ? "address-alone" : "contacts-right"
}

/**
 * "25% Deposit due now" reads as a fresh demand once the deposit has actually
 * been paid — drop the "due now" and print just "25% Deposit" instead. A cent
 * of rounding slack covers float drift between the stored deposit amount and
 * payments received.
 */
function depositRowLabel(totals: InvoiceTotals): string {
  const pctPrefix = totals.depositPercentage ? `${totals.depositPercentage}% Deposit` : "Deposit"
  const depositAmount = totals.depositAmount ?? 0
  const isPaid = depositAmount > 0 && totals.amountReceived >= depositAmount - 0.01
  return isPaid ? pctPrefix : `${pctPrefix} due now`
}

function finalRowLabel(totals: InvoiceTotals): string {
  if (totals.fullPayment) {
    return totals.finalDueDate ? `Full amount due ${formatDate(totals.finalDueDate)}` : "Full amount due now"
  }
  return totals.finalDueDate ? `Final amount due ${formatDate(totals.finalDueDate)}` : "Final amount due now"
}

/** Settings store the payment note as one paragraph; the Terms list gives each sentence a bullet. */
function sentences(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

// Layout, in points, from the designer's invoice template (A4). The page's side padding puts the
// Swirl box edge-to-edge; the sections outside the box are inset to the template's own margins.
const PADDING: PagePadding = { top: PAGE_TOP, left: 30.4, right: 30.1 }
/** Left inset of the meta strip, and of everything inside the box. */
const META_INSET = 20.3
const BOX_INSET = 24.3
/** The table/totals column the template draws outside the box (x 36.4 → 535). */
const SECTION_LEFT = 6
const SECTION_RIGHT = 30.2
/** Box columns: labels at 54.7 / 322.3, values at 155.1 / 377.7. */
const BOX_LEFT_LABEL = 100.4
const BOX_RIGHT_COLUMN = 267.6
const BOX_RIGHT_LABEL = 55.4
/** 8pt rows sit on a 10.65pt pitch, as the template sets them. */
const SMALL_LINE = 10.65 / 8

const styles = StyleSheet.create({
  page: {
    ...REGULAR,
    fontSize: 10,
    color: DESIGN_COLORS.ink,
    backgroundColor: DESIGN_COLORS.page,
    paddingTop: PADDING.top,
    paddingLeft: PADDING.left,
    paddingRight: PADDING.right,
    paddingBottom: PAGE_BOTTOM,
  },

  meta: {
    marginTop: 9.8,
    marginLeft: META_INSET,
    flexDirection: "row",
  },
  // Status/Consultant labels sit at x 318.3 (4pt left of the box's right column).
  metaColumn: {
    width: BOX_RIGHT_COLUMN,
  },
  metaRow: {
    flexDirection: "row",
    marginBottom: 1.65,
  },
  metaLabel: { ...BOLD, fontSize: 10, width: 72.6 },
  metaLabelRight: { ...BOLD, fontSize: 10, width: 66.6 },
  metaValue: { fontSize: 10, flex: 1 },

  box: {
    marginTop: 6.6,
    backgroundColor: DESIGN_COLORS.box,
    borderRadius: BOX_RADIUS,
    paddingTop: 16.6,
    paddingBottom: 12.7,
    paddingLeft: BOX_INSET,
    paddingRight: BOX_INSET,
  },
  boxColumns: {
    flexDirection: "row",
  },
  boxLeftColumn: {
    width: BOX_RIGHT_COLUMN,
    paddingRight: 8,
  },
  boxRightColumn: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
  },
  guestLabel: { ...BOLD, fontSize: 10, width: BOX_LEFT_LABEL },
  guestLabelRight: { ...BOLD, fontSize: 10, width: BOX_RIGHT_LABEL },
  guestValue: { fontSize: 10, flex: 1 },
  smallLabel: { ...BOLD, fontSize: 8, lineHeight: SMALL_LINE, width: BOX_LEFT_LABEL },
  smallLabelRight: { ...BOLD, fontSize: 8, lineHeight: SMALL_LINE, width: BOX_RIGHT_LABEL },
  addressLine: { fontSize: 8, lineHeight: SMALL_LINE },
  smallValue: { fontSize: 8, lineHeight: SMALL_LINE, flex: 1, paddingRight: 6 },
  boxRule: {
    marginTop: 13,
    marginRight: -11.7,
    marginLeft: -0.7,
    borderTopWidth: RULE_WIDTH,
    borderTopColor: DESIGN_COLORS.ink,
  },
  journeyHeading: {
    ...BOLD,
    fontSize: 10,
    marginTop: 7.75,
    marginBottom: 5.75,
    textTransform: "uppercase",
  },

  section: {
    marginLeft: SECTION_LEFT,
    marginRight: SECTION_RIGHT,
  },
  tableHeading: {
    ...BOLD,
    fontSize: 12,
    marginTop: 8.1,
    paddingBottom: 4.7,
    borderBottomWidth: RULE_WIDTH,
    borderBottomColor: DESIGN_COLORS.ink,
  },
  tableBody: {
    paddingTop: 4.4,
    paddingBottom: 5.2,
    borderBottomWidth: RULE_WIDTH,
    borderBottomColor: DESIGN_COLORS.ink,
  },
  tableRow: {
    flexDirection: "row",
    paddingLeft: 1,
  },
  // Date, time and description as three columns. The description keeps the template's x (152.8pt
  // in); the date column fits the longest date ("30 September 2026", 91pt), and the time is
  // centred in the gap a typical date leaves before the description.
  tableDate: { fontSize: 10, width: 96 },
  tableTime: { fontSize: 10, width: 44, marginRight: 12.8, textAlign: "center" },
  tableDescription: { fontSize: 10, flex: 1 },

  totals: {
    marginLeft: 272.7,
    marginRight: SECTION_RIGHT,
  },
  // Rows sit on a 19.3pt pitch (13.65pt line + 5.65pt gap), each group closed by a rule.
  totalsGroup: {
    paddingTop: 9.3,
    paddingBottom: 4.65,
    rowGap: 5.65,
    borderBottomWidth: RULE_WIDTH,
    borderBottomColor: DESIGN_COLORS.ink,
  },
  paymentsGroup: {
    paddingTop: 9,
    paddingBottom: 9.2,
    rowGap: 5.65,
    borderBottomWidth: RULE_WIDTH,
    borderBottomColor: DESIGN_COLORS.ink,
  },
  totalsRow: {
    flexDirection: "row",
    paddingLeft: 6.2,
    paddingRight: 4.9,
  },
  totalsLabel: { fontSize: 10, width: 152 },
  totalsValue: { fontSize: 10, flex: 1, textAlign: "right" },
  outstandingRow: {
    flexDirection: "row",
    paddingLeft: 6.2,
    paddingRight: 4.9,
    paddingTop: 5.9,
    paddingBottom: 9.1,
  },
  closingRule: {
    // Spans x 37.4 → 536 from inside the totals column (which starts at x 303.1).
    marginLeft: SECTION_LEFT + 1 - 272.7,
    marginRight: -1,
    borderTopWidth: RULE_WIDTH,
    borderTopColor: DESIGN_COLORS.ink,
  },

  closing: {
    flexDirection: "row",
    marginLeft: SECTION_LEFT + 1,
    marginRight: SECTION_RIGHT,
  },
  termsColumn: {
    width: 215,
    paddingTop: 6,
  },
  bankColumn: {
    marginLeft: 309.3 - 37.4 - 215,
    flex: 1,
    paddingTop: 4.5,
  },
  closingHeading: { ...BOLD, fontSize: 10 },
  termsList: { marginTop: 2.95 },
  bankList: { marginTop: 5.55 },
  bankLabel: { ...BOLD, fontSize: 8, lineHeight: 10.7 / 8, width: 92.8 },
  bankValue: { fontSize: 8, lineHeight: 10.7 / 8, flex: 1 },
})

const BANKING_ROWS: Array<{ key: keyof BankingSettings; label: string }> = [
  { key: "bank_name", label: "Bank" },
  { key: "bank_account_name", label: "Account holder" },
  { key: "bank_account_number", label: "Account number" },
  { key: "bank_branch_code", label: "Branch code" },
  { key: "bank_swift_code", label: "SWIFT code" },
]

/** The product-name row + days row above every leg's own rows — the two fields that describe the
 *  booking as a whole rather than one direction of it, so they only print once, on the first leg. */
function productRows(departure: InvoiceDeparture): InvoiceDepartureRow[] {
  const rows: InvoiceDepartureRow[] = [
    {
      left: { label: departure.productLabel ?? "Train", value: orDash(departure.trainName) },
      right: { label: "Days", value: orDash(departure.daysLabel) },
    },
  ]
  if (departure.tourName) rows.push({ left: { label: "Tour", value: departure.tourName }, right: null })
  return rows
}

/** A train/hotel leg's own rows already carry a "Suite Type | Qty" or "Room Type | Qty" row (see
 *  suiteRow in service-block-rows.ts) — printing departure.qty again alongside it would duplicate
 *  the same fact under two "Qty:" labels. Every other kind (a tour has no unit-count row of its
 *  own) still needs it. */
function hasOwnUnitCountRow(rows: InvoiceDepartureRow[]): boolean {
  return rows.some((row) => row.left?.label === "Suite Type" || row.left?.label === "Room Type")
}

/** The pax/qty row at the foot of the first leg's rows. */
function paxRows(departure: InvoiceDeparture, legRows: InvoiceDepartureRow[]): InvoiceDepartureRow[] {
  const rows: InvoiceDepartureRow[] = []
  if (!hasOwnUnitCountRow(legRows)) {
    rows.push({ left: { label: "Qty", value: orDash(departure.qty) }, right: null })
  }
  rows.push({
    left: { label: "Adults", value: orDash(departure.adults) },
    right: { label: "Children", value: orDash(departure.children) },
  })
  return rows
}

/** The design writes the count label in capitals ("QTY:") and every other label as typed. */
function journeyLabel(label: string): string {
  return withColon(label.toLowerCase() === "qty" ? "QTY" : label)
}

function DepartureLegBlock({
  departure,
  leg,
  isFirst,
}: {
  departure: InvoiceDeparture
  leg: InvoiceDepartureLeg
  isFirst: boolean
}) {
  const rows = [
    ...(isFirst ? productRows(departure) : []),
    ...leg.rows,
    ...(isFirst ? paxRows(departure, leg.rows) : []),
  ]
  return (
    <View wrap={false}>
      <Text style={styles.journeyHeading}>{withColon(leg.heading)}</Text>
      {rows.map((row, index) => (
        <View key={index} style={styles.row}>
          <View style={[styles.row, styles.boxLeftColumn]}>
            <Text style={styles.smallLabel}>{row.left ? journeyLabel(row.left.label) : ""}</Text>
            <Text style={styles.smallValue}>{row.left?.value ?? ""}</Text>
          </View>
          <View style={[styles.row, styles.boxRightColumn]}>
            <Text style={styles.smallLabelRight}>{row.right ? journeyLabel(row.right.label) : ""}</Text>
            <Text style={styles.smallValue}>{row.right?.value ?? ""}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

function SmallRow({ label, value, right = false }: { label: string; value: string; right?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={right ? styles.smallLabelRight : styles.smallLabel}>{withColon(label)}</Text>
      <Text style={styles.smallValue}>{value}</Text>
    </View>
  )
}

function TotalsRow({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.totalsRow}>
      <Text style={bold ? [styles.totalsLabel, BOLD] : styles.totalsLabel}>{label}</Text>
      <Text style={styles.totalsValue}>{value}</Text>
    </View>
  )
}

export function InvoiceDocument({
  invoiceNumber,
  customerName,
  issueDate,
  consultant,
  guestNames,
  billing,
  departure,
  items,
  totals,
  currency = "ZAR",
  statusLabel = "Provisional",
  banking,
  paymentNote,
  bankChargesNote,
  brand,
  brandPosition = "top",
  brandLogo = null,
}: InvoicePdfData) {
  registerDocumentFonts()

  const resolvedBrand: DocumentBrand = brand ?? {
    heading: FOOTER_BRAND_PRODUCT_LINE,
    subheading: FOOTER_BRAND_DIVISION_LINE,
    logoUrl: null,
  }
  const showBrand = brandPosition !== "hidden"

  const bankingRows = BANKING_ROWS.filter(({ key }) => banking[key])
  const guests = guestRows(guestNames, customerName)
  const addressLines = billing?.addressLines?.filter((line) => line.trim()) ?? []
  const layout = billingLayout(guests.length, addressLines.length)
  const companyLeft = layout !== "address-alone"
  const contactsLeft = layout === "standard"

  const money = (value: number) => formatMoney(value, currency)
  const hasAgentCommission = Boolean(totals.agentCommission)
  const hasVisibleDiscount = (totals.discountVisible ?? true) && Boolean(totals.discount)
  const hasDeduction = hasAgentCommission || hasVisibleDiscount
  const hasDeposit = totals.depositAmount !== null && totals.depositAmount !== undefined

  const terms = [
    bankChargesNote?.trim() ?? "",
    `Please use reference ${invoiceNumber} when making payment.`,
    ...sentences(paymentNote),
  ].filter(Boolean)

  const footerLines = buildDocumentFooterLines(footerCompanyFromBanking(banking))

  return (
    <Document
      author="Luxus Travel & Tours"
      subject={`Invoice ${invoiceNumber}`}
      title={`Invoice ${invoiceNumber} — ${customerName}`}
    >
      <Page size="A4" style={styles.page}>
        <PageBackground />
        {showBrand ? (
          <DocumentHeader brand={resolvedBrand} logo={brandLogo} padding={PADDING} />
        ) : (
          <View style={{ marginTop: -PADDING.top, height: 80 }} />
        )}

        <View style={styles.meta}>
          <View style={styles.metaColumn}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Invoice No:</Text>
              <Text style={styles.metaValue}>{invoiceNumber}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Invoice date:</Text>
              <Text style={styles.metaValue}>{formatDate(issueDate)}</Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabelRight}>Status:</Text>
              <Text style={styles.metaValue}>{statusLabel}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabelRight}>Consultant:</Text>
              <Text style={styles.metaValue}>{orDash(consultant)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.box}>
          {/* Guests two to a row across the box's columns — Guest 1 | Guest 2, Guest 3 | Guest 4, … —
              each pair its own row, so a name that wraps carries its partner down with it and the
              billing rows below always start level. However many travellers the booking holds, the
              rows just grow, and the box with them. */}
          {guests.map(([left, right], index) => (
            <View key={index} style={styles.row}>
              <View style={[styles.row, styles.boxLeftColumn]}>
                <Text style={styles.guestLabel}>{left.label}</Text>
                <Text style={styles.guestValue}>{left.name}</Text>
              </View>
              <View style={[styles.row, styles.boxRightColumn]}>
                {right ? (
                  <>
                    <Text style={styles.guestLabelRight}>{right.label}</Text>
                    <Text style={styles.guestValue}>{right.name}</Text>
                  </>
                ) : null}
              </View>
            </View>
          ))}
          <View style={styles.boxColumns}>
            <View style={styles.boxLeftColumn}>
              {companyLeft ? <SmallRow label="Company" value={orDash(billing?.companyName)} /> : null}
              {/* No gap past one guest row, so each Address line sits on a right-hand row's baseline. */}
              <View style={[styles.row, { marginTop: layout === "standard" ? 1.4 : 0 }]}>
                <Text style={styles.smallLabel}>Address:</Text>
                {/* Column of lines with no flex on the children, so the stack grows to every line
                    instead of sharing one line's height and painting over the Phone row. */}
                <View style={{ flex: 1, minWidth: 0 }}>
                  {(addressLines.length > 0 ? addressLines : [EMPTY]).map((line, index) => (
                    <Text key={index} style={styles.addressLine}>
                      {line}
                    </Text>
                  ))}
                </View>
              </View>
              {contactsLeft ? (
                <>
                  <SmallRow label="Phone" value={orDash(billing?.phone)} />
                  <SmallRow label="E-mail" value={orDash(billing?.email)} />
                </>
              ) : null}
            </View>
            <View style={styles.boxRightColumn}>
              {companyLeft ? null : <SmallRow label="Company" value={orDash(billing?.companyName)} right />}
              <SmallRow label="VAT" value={orDash(billing?.vatNumber)} right />
              {contactsLeft ? null : (
                <>
                  <SmallRow label="Phone" value={orDash(billing?.phone)} right />
                  <SmallRow label="E-mail" value={orDash(billing?.email)} right />
                </>
              )}
            </View>
          </View>

          {departure && departure.legs.length > 0 ? (
            <>
              <View style={styles.boxRule} />
              {departure.legs.map((leg, index) => (
                <DepartureLegBlock key={index} departure={departure} leg={leg} isFirst={index === 0} />
              ))}
            </>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.tableHeading} minPresenceAhead={30}>
            Travel Package Description
          </Text>
          <View style={styles.tableBody}>
            {items.map((item, index) => (
              <View key={index} style={styles.tableRow} wrap={false}>
                <Text style={styles.tableDate}>{formatInvoiceItemDate(item.date)}</Text>
                <Text style={styles.tableTime}>{formatInvoiceItemTime(item.date, item.time)}</Text>
                <Text style={styles.tableDescription}>{item.description}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* VAT-inclusive amounts only — the sales team's invoices never break out VAT. */}
        <View style={styles.totals} wrap={false}>
          <View style={styles.totalsGroup}>
            {/* The per-person rows head the ladder, above the Sub Total / Total incl. VAT rows. */}
            {totals.perAdult != null ? (
              <TotalsRow label={withColon("Total per Adult")} value={money(totals.perAdult)} />
            ) : null}
            {totals.perChild != null ? (
              <TotalsRow label={withColon("Total per Child")} value={money(totals.perChild)} />
            ) : null}
            {hasDeduction ? (
              <TotalsRow label="Sub Total incl. VAT:" value={money(totals.subtotalInclVat)} bold />
            ) : null}
            {hasAgentCommission ? (
              <TotalsRow
                label={withColon(AGENT_COMMISSION_LABEL)}
                value={formatAgentCommission(totals.agentCommission ?? 0, money)}
              />
            ) : null}
            {hasVisibleDiscount ? (
              <TotalsRow label={withColon(DISCOUNT_LABEL)} value={formatDiscount(totals.discount ?? 0, money)} />
            ) : null}
            <TotalsRow label="Total incl. VAT:" value={money(printedTotalInclVat(totals))} bold />
          </View>
          <View style={styles.paymentsGroup}>
            {hasDeposit ? (
              <TotalsRow label={depositRowLabel(totals)} value={money(totals.depositAmount ?? 0)} />
            ) : null}
            <TotalsRow label={finalRowLabel(totals)} value={money(totals.finalAmount)} />
            {/* No payment date — a received payment just reads "thank you". */}
            <TotalsRow
              label={totals.amountReceivedAt ? "Amount received, thank you" : "Amount received"}
              value={money(totals.amountReceived)}
            />
          </View>
          <View style={styles.outstandingRow}>
            <Text style={[styles.totalsLabel, BOLD]}>OUTSTANDING AMOUNT:</Text>
            <Text style={styles.totalsValue}>{money(totals.outstanding)}</Text>
          </View>
          {/* Full-width rule closing the money section — kept with the totals so it never opens a page. */}
          <View style={styles.closingRule} />
        </View>

        <View wrap={false}>
          <View style={styles.closing}>
            <View style={styles.termsColumn}>
              <Text style={styles.closingHeading}>Terms and Conditions:</Text>
              <View style={styles.termsList}>
                {terms.map((term, index) => (
                  <BulletRow key={index} text={term} bulletLeft={3.4} textLeft={13.6} />
                ))}
              </View>
            </View>
            {bankingRows.length > 0 ? (
              <View style={styles.bankColumn}>
                <Text style={styles.closingHeading}>Bank Details for EFT:</Text>
                <View style={styles.bankList}>
                  {bankingRows.map(({ key, label }) => (
                    <View key={key} style={styles.row}>
                      <Text style={styles.bankLabel}>{withColon(label)}</Text>
                      <Text style={styles.bankValue}>{banking[key]}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        </View>

        <DocumentFooter lines={footerLines} />
      </Page>
    </Document>
  )
}
