import { Text, View } from "@react-pdf/renderer"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { voucherServiceTypeLabel } from "@/lib/generate-voucher"
import type { voucherStyles } from "../styles"
import { InfoRow } from "./info-row"

type Styles = ReturnType<typeof voucherStyles>

function rowsForBlock(block: VoucherServiceBlock): Array<[string, string | number]> {
  const rows: Array<[string, string | number]> = []
  const d = block.serviceData
  rows.push(["Your Reference", block.supplierReference ?? "—"])

  if (block.serviceType === "train") {
    rows.push(["Route", d.route ?? "—"])
    rows.push(["Departure Date", d.departureDate ?? "—"])
    rows.push(["Arrival Date", d.arrivalDate ?? "TBC"])
    rows.push(["Suite Type", d.suiteType ?? "—"])
    if (d.numberOfSuites != null) rows.push(["Number of Suites", d.numberOfSuites])
    if (d.mealPlan) rows.push(["Meal Basis", d.mealPlan])
  } else if (block.serviceType === "hotel") {
    if (d.roomType) rows.push(["Room Type", d.roomType])
    if (d.nights != null) rows.push(["Nights", d.nights])
    if (d.mealPlan) rows.push(["Meal Plan", d.mealPlan])
    if (d.departureDate) rows.push(["Check-In", d.departureDate])
    if (d.arrivalDate) rows.push(["Check-Out", d.arrivalDate])
  } else if (block.serviceType === "transfer") {
    if (d.vehicleType) rows.push(["Vehicle", d.vehicleType])
    if (d.pickup) rows.push(["Pickup", d.pickup])
    if (d.dropoff) rows.push(["Drop-off", d.dropoff])
    if (d.departureDate) rows.push(["Date", d.departureDate])
  } else if (block.serviceType === "tour") {
    if (d.itinerary) rows.push(["Itinerary", d.itinerary])
    if (d.departureDate) rows.push(["Start Date", d.departureDate])
    if (d.arrivalDate) rows.push(["End Date", d.arrivalDate])
  } else if (block.serviceType === "airline") {
    if (d.route) rows.push(["Route", d.route])
    if (d.cabin) rows.push(["Cabin", d.cabin])
    if (d.flightNumber) rows.push(["Flight", d.flightNumber])
    if (d.departureDate) rows.push(["Departure", d.departureDate])
    if (d.arrivalDate) rows.push(["Arrival", d.arrivalDate])
  }

  if (d.notes) rows.push(["Notes", d.notes])

  const contactParts: string[] = []
  if (block.contactDetails.phone) contactParts.push(`Phone: ${block.contactDetails.phone}`)
  if (block.contactDetails.email) contactParts.push(`Email: ${block.contactDetails.email}`)
  if (block.contactDetails.location) contactParts.push(`Location: ${block.contactDetails.location}`)
  if (contactParts.length > 0) rows.push(["Contact", contactParts.join(" • ")])

  return rows
}

interface ServiceBlockProps {
  block: VoucherServiceBlock
  styles: Styles
}

export function ServiceBlock({ block, styles }: ServiceBlockProps) {
  const title = block.title || voucherServiceTypeLabel(block.serviceType)
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} minPresenceAhead={60}>
        {title}
      </Text>
      <View style={styles.providerBox}>
        {block.contactDetails.name ? (
          <Text style={styles.providerName}>{block.contactDetails.name}</Text>
        ) : null}
        {rowsForBlock(block).map(([label, value], idx) => (
          <InfoRow key={`${block.serviceType}-${idx}`} label={label} value={value} styles={styles} />
        ))}
      </View>
    </View>
  )
}
