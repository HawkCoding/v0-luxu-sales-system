import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"
import { formatDisplayDate } from "@/lib/date-format"
import { BASE_CURRENCY, formatMoney as formatSharedMoney } from "@/lib/money"
import type { BrandLogoImage } from "@/lib/pdf/brand-logo"
import type { DocumentBrand } from "@/lib/settings-access"

/** One row of the pax grid. Room fields are the v2 manual-capture columns — blank until then. */
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
 * One supplier service line (hotel/rail/transfer booking). The financial
 * columns (booking/confirmation/payment-made dates, paid-with, payable,
 * receivable) are the v2 manual-capture columns on `booking_supplier_schedules`
 * — blank until that ships.
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
  amountPayable: number | null
  amountReceivable: number | null
  notes: string | null
}

/** One client payment received against the booking's invoices. */
export interface WorksheetPayment {
  date: string | null
  paidWith: string | null
  amount: number
  reference: string | null
}

export interface WorksheetContact {
  title: string | null
  name: string
  nationality: string | null
  email: string | null
  phone: string | null
}

export interface WorksheetPdfData {
  bookingNumber: string
  productName: string | null
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
  /** True once any service line carries a real supplier cost (v2). Gates the honesty note on Gross Profit. */
  hasSupplierCosts: boolean
  brand?: DocumentBrand
  brandLogo?: BrandLogoImage | null
}

const EMPTY = "–"

function orDash(value: string | null | undefined): string {
  return value?.trim() || EMPTY
}

function dateOrDash(value: string | null | undefined): string {
  if (!value) return EMPTY
  return formatDisplayDate(value.slice(0, 10)) || EMPTY
}

/** The worksheet is an internal ops document covering payable/receivable across suppliers, so it
 *  stays in the base currency rather than mixing per-supplier ones into one gross-profit figure. */
function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return EMPTY
  return formatSharedMoney(amount, BASE_CURRENCY)
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 7,
    padding: 20,
    color: "#1a1a1a",
    backgroundColor: "#ffffff",
  },

  // Shared grid primitives — every table is a bordered box of bordered rows of
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
  cell: {
    borderRightWidth: 0.5,
    borderRightColor: "#000000",
    paddingVertical: 2,
    paddingHorizontal: 3,
    justifyContent: "center",
  },
  cellLast: {
    paddingVertical: 2,
    paddingHorizontal: 3,
    justifyContent: "center",
  },
  headCell: {
    backgroundColor: "#e5e5e5",
  },
  headText: {
    fontSize: 6,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    textTransform: "uppercase",
  },
  bodyText: {
    fontSize: 7,
  },
  bodyTextCenter: {
    fontSize: 7,
    textAlign: "center",
  },
  bold: {
    fontFamily: "Helvetica-Bold",
  },
  sectionGap: {
    marginBottom: 6,
  },
  brandCell: {
    width: 70,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 3,
  },
  brandLogoImg: {
    width: 30,
    height: 30,
    objectFit: "contain",
    marginBottom: 2,
  },
  brandText: {
    fontSize: 6,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  flagCell: {
    width: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  wideCell: {
    width: 90,
  },
  note: {
    fontSize: 6,
    fontStyle: "italic",
    color: "#555555",
    marginTop: 2,
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
            c.flex ? { flex: c.flex } : {},
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
  align?: "left" | "center"
}

function TableHead({ columns }: { columns: Column[] }) {
  return (
    <View style={[styles.row, styles.rowDivider, styles.headCell]}>
      {columns.map((col, i) => (
        <View
          key={col.key}
          style={[
            i === columns.length - 1 ? styles.cellLast : styles.cell,
            col.width ? { width: col.width } : {},
            col.flex ? { flex: col.flex } : {},
          ]}
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
}: {
  columns: Column[]
  values: string[]
  last?: boolean
}) {
  return (
    <View style={[styles.row, !last ? styles.rowDivider : {}]} wrap={false}>
      {columns.map((col, i) => (
        <View
          key={col.key}
          style={[
            i === columns.length - 1 ? styles.cellLast : styles.cell,
            col.width ? { width: col.width } : {},
            col.flex ? { flex: col.flex } : {},
          ]}
        >
          <Text style={col.align === "center" ? styles.bodyTextCenter : styles.bodyText}>
            {values[i] || EMPTY}
          </Text>
        </View>
      ))}
    </View>
  )
}

const PAX_COLUMNS: Column[] = [
  { key: "no", label: "No.", width: 18, align: "center" },
  { key: "first", label: "Name", flex: 1.4 },
  { key: "last", label: "Surname", flex: 1.4 },
  { key: "title", label: "Title", width: 32, align: "center" },
  { key: "nat", label: "Nationality", width: 46, align: "center" },
  { key: "age", label: "Age", width: 26, align: "center" },
  { key: "roomWith", label: "Room With", width: 62, align: "center" },
  { key: "roomType", label: "Room Type", width: 46, align: "center" },
  { key: "remarks", label: "Remarks", flex: 2 },
]

const SERVICE_COLUMNS: Column[] = [
  { key: "from", label: "From Date", width: 44, align: "center" },
  { key: "to", label: "To Date", width: 44, align: "center" },
  { key: "desc", label: "Service Description", flex: 2 },
  { key: "bookingDate", label: "Booking Date", width: 44, align: "center" },
  { key: "confirmDate", label: "Confirm. Date", width: 44, align: "center" },
  { key: "ref", label: "Reservation Reference", flex: 1.2, align: "center" },
  { key: "paidDate", label: "Payment Made Date", width: 46, align: "center" },
  { key: "paidWith", label: "Paid With", width: 40, align: "center" },
  { key: "payable", label: "Amounts Payable", width: 54, align: "center" },
  { key: "receivable", label: "Amounts Receivable", width: 54, align: "center" },
  { key: "notes", label: "Notes", flex: 1 },
]

const PAYMENT_COLUMNS: Column[] = [
  { key: "date", label: "Payment Made Date", width: 70, align: "center" },
  { key: "paidWith", label: "Paid With", width: 70, align: "center" },
  { key: "payable", label: "Amounts Payable", flex: 1, align: "center" },
  { key: "receivable", label: "Amounts Receivable", flex: 1, align: "center" },
]

export function WorksheetDocument({
  bookingNumber,
  productName,
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
  hasSupplierCosts,
  brand,
  brandLogo = null,
}: WorksheetPdfData) {
  const resolvedBrand: DocumentBrand = brand ?? {
    heading: "Luxus",
    subheading: "Travel & Tours",
    logoUrl: null,
  }

  const totalPayable = serviceLines.reduce((sum, l) => sum + (l.amountPayable ?? 0), 0)
  const totalReceivable = payments.reduce((sum, p) => sum + p.amount, 0)
  const grossProfit = totalReceivable - totalPayable

  return (
    <Document
      author="Luxus Travel & Tours"
      subject={`Booking Worksheet ${bookingNumber}`}
      title={`Worksheet ${bookingNumber} — ${contact.name}`}
    >
      <Page size="A4" style={styles.page}>
        {/* Row 1: brand + status flags + consultant + client + product + departure */}
        <View style={[styles.box, styles.sectionGap]}>
          <View style={styles.row}>
            <View style={[styles.cell, styles.brandCell]}>
              {brandLogo ? <Image src={brandLogo} style={styles.brandLogoImg} /> : null}
              <Text style={styles.brandText}>{resolvedBrand.heading}</Text>
              <Text style={[styles.brandText, { fontFamily: "Helvetica", fontSize: 5 }]}>
                {resolvedBrand.subheading}
              </Text>
            </View>
            <View style={[styles.cell, styles.flagCell]}>
              <Text style={styles.headText}>All Paid</Text>
              <Text style={styles.bodyTextCenter}>{allPaid ? "YES" : "NO"}</Text>
            </View>
            <View style={[styles.cell, styles.flagCell]}>
              <Text style={styles.headText}>All Sent</Text>
              <Text style={styles.bodyTextCenter}>{allSent ? "YES" : "NO"}</Text>
            </View>
            <View style={[styles.cell, styles.flagCell]}>
              <Text style={styles.headText}>Consultant</Text>
              <Text style={styles.bodyTextCenter}>{orDash(consultant)}</Text>
            </View>
            <View style={[styles.cell, { width: 44 }]}>
              <Text style={styles.headText}>Client</Text>
              <Text style={styles.bodyText}>{orDash(contact.name)}</Text>
            </View>
            <View style={[styles.cell, { flex: 1 }]}>
              <Text style={styles.headText}>Product</Text>
              <Text style={[styles.bodyText, styles.bold]}>{orDash(productName)}</Text>
            </View>
            <View style={[styles.cellLast, styles.wideCell]}>
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
              { label: "Title / Contact Name & Surname", value: `${orDash(contact.title)} ${contact.name}`.trim(), flex: 2 },
              { label: "Nationality", value: orDash(contact.nationality), width: 60 },
              { label: "E-mail", value: orDash(contact.email), flex: 2 },
              { label: "Contact Number", value: orDash(contact.phone), width: 80 },
            ]}
          />
        </View>

        {/* Row 3: dates & invoice summary */}
        <View style={[styles.box, styles.sectionGap]}>
          <HeaderRow
            last
            cells={[
              { label: "Arrive", value: dateOrDash(arriveDate), width: 46 },
              { label: "Depart", value: dateOrDash(departDate), width: 46 },
              { label: "No. Pax", value: String(noOfPax), width: 34 },
              { label: "Inv. Date", value: dateOrDash(invoiceDate), width: 46 },
              {
                label: "Deposit %",
                value: depositPercentage != null ? `${depositPercentage}%` : EMPTY,
                width: 40,
              },
              { label: "Dep. Due", value: dateOrDash(depositDueDate), width: 46 },
              { label: "Paid", value: dateOrDash(depositPaidAt), width: 46 },
              { label: "Final Due", value: dateOrDash(finalDueDate), width: 46 },
              { label: "Paid", value: dateOrDash(finalPaidAt), width: 46 },
              { label: "Docs Date", value: dateOrDash(docsDate), width: 46 },
              { label: "Docs By", value: orDash(docsBy), width: 40 },
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
                  p.title ?? "",
                  p.nationality ?? "",
                  p.age != null ? String(p.age) : "",
                  p.roomWith ?? "",
                  p.roomType ?? "",
                  p.remarks ?? "",
                ]}
              />
            ))
          )}
        </View>

        {/* Service lines (supplier bookings) */}
        <View style={[styles.box, styles.sectionGap]}>
          <TableHead columns={SERVICE_COLUMNS} />
          {serviceLines.length === 0 ? (
            <TableRow columns={SERVICE_COLUMNS} values={[]} last />
          ) : (
            serviceLines.map((l, i) => (
              <TableRow
                key={i}
                last={i === serviceLines.length - 1}
                columns={SERVICE_COLUMNS}
                values={[
                  dateOrDash(l.fromDate),
                  dateOrDash(l.toDate),
                  l.description,
                  dateOrDash(l.bookingDate),
                  dateOrDash(l.confirmationDate),
                  l.reservationReference ?? "",
                  dateOrDash(l.paymentMadeDate),
                  l.paidWith ?? "",
                  formatMoney(l.amountPayable),
                  formatMoney(l.amountReceivable),
                  l.notes ?? "",
                ]}
              />
            ))
          )}
        </View>

        {/* Client payment information */}
        <View style={[styles.box, styles.sectionGap]}>
          <TableHead columns={PAYMENT_COLUMNS} />
          {payments.length === 0 ? (
            <TableRow columns={PAYMENT_COLUMNS} values={[]} last />
          ) : (
            payments.map((p, i) => (
              <TableRow
                key={i}
                last={i === payments.length - 1}
                columns={PAYMENT_COLUMNS}
                values={[dateOrDash(p.date), p.paidWith ?? "", EMPTY, formatMoney(p.amount)]}
              />
            ))
          )}
          <View style={[styles.row, styles.rowDivider, styles.headCell]} wrap={false}>
            <View style={[styles.cell, { flex: 2 }]}>
              <Text style={[styles.headText, { textAlign: "right" }]}>Totals</Text>
            </View>
            <View style={[styles.cell, PAYMENT_COLUMNS[2].width ? { width: PAYMENT_COLUMNS[2].width } : { flex: 1 }]}>
              <Text style={styles.bodyTextCenter}>{formatMoney(totalPayable)}</Text>
            </View>
            <View style={[styles.cellLast, PAYMENT_COLUMNS[3].width ? { width: PAYMENT_COLUMNS[3].width } : { flex: 1 }]}>
              <Text style={styles.bodyTextCenter}>{formatMoney(totalReceivable)}</Text>
            </View>
          </View>
          <View style={styles.row} wrap={false}>
            <View style={[styles.cellLast, { flex: 1 }]}>
              <Text style={[styles.headText, { textAlign: "right" }]}>
                Gross Profit: <Text style={styles.bold}>{formatMoney(grossProfit)}</Text>
              </Text>
            </View>
          </View>
        </View>

        {!hasSupplierCosts ? (
          <Text style={styles.note}>
            * Supplier costs are not yet captured for this booking — Gross Profit reflects revenue
            received only, not net margin.
          </Text>
        ) : null}
      </Page>
    </Document>
  )
}
