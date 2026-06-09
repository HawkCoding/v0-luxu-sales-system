import {
  Heading,
  Hr,
  Section,
  Text,
} from "@react-email/components"
import { BRAND_NAME } from "@/lib/brand"
import { BaseLayout } from "@/emails/base-layout"

export interface QuoteEmailLineItem {
  description: string
  supplierDescription?: string | null
  qty: number
  unitPrice: number
  total: number
}

export interface QuoteEmailQuote {
  quoteNumber: string
  quoteDate: string
  validUntil: string | null
  subtotal: number
  vat: number
  total: number
  lineItems: QuoteEmailLineItem[]
}

export interface QuoteEmailProps {
  customerName: string
  introText: string
  quote: QuoteEmailQuote
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(value: string | null): string {
  if (!value) return "To be confirmed"

  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`))
}

function renderMultilineText(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export function QuoteEmail({ customerName, introText, quote }: QuoteEmailProps) {
  return (
    <BaseLayout preview={`Quote ${quote.quoteNumber} from ${BRAND_NAME}`}>
      <Heading style={heading}>Your luxury rail quote</Heading>
      <Text style={text}>Dear {customerName || "traveller"},</Text>
      {renderMultilineText(introText).map((line) => (
        <Text key={line} style={text}>
          {line}
        </Text>
      ))}

      <Section style={summary}>
        <Text style={summaryLine}>
          <strong>Quote number:</strong> {quote.quoteNumber}
        </Text>
        <Text style={summaryLine}>
          <strong>Quote date:</strong> {formatDate(quote.quoteDate)}
        </Text>
        <Text style={summaryLine}>
          <strong>Valid until:</strong> {formatDate(quote.validUntil)}
        </Text>
      </Section>

      <table style={table}>
        <thead>
          <tr>
            <th style={leftHeader}>Description</th>
            <th style={rightHeader}>Qty</th>
            <th style={rightHeader}>Unit price</th>
            <th style={rightHeader}>Total</th>
          </tr>
        </thead>
        <tbody>
          {quote.lineItems.map((item, index) => (
            <tr key={`${item.description}-${index}`}>
              <td style={leftCell}>
                <span>{item.description}</span>
                {item.supplierDescription ? (
                  <span style={supplierDescriptionText}>{item.supplierDescription}</span>
                ) : null}
              </td>
              <td style={rightCell}>{item.qty}</td>
              <td style={rightCell}>{item.unitPrice === 0 ? "Included" : formatMoney(item.unitPrice)}</td>
              <td style={rightCell}>{item.total === 0 ? "—" : formatMoney(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Section style={totals}>
        <Text style={totalLine}>Subtotal: {formatMoney(quote.subtotal)}</Text>
        <Text style={totalLine}>VAT: {formatMoney(quote.vat)}</Text>
        <Text style={grandTotal}>Total: {formatMoney(quote.total)}</Text>
      </Section>

      <Hr style={rule} />
      <Text style={text}>
        To accept this quote, please reply to this email and we will prepare the next booking
        steps for you.
      </Text>
    </BaseLayout>
  )
}

const heading = {
  margin: "0 0 16px",
  color: "#172018",
  fontSize: "24px",
  lineHeight: "32px",
}

const text = {
  margin: "0 0 14px",
  color: "#312b24",
  fontSize: "14px",
  lineHeight: "22px",
}

const summary = {
  margin: "18px 0",
  padding: "14px 16px",
  backgroundColor: "#fbf8f3",
  border: "1px solid #e8dfd2",
}

const summaryLine = {
  margin: "0 0 6px",
  color: "#312b24",
  fontSize: "13px",
  lineHeight: "19px",
}

const table = {
  width: "100%",
  borderCollapse: "collapse" as const,
  marginTop: "18px",
}

const leftHeader = {
  padding: "10px 8px",
  borderBottom: "1px solid #d8cdbc",
  color: "#6f675d",
  fontSize: "11px",
  textAlign: "left" as const,
  textTransform: "uppercase" as const,
}

const rightHeader = {
  ...leftHeader,
  textAlign: "right" as const,
}

const leftCell = {
  padding: "10px 8px",
  borderBottom: "1px solid #eee6dc",
  color: "#312b24",
  fontSize: "13px",
  lineHeight: "18px",
}

const rightCell = {
  ...leftCell,
  textAlign: "right" as const,
  whiteSpace: "nowrap" as const,
}

const totals = {
  marginTop: "16px",
  textAlign: "right" as const,
}

const totalLine = {
  margin: "0 0 4px",
  color: "#554c42",
  fontSize: "13px",
}

const grandTotal = {
  margin: "8px 0 0",
  color: "#172018",
  fontSize: "16px",
  fontWeight: 700,
}

const rule = {
  margin: "24px 0 18px",
  borderColor: "#e8dfd2",
}

const supplierDescriptionText = {
  display: "block",
  marginTop: "3px",
  color: "#8a7f74",
  fontSize: "11px",
  fontStyle: "italic" as const,
  lineHeight: "16px",
}
