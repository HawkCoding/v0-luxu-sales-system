import { Heading, Section, Text } from "@react-email/components"
import { BaseLayout } from "./base-layout"

export interface VoucherEmailProps {
  customerName: string
  bookingNumber: string
  route: string
  departure: string
  consultantName: string
  introText?: string
  footerTagline?: string
}

export function VoucherEmail({
  customerName,
  bookingNumber,
  route,
  departure,
  consultantName,
  introText,
  footerTagline,
}: VoucherEmailProps) {
  return (
    <BaseLayout preview={`Travel voucher for ${bookingNumber}`} footerTagline={footerTagline}>
      <Heading style={heading}>Your travel voucher</Heading>
      <Text style={paragraph}>Dear {customerName || "traveller"},</Text>
      <Text style={paragraph}>
        {introText?.trim() ||
          "Please find your travel voucher attached. Keep it handy for your journey and present it to the service provider when requested."}
      </Text>

      <Section style={summaryBox}>
        <Text style={summaryLabel}>Booking</Text>
        <Text style={summaryValue}>{bookingNumber}</Text>
        <Text style={summaryLabel}>Route</Text>
        <Text style={summaryValue}>{route || "To be confirmed"}</Text>
        <Text style={summaryLabel}>Departure</Text>
        <Text style={summaryValue}>{departure || "To be confirmed"}</Text>
      </Section>

      <Text style={paragraph}>
        Your consultant {consultantName || "from Luxus Travel & Tours"} remains available if you need anything before departure.
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
  margin: "0 0 4px",
  color: "#6f675d",
  fontSize: "12px",
  lineHeight: "18px",
}

const summaryValue = {
  margin: "0 0 12px",
  color: "#26211b",
  fontSize: "14px",
  fontWeight: "700",
  lineHeight: "20px",
}
