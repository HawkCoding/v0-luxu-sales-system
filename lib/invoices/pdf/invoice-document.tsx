import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer"
import { formatDisplayDate } from "@/lib/date-format"
import type { BankingSettings } from "@/lib/settings-access"

export interface InvoicePdfLine {
  label: string
  value: string
}

export interface InvoicePdfData {
  invoiceNumber: string
  bookingNumber: string
  customerName: string
  kind: "deposit" | "final"
  issueDate: string
  dueDate: string | null
  /** Context lines (quote total, payments received, ...) shown above the amount due. */
  lines: InvoicePdfLine[]
  amountDue: number
  currency?: string
  statusLabel?: string
  banking: BankingSettings
  depositTitle?: string
  finalTitle?: string
  footerText?: string
}

function formatMoney(amount: number, currency = "ZAR"): string {
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function formatDate(value: string | null): string {
  return formatDisplayDate(value?.slice(0, 10)) || "To be confirmed"
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 48,
    color: "#312b24",
    backgroundColor: "#ffffff",
  },
  header: {
    marginBottom: 24,
    borderBottomWidth: 2,
    borderBottomColor: "#8b5a2b",
    paddingBottom: 12,
  },
  brand: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#172018",
    marginBottom: 2,
  },
  brandSub: {
    fontSize: 9,
    color: "#8a7f74",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 20,
    marginBottom: 16,
  },
  docTitle: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: "#172018",
  },
  statusBadge: {
    fontSize: 8,
    color: "#8a7f74",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 3,
  },
  numberBadge: {
    fontSize: 10,
    color: "#6f675d",
    textAlign: "right",
  },
  metaBox: {
    backgroundColor: "#fbf8f3",
    borderWidth: 1,
    borderColor: "#e8dfd2",
    padding: 12,
    marginBottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metaLabel: {
    fontSize: 9,
    color: "#8a7f74",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#312b24",
  },
  line: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#eee6dc",
    paddingVertical: 7,
  },
  lineLabel: { fontSize: 10, color: "#6f675d" },
  lineValue: { fontSize: 10, color: "#312b24" },
  amountBox: {
    marginTop: 20,
    backgroundColor: "#172018",
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  amountLabel: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#f6f2ea",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  amountValue: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
  },
  dueNote: {
    marginTop: 8,
    fontSize: 9,
    color: "#6f675d",
    textAlign: "right",
  },
  bankingBox: {
    marginTop: 28,
    borderWidth: 1,
    borderColor: "#e8dfd2",
    backgroundColor: "#fbf8f3",
    padding: 12,
  },
  bankingTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#172018",
    marginBottom: 6,
  },
  bankingLine: {
    flexDirection: "row",
    marginBottom: 3,
  },
  bankingLabel: {
    fontSize: 9,
    color: "#8a7f74",
    width: 110,
  },
  bankingValue: {
    fontSize: 9,
    color: "#312b24",
    flex: 1,
  },
  footer: {
    marginTop: 36,
    borderTopWidth: 1,
    borderTopColor: "#e8dfd2",
    paddingTop: 12,
    fontSize: 8,
    color: "#8a7f74",
    textAlign: "center",
  },
})

const BANKING_ROWS: Array<{ key: keyof BankingSettings; label: string }> = [
  { key: "bank_name", label: "Bank" },
  { key: "bank_account_name", label: "Account name" },
  { key: "bank_account_number", label: "Account number" },
  { key: "bank_branch_code", label: "Branch code" },
  { key: "bank_swift_code", label: "SWIFT/BIC" },
  { key: "payment_reference_hint", label: "Payment reference" },
]

export function InvoiceDocument({
  invoiceNumber,
  bookingNumber,
  customerName,
  kind,
  issueDate,
  dueDate,
  lines,
  amountDue,
  currency = "ZAR",
  statusLabel = "Draft",
  banking,
  depositTitle = "DEPOSIT INVOICE",
  finalTitle = "FINAL INVOICE",
  footerText = "Luxus Travel & Tours — Luxury Rail Journeys",
}: InvoicePdfData) {
  const title = kind === "deposit" ? depositTitle : finalTitle
  const bankingRows = BANKING_ROWS.filter(({ key }) => banking[key])
  const companyFooterParts = [
    banking.company_address,
    banking.company_reg_number ? `Reg no: ${banking.company_reg_number}` : "",
    banking.company_vat_number ? `VAT no: ${banking.company_vat_number}` : "",
  ].filter(Boolean)

  return (
    <Document
      author="Luxus Travel & Tours"
      subject={`Invoice ${invoiceNumber}`}
      title={`Invoice ${invoiceNumber} — ${customerName}`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>Luxus Travel & Tours</Text>
          <Text style={styles.brandSub}>Luxury Rail Journeys</Text>
        </View>

        <View style={styles.titleRow}>
          <View>
            <Text style={styles.docTitle}>{title}</Text>
            <Text style={styles.statusBadge}>STATUS: {statusLabel}</Text>
          </View>
          <View>
            <Text style={styles.numberBadge}>{invoiceNumber}</Text>
            <Text style={[styles.numberBadge, { color: "#8a7f74", fontSize: 9 }]}>
              Ref: {bookingNumber}
            </Text>
          </View>
        </View>

        <View style={styles.metaBox}>
          <View>
            <Text style={styles.metaLabel}>Billed to</Text>
            <Text style={styles.metaValue}>{customerName || "Valued Guest"}</Text>
          </View>
          <View>
            <Text style={styles.metaLabel}>Invoice date</Text>
            <Text style={styles.metaValue}>{formatDate(issueDate)}</Text>
          </View>
          <View>
            <Text style={styles.metaLabel}>Due date</Text>
            <Text style={styles.metaValue}>{formatDate(dueDate)}</Text>
          </View>
        </View>

        {lines.map((line, index) => (
          <View key={index} style={styles.line}>
            <Text style={styles.lineLabel}>{line.label}</Text>
            <Text style={styles.lineValue}>{line.value}</Text>
          </View>
        ))}

        <View style={styles.amountBox}>
          <Text style={styles.amountLabel}>Amount due</Text>
          <Text style={styles.amountValue}>{formatMoney(amountDue, currency)}</Text>
        </View>
        <Text style={styles.dueNote}>Payable by {formatDate(dueDate)}</Text>

        {bankingRows.length > 0 ? (
          <View style={styles.bankingBox}>
            <Text style={styles.bankingTitle}>Banking details</Text>
            {bankingRows.map(({ key, label }) => (
              <View key={key} style={styles.bankingLine}>
                <Text style={styles.bankingLabel}>{label}</Text>
                <Text style={styles.bankingValue}>{banking[key]}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.footer}>
          {[footerText, ...companyFooterParts].join("  •  ")}
        </Text>
      </Page>
    </Document>
  )
}
