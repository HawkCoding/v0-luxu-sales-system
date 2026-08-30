import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"
import {
  FOOTER_BRAND_DIVISION_LINE,
  FOOTER_BRAND_PRODUCT_LINE,
} from "@/lib/assets/footer-brand"
import { formatDisplayDate } from "@/lib/date-format"
import { formatMoney } from "@/lib/money"
import { BrandBlock } from "@/lib/pdf/brand-block"
import type { BrandLogoImage } from "@/lib/pdf/brand-logo"
import { registerDocumentFonts } from "@/lib/pdf/document-fonts"
import {
  AGENT_COMMISSION_COLOR,
  AGENT_COMMISSION_LABEL,
  formatAgentCommission,
} from "@/lib/quotes/quote-presentation"
import type { BankingSettings, BrandBlockPosition, DocumentBrand } from "@/lib/settings-access"

/** The invoice recipient. A full tax invoice must name and address them. */
export interface InvoiceBillingParty {
  companyName?: string | null
  /** Street/suburb lines, already ordered for display. Empty renders no address rows. */
  addressLines?: string[]
  postalCode?: string | null
  phone?: string | null
  email?: string | null
  vatNumber?: string | null
}

/** One direction of travel — a round trip renders one block per leg. */
export interface InvoiceDepartureLeg {
  route: string | null
  departureDate?: string | null
  departureTime?: string | null
  arrivalDate?: string | null
  arrivalTime?: string | null
  suite?: string | null
}

export interface InvoiceDeparture {
  heading: string
  /** Train / product name, e.g. "The Blue Train". */
  trainName?: string | null
  /** Tour or package name, e.g. "Pretoria Journey". */
  tourName?: string | null
  /** e.g. "2 Nights / 3 Days". */
  daysLabel?: string | null
  /** Number of suites booked. */
  qty?: string | null
  adults?: string | null
  children?: string | null
  outbound: InvoiceDepartureLeg
  /** Present for round trips; rendered as a second journey block. */
  returnLeg?: InvoiceDepartureLeg | null
}

export interface InvoiceItem {
  pax: number
  description: string
  unitPrice: number
  total: number
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
  depositPercentage?: number | null
  depositAmount?: number | null
  finalAmount: number
  finalDueDate?: string | null
  amountReceived: number
  amountReceivedAt?: string | null
  outstanding: number
  /** True when the client owes the full amount in one payment (no deposit split). */
  fullPayment?: boolean
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
  footerText?: string
  paymentNote?: string
  bankChargesNote?: string
  /** SARAIL brand block copy + logo. Omitted falls back to the fixed constants. */
  brand?: DocumentBrand
  brandPosition?: BrandBlockPosition
  brandLogo?: BrandLogoImage | null
}


function formatDate(value: string | null | undefined): string {
  return formatDisplayDate(value?.slice(0, 10)) || "To be confirmed"
}

/** Empty cells print as an em dash so a blank never reads as missing data. */
const EMPTY = "–"

function orDash(value: string | null | undefined): string {
  return value?.trim() || EMPTY
}

function legDate(value: string | null | undefined): string {
  if (!value) return EMPTY
  return formatDisplayDate(value.slice(0, 10)) || EMPTY
}

/**
 * "25% Deposit due now" reads as a fresh demand once the deposit has actually
 * been paid — swap to a receipted label instead. A cent of rounding slack
 * covers float drift between the stored deposit amount and payments received.
 */
function depositRowLabel(totals: InvoiceTotals): string {
  const pctPrefix = totals.depositPercentage ? `${totals.depositPercentage}% Deposit` : "Deposit"
  const depositAmount = totals.depositAmount ?? 0
  const isPaid = depositAmount > 0 && totals.amountReceived >= depositAmount - 0.01
  return isPaid ? `${pctPrefix} — received` : `${pctPrefix} due now`
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Montserrat",
    fontSize: 9,
    paddingTop: 32,
    paddingBottom: 36,
    paddingHorizontal: 36,
    color: "#312b24",
    backgroundColor: "#ffffff",
  },

  // Header: seal left, brand lines centre, invoice identity right.
  header: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "#8b5a2b",
    paddingBottom: 10,
    marginBottom: 12,
  },
  headerSeal: {
    width: 58,
    height: 58,
    objectFit: "contain",
    marginRight: 12,
  },
  headerBrand: {
    flex: 1,
    alignItems: "center",
  },
  headerDivision: {
    fontSize: 13,
    fontFamily: "Montserrat",
    fontWeight: 700,
    color: "#172018",
  },
  headerProduct: {
    fontSize: 7.5,
    color: "#8a7f74",
    letterSpacing: 0.6,
    marginTop: 3,
  },
  headerMeta: {
    width: 168,
  },
  headerMetaRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 2,
  },
  headerMetaLabel: {
    fontSize: 8,
    fontFamily: "Montserrat",
    fontWeight: 700,
    color: "#6f675d",
    textAlign: "right",
    marginRight: 8,
  },
  headerMetaValue: {
    fontSize: 8,
    color: "#312b24",
    width: 74,
    textAlign: "right",
  },

  // Guest + billing identity.
  guestRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  // Narrower centered column for guest identity + journey details, distinct
  // from the full-width billing grid below it.
  centeredBlock: {
    width: 400,
    alignSelf: "center",
  },
  guestLabel: {
    fontSize: 10,
    fontFamily: "Montserrat",
    fontWeight: 700,
    color: "#172018",
    width: 62,
  },
  guestValue: {
    fontSize: 10,
    color: "#312b24",
    flex: 1,
  },
  billingGrid: {
    flexDirection: "row",
    marginBottom: 14,
  },
  billingColumn: {
    flex: 1,
    paddingRight: 12,
  },
  billingRow: {
    flexDirection: "row",
    marginBottom: 2,
  },
  // Address is the only multi-line value: keep the label pinned to the first
  // line instead of stretching alongside a tall stack.
  billingRowTop: {
    flexDirection: "row",
    marginBottom: 2,
    alignItems: "flex-start",
  },
  billingLabel: {
    fontSize: 8.5,
    color: "#8a7f74",
    width: 62,
  },
  billingValue: {
    fontSize: 8.5,
    color: "#312b24",
    flex: 1,
  },
  // Container for stacked address lines. Column layout with no flex on the
  // children, so the box grows to the natural height of every line; `flex: 1`
  // on the children would make them share one line's worth of space and paint
  // over the rows below. `minWidth: 0` lets a long street line soft-wrap.
  billingValueStack: {
    flex: 1,
    minWidth: 0,
  },
  billingLine: {
    fontSize: 8.5,
    color: "#312b24",
  },

  // Departure information: paired label/value columns (left + right), mirroring
  // the sales team's layout (Train | Days, Departure | Time, …).
  sectionHeading: {
    fontSize: 10.5,
    fontFamily: "Montserrat",
    fontWeight: 700,
    color: "#172018",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    textAlign: "center",
    marginBottom: 7,
  },
  departureRow: {
    flexDirection: "row",
    marginBottom: 2.5,
  },
  departureLabel: {
    fontSize: 8.5,
    fontFamily: "Montserrat",
    fontWeight: 700,
    color: "#6f675d",
    width: 88,
    textAlign: "right",
    marginRight: 10,
  },
  departureValue: {
    fontSize: 8.5,
    color: "#312b24",
    flex: 1,
  },

  // Line-item table.
  table: {
    marginTop: 14,
  },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#8b5a2b",
    paddingBottom: 4,
    marginBottom: 3,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eee6dc",
    paddingVertical: 5,
  },
  colDesc: { flex: 1, fontSize: 8.5, paddingRight: 8 },
  headText: {
    fontSize: 8.5,
    fontFamily: "Montserrat",
    fontWeight: 700,
    color: "#172018",
  },

  // Totals ladder right-aligned; banking details full-width beneath it.
  paymentSplit: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 18,
  },
  bankingBox: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e8dfd2",
    paddingTop: 10,
  },
  bankingTitle: {
    fontSize: 9,
    fontFamily: "Montserrat",
    fontWeight: 700,
    color: "#172018",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 5,
  },
  bankingLine: {
    flexDirection: "row",
    marginBottom: 2,
  },
  bankingLabel: {
    fontSize: 8,
    color: "#8a7f74",
    width: 84,
  },
  bankingValue: {
    fontSize: 8,
    color: "#312b24",
    flex: 1,
  },
  referenceLine: {
    fontSize: 9,
    fontFamily: "Montserrat",
    fontWeight: 700,
    color: "#172018",
    textAlign: "left",
    marginTop: 8,
    letterSpacing: 0.3,
  },
  totalsBox: {
    width: 250,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2.5,
  },
  totalsLabel: {
    fontSize: 8.5,
    color: "#6f675d",
    flex: 1,
    textAlign: "right",
    marginRight: 10,
  },
  totalsValue: {
    fontSize: 8.5,
    color: "#312b24",
    width: 84,
    textAlign: "right",
  },
  totalsDivider: {
    borderTopWidth: 1,
    borderTopColor: "#d8cdbc",
    marginVertical: 3,
  },
  outstandingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#172018",
    paddingVertical: 6,
    paddingHorizontal: 7,
    marginTop: 3,
  },
  outstandingLabel: {
    fontSize: 9,
    fontFamily: "Montserrat",
    fontWeight: 700,
    color: "#f6f2ea",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    flex: 1,
    textAlign: "right",
    marginRight: 10,
  },
  outstandingValue: {
    fontSize: 11,
    fontFamily: "Montserrat",
    fontWeight: 700,
    color: "#ffffff",
    width: 84,
    textAlign: "right",
  },
  bankChargesNote: {
    fontSize: 7,
    color: "#a3564b",
    textAlign: "right",
    marginTop: 5,
    lineHeight: 1.4,
  },

  paymentNote: {
    marginTop: 16,
    fontSize: 9,
    fontFamily: "Montserrat",
    fontWeight: 700,
    color: "#172018",
    textAlign: "center",
    lineHeight: 1.4,
  },
  footer: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#e8dfd2",
    paddingTop: 8,
    fontSize: 7,
    color: "#8a7f74",
    textAlign: "center",
    lineHeight: 1.5,
  },
})

const BANKING_ROWS: Array<{ key: keyof BankingSettings; label: string }> = [
  { key: "bank_name", label: "Bank" },
  { key: "bank_account_name", label: "Account holder" },
  { key: "bank_account_number", label: "Account number" },
  { key: "bank_branch_code", label: "Branch code" },
  { key: "bank_swift_code", label: "SWIFT code" },
]

interface DepartureCell {
  label: string
  value: string
}

interface DeparturePair {
  left: DepartureCell | null
  right: DepartureCell | null
}

/** Rows for one journey leg: left label/value column + right label/value column. */
function legPairs(departure: InvoiceDeparture, leg: InvoiceDepartureLeg): DeparturePair[] {
  const pairs: DeparturePair[] = [
    {
      left: { label: "Train", value: orDash(departure.trainName) },
      right: { label: "Days", value: orDash(departure.daysLabel) },
    },
    departure.tourName
      ? { left: { label: "Tour", value: departure.tourName }, right: null }
      : { left: null, right: null },
    { left: { label: "Route", value: orDash(leg.route) }, right: null },
    {
      left: { label: "Departure", value: legDate(leg.departureDate) },
      right: { label: "Time", value: orDash(leg.departureTime) },
    },
    {
      left: { label: "Arrival", value: legDate(leg.arrivalDate) },
      right: { label: "Time", value: orDash(leg.arrivalTime) },
    },
    {
      left: { label: "Suite Type", value: orDash(leg.suite) },
      right: { label: "Qty", value: orDash(departure.qty) },
    },
    {
      left: { label: "Adults", value: orDash(departure.adults) },
      right: { label: "Children", value: orDash(departure.children) },
    },
  ]
  return pairs.filter((pair) => pair.left !== null || pair.right !== null)
}

function DepartureLegBlock({
  departure,
  leg,
  heading,
}: {
  departure: InvoiceDeparture
  leg: InvoiceDepartureLeg
  heading: string
}) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={styles.sectionHeading}>{heading}</Text>
      {legPairs(departure, leg).map((pair, index) => (
        <View key={index} style={styles.departureRow}>
          <Text style={styles.departureLabel}>{pair.left ? `${pair.left.label}:` : ""}</Text>
          <Text style={styles.departureValue}>{pair.left?.value ?? ""}</Text>
          <Text style={styles.departureLabel}>{pair.right ? `${pair.right.label}:` : ""}</Text>
          <Text style={styles.departureValue}>{pair.right?.value ?? ""}</Text>
        </View>
      ))}
    </View>
  )
}

function DepartureBlock({ departure }: { departure: InvoiceDeparture }) {
  return (
    <View>
      <DepartureLegBlock departure={departure} leg={departure.outbound} heading={departure.heading} />
      {departure.returnLeg ? (
        <DepartureLegBlock
          departure={departure}
          leg={departure.returnLeg}
          heading="Return Journey"
        />
      ) : null}
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
  footerText = "Luxus Travel & Tours — Luxury Rail Journeys",
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
  const showBrandTop = brandPosition === "top"
  const showBrandBottom = brandPosition === "bottom"

  const bankingRows = BANKING_ROWS.filter(({ key }) => banking[key])
  const reference = invoiceNumber
  const guests = (guestNames ?? []).map((name) => name.trim()).filter(Boolean)
  const guest1 = guests[0] ?? customerName ?? "Valued Guest"
  const guest2 = guests[1] ?? null
  const extraGuests = guests.slice(2)

  const addressLines = billing?.addressLines?.filter((line) => line.trim()) ?? []

  // Supplier identity lines a full tax invoice must carry, plus the contact
  // channels the sales team's own footer prints. Unset settings drop out.
  const contactLine = [
    banking.company_tel ? `Tel: ${banking.company_tel}` : "",
    banking.company_cell ? `Cell: ${banking.company_cell}` : "",
  ]
    .filter(Boolean)
    .join("  •  ")

  const webLine = [
    banking.company_email ? `E-mail: ${banking.company_email}` : "",
    banking.company_website ? `Web: ${banking.company_website}` : "",
  ]
    .filter(Boolean)
    .join("  •  ")

  const registrationLine = [
    banking.company_reg_number ? `Company Registration ${banking.company_reg_number}` : "",
    banking.company_vat_number ? `VAT number ${banking.company_vat_number}` : "",
  ]
    .filter(Boolean)
    .join("  •  ")

  const footerLines = [
    footerText,
    banking.company_address,
    contactLine,
    webLine,
    registrationLine,
  ].filter(Boolean)

  return (
    <Document
      author="Luxus Travel & Tours"
      subject={`Invoice ${invoiceNumber}`}
      title={`Invoice ${invoiceNumber} — ${customerName}`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {showBrandTop ? (
            <>
              {brandLogo ? <Image src={brandLogo} style={styles.headerSeal} /> : null}
              <View style={styles.headerBrand}>
                <Text style={styles.headerDivision}>{resolvedBrand.heading}</Text>
                <Text style={styles.headerProduct}>{resolvedBrand.subheading}</Text>
              </View>
            </>
          ) : (
            // Empty flex:1 spacer keeps the meta box right-aligned when the brand
            // block has been moved to the bottom (or hidden).
            <View style={styles.headerBrand} />
          )}
          <View style={styles.headerMeta}>
            <View style={styles.headerMetaRow}>
              <Text style={styles.headerMetaLabel}>Invoice No.</Text>
              <Text style={styles.headerMetaValue}>{invoiceNumber}</Text>
            </View>
            <View style={styles.headerMetaRow}>
              <Text style={styles.headerMetaLabel}>Status</Text>
              <Text style={styles.headerMetaValue}>{statusLabel}</Text>
            </View>
            <View style={styles.headerMetaRow}>
              <Text style={styles.headerMetaLabel}>Invoice date</Text>
              <Text style={styles.headerMetaValue}>{formatDate(issueDate)}</Text>
            </View>
            <View style={styles.headerMetaRow}>
              <Text style={styles.headerMetaLabel}>Consultant</Text>
              <Text style={styles.headerMetaValue}>{orDash(consultant)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.centeredBlock}>
          <View style={styles.guestRow}>
            <Text style={styles.guestLabel}>Guest 1</Text>
            <Text style={styles.guestValue}>{guest1}</Text>
            <Text style={styles.guestLabel}>Guest 2</Text>
            <Text style={styles.guestValue}>{guest2 ?? EMPTY}</Text>
          </View>
          {extraGuests.length > 0 ? (
            <View style={styles.guestRow}>
              <Text style={styles.guestLabel}>Guests</Text>
              <Text style={styles.guestValue}>{extraGuests.join(", ")}</Text>
            </View>
          ) : null}
          <View style={styles.billingGrid}>
          <View style={styles.billingColumn}>
            <View style={styles.billingRow}>
              <Text style={styles.billingLabel}>Company</Text>
              <Text style={styles.billingValue}>{orDash(billing?.companyName)}</Text>
            </View>
            <View style={styles.billingRowTop}>
              <Text style={styles.billingLabel}>Address</Text>
              <View style={styles.billingValueStack}>
                {addressLines.length > 0 ? (
                  addressLines.map((line, index) => (
                    <Text key={index} style={styles.billingLine}>
                      {line}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.billingLine}>{EMPTY}</Text>
                )}
              </View>
            </View>
            <View style={styles.billingRow}>
              <Text style={styles.billingLabel}>Phone</Text>
              <Text style={styles.billingValue}>{orDash(billing?.phone)}</Text>
            </View>
            <View style={styles.billingRow}>
              <Text style={styles.billingLabel}>E-mail</Text>
              <Text style={styles.billingValue}>{orDash(billing?.email)}</Text>
            </View>
          </View>
          <View style={styles.billingColumn}>
            <View style={styles.billingRow}>
              <Text style={styles.billingLabel}>VAT</Text>
              <Text style={styles.billingValue}>{orDash(billing?.vatNumber)}</Text>
            </View>
            <View style={styles.billingRow}>
              <Text style={styles.billingLabel}>Code</Text>
              <Text style={styles.billingValue}>{orDash(billing?.postalCode)}</Text>
            </View>
          </View>
          </View>
        </View>

        {departure ? (
          <View style={styles.centeredBlock}>
            <DepartureBlock departure={departure} />
          </View>
        ) : null}

        <View style={styles.table}>
          <View style={styles.tableHead}>
            <Text style={[styles.colDesc, styles.headText]}>Travel Package Description</Text>
          </View>
          {items.map((item, index) => (
            <View key={index} style={styles.tableRow} wrap={false}>
              <Text style={styles.colDesc}>{item.description}</Text>
            </View>
          ))}
        </View>

        <View style={styles.paymentSplit}>
          <View style={styles.totalsBox}>
            {/* VAT-inclusive amounts only — the sales team's invoices never break out VAT. */}
            <View style={styles.totalsRow}>
              <Text style={[styles.totalsLabel, { fontFamily: "Montserrat", fontWeight: 700 }]}>
                Subtotal incl. VAT
              </Text>
              <Text style={[styles.totalsValue, { fontFamily: "Montserrat", fontWeight: 700 }]}>
                {formatMoney(totals.subtotalInclVat, currency)}
              </Text>
            </View>
            {totals.agentCommission ? (
              <>
                <View style={styles.totalsRow}>
                  <Text
                    style={[styles.totalsLabel, { fontFamily: "Montserrat", fontWeight: 700, color: AGENT_COMMISSION_COLOR }]}
                  >
                    {AGENT_COMMISSION_LABEL}
                  </Text>
                  <Text
                    style={[styles.totalsValue, { fontFamily: "Montserrat", fontWeight: 700, color: AGENT_COMMISSION_COLOR }]}
                  >
                    {formatAgentCommission(totals.agentCommission, (v) => formatMoney(v, currency))}
                  </Text>
                </View>
                <View style={styles.totalsRow}>
                  <Text style={[styles.totalsLabel, { fontFamily: "Montserrat", fontWeight: 700 }]}>
                    Total incl. VAT
                  </Text>
                  <Text style={[styles.totalsValue, { fontFamily: "Montserrat", fontWeight: 700 }]}>
                    {formatMoney(totals.totalInclVat ?? totals.subtotalInclVat, currency)}
                  </Text>
                </View>
              </>
            ) : null}
            <View style={styles.totalsDivider} />
            {totals.depositAmount !== null && totals.depositAmount !== undefined ? (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>{depositRowLabel(totals)}</Text>
                <Text style={styles.totalsValue}>{formatMoney(totals.depositAmount, currency)}</Text>
              </View>
            ) : null}
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>
                {totals.fullPayment
                  ? totals.finalDueDate
                    ? `Full amount due ${formatDate(totals.finalDueDate)}`
                    : "Full amount due now"
                  : totals.finalDueDate
                    ? `Final amount due ${formatDate(totals.finalDueDate)}`
                    : "Final amount due now"}
              </Text>
              <Text style={styles.totalsValue}>{formatMoney(totals.finalAmount, currency)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>
                {totals.amountReceivedAt
                  ? `Amount received, thank you ${formatDate(totals.amountReceivedAt)}`
                  : "Amount received"}
              </Text>
              <Text style={styles.totalsValue}>{formatMoney(totals.amountReceived, currency)}</Text>
            </View>
            <View style={styles.outstandingRow}>
              <Text style={styles.outstandingLabel}>Outstanding amount</Text>
              <Text style={styles.outstandingValue}>
                {formatMoney(totals.outstanding, currency)}
              </Text>
            </View>
            {bankChargesNote ? (
              <Text style={styles.bankChargesNote}>{bankChargesNote}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.bankingBox}>
          <Text style={styles.bankingTitle}>Bank details for electronic payments</Text>
          {bankingRows.map(({ key, label }) => (
            <View key={key} style={styles.bankingLine}>
              <Text style={styles.bankingLabel}>{label}</Text>
              <Text style={styles.bankingValue}>{banking[key]}</Text>
            </View>
          ))}
          <Text style={styles.referenceLine}>
            PLEASE USE REFERENCE  {reference}  WHEN MAKING PAYMENT
          </Text>
        </View>

        {paymentNote ? <Text style={styles.paymentNote}>{paymentNote}</Text> : null}

        <View style={styles.footer}>
          {footerLines.map((line, index) => (
            <Text key={index}>{line}</Text>
          ))}
        </View>

        {showBrandBottom ? (
          <BrandBlock brand={resolvedBrand} logoImage={brandLogo} placement="bottom" />
        ) : null}
      </Page>
    </Document>
  )
}
