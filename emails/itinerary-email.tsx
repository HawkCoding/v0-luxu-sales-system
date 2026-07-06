import { Heading, Section, Text } from "@react-email/components"
import { BaseLayout } from "./base-layout"

export interface ItineraryEmailProps {
  customerName: string
  bookingNumber: string
  tripTitle: string
  departure: string
  consultantName: string
  footerTagline?: string
}

export function ItineraryEmail({
  customerName,
  bookingNumber,
  tripTitle,
  departure,
  consultantName,
  footerTagline,
}: ItineraryEmailProps) {
  return (
    <BaseLayout preview={`Your itinerary for ${tripTitle || bookingNumber}`} footerTagline={footerTagline}>
      <Heading style={heading}>Your travel itinerary</Heading>
      <Text style={paragraph}>Dear {customerName || "traveller"},</Text>
      <Text style={paragraph}>
        Please find your personalised travel itinerary attached. It contains an overview of your
        journey and all the key details you will need for a seamless trip.
      </Text>

      <Section style={summaryBox}>
        <Text style={summaryLabel}>Trip</Text>
        <Text style={summaryValue}>{tripTitle || bookingNumber}</Text>
        <Text style={summaryLabel}>Booking Reference</Text>
        <Text style={summaryValue}>{bookingNumber}</Text>
        <Text style={summaryLabel}>Departure</Text>
        <Text style={summaryValue}>{departure || "To be confirmed"}</Text>
      </Section>

      <Text style={paragraph}>
        Your consultant {consultantName || "from Luxus Travel & Tours"} is always available if you
        have any questions before you travel. We look forward to making this a truly memorable
        journey.
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
