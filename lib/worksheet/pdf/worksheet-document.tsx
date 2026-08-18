import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"
import { formatDisplayDate } from "@/lib/date-format"
import { formatMoney } from "@/lib/money"
import { registerDocumentFonts } from "@/lib/pdf/document-fonts"
import type { BrandLogoImage } from "@/lib/pdf/brand-logo"

/** One row of the pax grid. Room fields are the v2 manual-capture columns - blank until then. */
export interface WorksheetPaxRow {
  title: string | null
  firstName: string
  lastName: string
  nationality: string | null
  age: number | null
  roomWith: string | null
  roomType: string | null
  remarks: string | null
}

/**
 * One booked service. `description` is deliberately nothing but the supplier's name - the
 * worksheet is an internal record, not an itinerary. The admin dates come from the Suppliers tab
 * when it has been filled in; everything financial is left blank for pen.
 */
export interface WorksheetServiceLine {
  fromDate: string | null
  toDate: string | null
  description: string
  bookingDate: string | null
  confirmationDate: string | null
  reservationReference: string | null
  paymentMadeDate: string | null
  paidWith: string | null
  notes: string | null
}

/** One client payment received against the booking's invoices. */
export interface WorksheetPayment {
  date: string | null
  paidWith: string | null
  reference: string | null
  amount: number
}

export interface WorksheetContact {
  title: string | null
  name: string
  /** "J. Smith" - used only in the top strip's tight "Client" cell; every other field on the
   * sheet uses the full `name`. */
  shortName: string
  nationality: string | null
  email: string | null
  phone: string | null
}

export interface WorksheetPdfData {
  bookingNumber: string
  /** The rail operator on this booking - "The Blue Train" / "Rovos Rail" - or null when it has none. */
  serviceName: string | null
  /** Full name of the salesperson assigned to the job; null when nobody is assigned. */
  consultant: string | null
  arriveDate: string | null
  departDate: string | null
  noOfPax: number
  contact: WorksheetContact
  invoiceDate: string | null
  depositPercentage: number | null
  depositDueDate: string | null
  depositPaidAt: string | null
  finalDueDate: string | null
  finalPaidAt: string | null
  /** Derived: booking's invoice_balance is zero. */
  allPaid: boolean
  /** Derived: the voucher/docs have been sent. */
  allSent: boolean
  docsDate: string | null
  docsBy: string | null
  pax: WorksheetPaxRow[]
  serviceLines: WorksheetServiceLine[]
  payments: WorksheetPayment[]
  brandLogo?: BrandLogoImage | null
}

/** Nothing unknown ever prints a placeholder - every blank cell on this sheet is filled in by hand. */
const EMPTY = ""

/** Blank rows appended to the hand-filled tables so there is somewhere to write. */
const FILL_ROW_COUNT = 3

function orBlank(value: string | null | undefined): string {
  return value?.trim() || EMPTY
}

/** formatMoney's thousands separator is a non-breaking space (U+00A0) - the embedded Arimo font
 * this sheet uses crashes fontkit's glyph-metrics lookup on that codepoint, so swap it for a
 * plain space before the amount ever reaches a Text node. Built with fromCharCode rather than a
 * literal character in source, so the codepoint can't get mangled by an editor/encoding round-trip. */
function formatAmount(amount: number): string {
  const nbsp = String.fromCharCode(160)
  return formatMoney(amount).split(nbsp).join(" ")
}

function dateOrBlank(value: string | null | undefined): string {
  if (!value) return EMPTY
  return formatDisplayDate(value.slice(0, 10)) || EMPTY
}

// The base-14 Helvetica font's WinAnsi encoding has no slot for the route arrow characters used
// in train route names, and mangles them into stray punctuation - see lib/pdf/document-fonts.ts.
const styles = StyleSheet.create({
  page: {
    fontFamily: "Arimo",
    fontSize: 7,
    padding: 20,
    color: "#1a1a1a",
    backgroundColor: "#ffffff",
  },

  // Shared grid primitives - every table is a bordered box of bordered rows of
  // bordered cells, mirroring the paper worksheet's cell-by-cell layout.
  box: {
    borderWidth: 0.75,
    borderColor: "#000000",
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
  },
  rowDivider: {
    borderBottomWidth: 0.5,
    borderBottomColor: "#000000",
  },
  // minHeight matters: an empty <Text> collapses to zero height, and most cells on this sheet
  // print empty by design - without it a blank row would draw as a hairline.
  cell: {
    borderRightWidth: 0.5,
    borderRightColor: "#000000",
    paddingVertical: 2,
    paddingHorizontal: 3,
    minHeight: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  cellLast: {
    paddingVertical: 2,
    paddingHorizontal: 3,
    minHeight: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  /** Taller than a data row - these are written into by hand. */
  fillCell: {
    minHeight: 18,
  },
  headCell: {
    backgroundColor: "#e5e5e5",
  },
  headText: {
    fontSize: 6,
    fontFamily: "Arimo",
    fontWeight: 700,
    textAlign: "center",
    textTransform: "uppercase",
  },
  bodyText: {
    fontSize: 7,
    textAlign: "center",
  },
  bold: {
    fontFamily: "Arimo",
    fontWeight: 700,
  },
  sectionGap: {
    marginBottom: 6,
  },
  brandCell: {
    width: 86,
    paddingVertical: 4,
  },
  brandLogoImg: {
    width: 72,
    height: 30,
    objectFit: "contain",
  },
  flagCell: {
    width: 60,
  },
})

interface HeaderCellSpec {
  width?: number
  flex?: number
  label?: string
  value: string
  bold?: boolean
}

function HeaderRow({ cells, last = false }: { cells: HeaderCellSpec[]; last?: boolean }) {
  return (
    <View style={[styles.row, !last ? styles.rowDivider : {}]}>
      {cells.map((c, i) => (
        <View
          key={i}
          style={[
            i === cells.length - 1 ? styles.cellLast : styles.cell,
            c.width ? { width: c.width } : {},
            c.flex ? { flex: c.flex, flexBasis: 0 } : {},
          ]}
        >
          {c.label ? <Text style={styles.headText}>{c.label}</Text> : null}
          <Text style={[styles.bodyText, c.bold ? styles.bold : {}]}>{c.value}</Text>
        </View>
      ))}
    </View>
  )
}

interface Column {
  key: string
  label: string
  width?: number
  flex?: number
  /** Overrides the shared centered body-text alignment for this column only. */
  align?: "left" | "right"
}

// flexBasis: 0 matters here - react-pdf's `flex` prop otherwise defaults to a content-sized basis,
// so a cell holding visible text (e.g. "Totals") claims more of the row than an empty sibling and
// the column boundary drifts row to row. Pinning the basis to zero makes every flex column an
// exact, content-independent proportion of the row, so dividers line up across every row.
function columnStyle(column: Column): { width: number } | { flex: number; flexBasis: number } {
  if (column.width) return { width: column.width }
  return { flex: column.flex ?? 1, flexBasis: 0 }
}

function TableHead({ columns }: { columns: Column[] }) {
  return (
    <View style={[styles.row, styles.rowDivider, styles.headCell]}>
      {columns.map((col, i) => (
        <View
          key={col.key}
          style={[i === columns.length - 1 ? styles.cellLast : styles.cell, columnStyle(col)]}
        >
          <Text style={styles.headText}>{col.label}</Text>
        </View>
      ))}
    </View>
  )
}

function TableRow({
  columns,
  values,
  last = false,
  fill = false,
}: {
  columns: Column[]
  values: string[]
  last?: boolean
  fill?: boolean
}) {
  return (
    <View style={[styles.row, !last ? styles.rowDivider : {}]} wrap={false}>
      {columns.map((col, i) => (
        <View
          key={col.key}
          style={[
            i === columns.length - 1 ? styles.cellLast : styles.cell,
            columnStyle(col),
            fill ? styles.fillCell : {},
          ]}
        >
          <Text style={[styles.bodyText, col.align ? { textAlign: col.align } : {}]}>
            {values[i] ?? EMPTY}
          </Text>
        </View>
      ))}
    </View>
  )
}

/** The written-in part of a hand-finished table. */
function FillRows({ columns, count = FILL_ROW_COUNT }: { columns: Column[]; count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <TableRow key={`fill-${i}`} columns={columns} values={[]} fill last={i === count - 1} />
      ))}
    </>
  )
}

// Widths target the landscape A4 content box: 842pt page - 2x20pt padding = 802pt.
const PAX_COLUMNS: Column[] = [
  { key: "no", label: "No.", width: 20 },
  { key: "first", label: "Name", flex: 1.4, align: "left" },
  { key: "last", label: "Surname", flex: 1.4, align: "left" },
  { key: "title", label: "Title", width: 34 },
  { key: "nat", label: "Nationality", width: 60 },
  { key: "age", label: "Age", width: 28 },
  { key: "roomWith", label: "Room With", width: 75 },
  { key: "roomType", label: "Room Type", width: 60 },
  { key: "remarks", label: "Remarks", flex: 2 },
]

const SERVICE_COLUMNS: Column[] = [
  { key: "from", label: "From Date", width: 52 },
  { key: "to", label: "To Date", width: 52 },
  { key: "desc", label: "Service Description", flex: 2, align: "left" },
  { key: "bookingDate", label: "Booking Date", width: 52 },
  { key: "confirmDate", label: "Confirm. Date", width: 52 },
  { key: "ref", label: "Reservation Reference", width: 80 },
  { key: "paidDate", label: "Payment Made Date", width: 56 },
  { key: "paidWith", label: "Paid With", width: 48 },
  { key: "payable", label: "Amounts Payable", width: 70 },
  { key: "receivable", label: "Amounts Receivable", width: 70 },
  { key: "notes", label: "Notes", flex: 1.5 },
]

const PAYMENT_COLUMNS: Column[] = [
  { key: "date", label: "Payment Made Date", flex: 1 },
  { key: "paidWith", label: "Paid With", flex: 1 },
  { key: "payable", label: "Amounts Payable", flex: 1 },
  { key: "receivable", label: "Amounts Receivable", flex: 1 },
]

export function WorksheetDocument({
  bookingNumber,
  serviceName,
  consultant,
  arriveDate,
  departDate,
  noOfPax,
  contact,
  invoiceDate,
  depositPercentage,
  depositDueDate,
  depositPaidAt,
  finalDueDate,
  finalPaidAt,
  allPaid,
  allSent,
  docsDate,
  docsBy,
  pax,
  serviceLines,
  payments,
  brandLogo = null,
}: WorksheetPdfData) {
  registerDocumentFonts()
  return (
    <Document
      author="Luxus Travel & Tours"
      subject={`Booking Worksheet ${bookingNumber}`}
      title={`Worksheet ${bookingNumber} - ${contact.name}`}
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Row 1: logo + status flags + consultant + client + service + booking number */}
        <View style={[styles.box, styles.sectionGap]}>
          <View style={styles.row}>
            <View style={[styles.cell, styles.brandCell]}>
              {brandLogo ? <Image src={brandLogo} style={styles.brandLogoImg} /> : null}
            </View>
            <View style={[styles.cell, styles.flagCell]}>
              <Text style={styles.headText}>All Paid</Text>
              <Text style={styles.bodyText}>{allPaid ? "YES" : "NO"}</Text>
            </View>
            <View style={[styles.cell, styles.flagCell]}>
              <Text style={styles.headText}>All Sent</Text>
              <Text style={styles.bodyText}>{allSent ? "YES" : "NO"}</Text>
            </View>
            <View style={[styles.cell, { flex: 1 }]}>
              <Text style={styles.headText}>Consultant</Text>
              <Text style={styles.bodyText}>{orBlank(consultant)}</Text>
            </View>
            <View style={[styles.cell, { flex: 1.4 }]}>
              <Text style={styles.headText}>Client</Text>
              <Text style={styles.bodyText}>{orBlank(contact.shortName)}</Text>
            </View>
            <View style={[styles.cell, { flex: 1.2 }]}>
              <Text style={styles.headText}>Service</Text>
              <Text style={[styles.bodyText, styles.bold]}>{orBlank(serviceName)}</Text>
            </View>
            <View style={[styles.cellLast, { width: 110 }]}>
              <Text style={styles.headText}>Booking No.</Text>
              <Text style={[styles.bodyText, styles.bold]}>{bookingNumber}</Text>
            </View>
          </View>
        </View>

        {/* Row 2: contact details */}
        <View style={[styles.box, styles.sectionGap]}>
          <HeaderRow
            last
            cells={[
              {
                label: "Title / Contact Name & Surname",
                value: `${orBlank(contact.title)} ${contact.name}`.trim(),
                flex: 2,
              },
              { label: "Nationality", value: orBlank(contact.nationality), width: 80 },
              { label: "E-mail", value: orBlank(contact.email), flex: 2 },
              { label: "Contact Number", value: orBlank(contact.phone), width: 110 },
            ]}
          />
        </View>

        {/* Row 3: dates & invoice summary */}
        <View style={[styles.box, styles.sectionGap]}>
          <HeaderRow
            last
            cells={[
              { label: "Arrive", value: dateOrBlank(arriveDate), flex: 1 },
              { label: "Depart", value: dateOrBlank(departDate), flex: 1 },
              { label: "No. Pax", value: String(noOfPax), flex: 0.6 },
              { label: "Inv. Date", value: dateOrBlank(invoiceDate), flex: 1 },
              {
                label: "Deposit %",
                value: depositPercentage != null ? `${depositPercentage}%` : EMPTY,
                flex: 0.7,
              },
              { label: "Dep. Due", value: dateOrBlank(depositDueDate), flex: 1 },
              { label: "Paid", value: dateOrBlank(depositPaidAt), flex: 1 },
              { label: "Final Due", value: dateOrBlank(finalDueDate), flex: 1 },
              { label: "Paid", value: dateOrBlank(finalPaidAt), flex: 1 },
              { label: "Docs Date", value: dateOrBlank(docsDate), flex: 1 },
              { label: "Docs By", value: orBlank(docsBy), flex: 1 },
            ]}
          />
        </View>

        {/* Pax grid */}
        <View style={[styles.box, styles.sectionGap]}>
          <TableHead columns={PAX_COLUMNS} />
          {pax.length === 0 ? (
            <TableRow columns={PAX_COLUMNS} values={[]} last />
          ) : (
            pax.map((p, i) => (
              <TableRow
                key={i}
                last={i === pax.length - 1}
                columns={PAX_COLUMNS}
                values={[
                  String(i + 1),
                  p.firstName,
                  p.lastName,
                  p.title ?? EMPTY,
                  p.nationality ?? EMPTY,
                  p.age != null ? String(p.age) : EMPTY,
                  p.roomWith ?? EMPTY,
                  p.roomType ?? EMPTY,
                  p.remarks ?? EMPTY,
                ]}
              />
            ))
          )}
        </View>

        {/* Service lines - every service booked on this job, plus room to add more by hand */}
        <View style={[styles.box, styles.sectionGap]}>
          <TableHead columns={SERVICE_COLUMNS} />
          {serviceLines.map((l, i) => (
            <TableRow
              key={i}
              columns={SERVICE_COLUMNS}
              values={[
                dateOrBlank(l.fromDate),
                dateOrBlank(l.toDate),
                l.description,
                dateOrBlank(l.bookingDate),
                dateOrBlank(l.confirmationDate),
                l.reservationReference ?? EMPTY,
                dateOrBlank(l.paymentMadeDate),
                l.paidWith ?? EMPTY,
                EMPTY,
                EMPTY,
                l.notes ?? EMPTY,
              ]}
            />
          ))}
          <FillRows columns={SERVICE_COLUMNS} />
        </View>

        {/* Client payment information - amounts, totals and gross profit are written in by hand */}
        <View style={[styles.box, styles.sectionGap]}>
          <TableHead columns={PAYMENT_COLUMNS} />
          {payments.map((p, i) => (
            <TableRow
              key={i}
              columns={PAYMENT_COLUMNS}
              values={[
                dateOrBlank(p.date),
                p.reference ? `${p.paidWith ?? ""} (${p.reference})`.trim() : (p.paidWith ?? EMPTY),
                EMPTY,
                formatAmount(p.amount),
              ]}
            />
          ))}
          <FillRows columns={PAYMENT_COLUMNS} />
          <View style={[styles.row, styles.rowDivider, styles.headCell]} wrap={false}>
            <View style={[styles.cell, { flex: 2, flexBasis: 0 }]}>
              <Text style={styles.headText}>Totals</Text>
            </View>
            <View style={[styles.cell, styles.fillCell, { flex: 1, flexBasis: 0 }]}>
              <Text style={[styles.bodyText, { textAlign: "right" }]}>{EMPTY}</Text>
            </View>
            <View style={[styles.cellLast, styles.fillCell, { flex: 1, flexBasis: 0 }]}>
              <Text style={[styles.bodyText, { textAlign: "right" }]}>{EMPTY}</Text>
            </View>
          </View>
          <View style={styles.row} wrap={false}>
            <View style={[styles.cell, { flex: 3, flexBasis: 0 }]}>
              <Text style={styles.headText}>Gross Profit</Text>
            </View>
            <View style={[styles.cellLast, styles.fillCell, { flex: 1, flexBasis: 0 }]}>
              <Text style={[styles.bodyText, { textAlign: "right" }]}>{EMPTY}</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  )
}
