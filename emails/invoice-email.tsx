import { Heading, Hr, Row, Section, Text } from "@react-email/components"
import { BaseLayout } from "./base-layout"
import { BRAND_SHORT_NAME } from "@/lib/brand"

export interface InvoiceEmailLine {
  label: string
  value: string
}

export interface InvoiceEmailProps {
  customerName: string
  invoiceNumber: string
  bookingNumber: string
  invoiceKind: "deposit" | "final"
  amount: string
  depositPercentage?: number | null
  dueDate?: string | null
  lines?: InvoiceEmailLine[]
  introText?: string
}

export function InvoiceEmail({
  customerName,
  invoiceNumber,
  bookingNumber,
  invoiceKind,
  amount,
  depositPercentage,
  dueDate,
  lines = [],
  introText,
}: InvoiceEmailProps) {
  const invoiceLabel = invoiceKind === "deposit" ? "Deposit invoice" : "Final invoice"
  const preview = `${invoiceLabel} ${invoiceNumber} for ${bookingNumber}`

  return (
    <BaseLayout preview={preview}>
      <Heading style={heading}>{invoiceLabel}</Heading>
      <Text style={paragraph}>Dear {customerName || "traveller"},</Text>
      <Text style={paragraph}>
        {introText?.trim() ||
          `Please find the ${invoiceLabel.toLowerCase()} for your ${BRAND_SHORT_NAME} booking below.`}
      </Text>

      <Section style={summaryBox}>
        <Row>
          <Text style={summaryLabel}>Invoice number</Text>
          <Text style={summaryValue}>{invoiceNumber}</Text>
        </Row>
        <Row>
          <Text style={summaryLabel}>Booking</Text>
          <Text style={summaryValue}>{bookingNumber}</Text>
        </Row>
        {depositPercentage !== null && depositPercentage !== undefined ? (
          <Row>
            <Text style={summaryLabel}>Deposit percentage</Text>
            <Text style={summaryValue}>{depositPercentage}%</Text>
          </Row>
        ) : null}
        {dueDate ? (
          <Row>
            <Text style={summaryLabel}>Due date</Text>
            <Text style={summaryValue}>{dueDate}</Text>
          </Row>
        ) : null}
        <Hr style={divider} />
        <Row>
          <Text style={totalLabel}>Amount due</Text>
          <Text style={totalValue}>{amount}</Text>
        </Row>
      </Section>

      {lines.length > 0 ? (
        <Section style={details}>
          {lines.map((line) => (
            <Row key={line.label}>
              <Text style={detailLabel}>{line.label}</Text>
              <Text style={detailValue}>{line.value}</Text>
            </Row>
          ))}
        </Section>
      ) : null}

      <Text style={paragraph}>
        Once payment has been received, we will update your booking and continue preparing the
        next step of your journey.
      </Text>
    </BaseLayout>
  )
}

const heading = {
  margin: "0 0 18px",
  color: "#26211b",
  fontSize: "24px",
  lineHeight: "32px",
}

const paragraph = {
  color: "#3f382f",
  fontSize: "14px",
  lineHeight: "22px",
}

const summaryBox = {
  margin: "22px 0",
  padding: "16px",
  border: "1px solid #e6dccf",
  borderRadius: "8px",
  backgroundColor: "#fbf8f3",
}

const summaryLabel = {
  margin: "0 0 8px",
  color: "#6f675d",
  fontSize: "12px",
  lineHeight: "18px",
}

const summaryValue = {
  margin: "0 0 8px",
  color: "#26211b",
  fontSize: "13px",
  fontWeight: "700",
  lineHeight: "18px",
  textAlign: "right" as const,
}

const divider = {
  borderColor: "#e6dccf",
  margin: "8px 0 12px",
}

const totalLabel = {
  margin: "0",
  color: "#26211b",
  fontSize: "15px",
  fontWeight: "700",
  lineHeight: "22px",
}

const totalValue = {
  margin: "0",
  color: "#26211b",
  fontSize: "18px",
  fontWeight: "700",
  lineHeight: "24px",
  textAlign: "right" as const,
}

const details = {
  margin: "0 0 22px",
}

const detailLabel = {
  margin: "0 0 6px",
  color: "#6f675d",
  fontSize: "12px",
  lineHeight: "18px",
}

const detailValue = {
  margin: "0 0 6px",
  color: "#26211b",
  fontSize: "12px",
  lineHeight: "18px",
  textAlign: "right" as const,
}
