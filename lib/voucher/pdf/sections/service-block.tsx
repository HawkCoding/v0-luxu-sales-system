import { Text, View } from "@react-pdf/renderer"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { voucherServiceTypeLabel } from "@/lib/generate-voucher"
import { formatDisplayDateLong } from "@/lib/date-format"
import type { voucherStyles } from "../styles"
import { InfoRow } from "./info-row"

type Styles = ReturnType<typeof voucherStyles>

// Only ISO date-ish values are reformatted; anything else is already display text
// and must be passed through untouched (re-parsing "04/07/2026" would flip d/m).
function fmt(value: string | null | undefined): string | null {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value
  return formatDisplayDateLong(value) || value
}

function rowsForBlock(block: VoucherServiceBlock): Array<[string, string | number]> {
  const rows: Array<[string, string | number]> = []
  const d = block.serviceData
  const departureDate = fmt(d.departureDate)
  const arrivalDate = fmt(d.arrivalDate)
  rows.push(["Your Reference", block.supplierReference ?? "—"])

  if (block.serviceType === "train") {
    rows.push(["Route", d.route ?? "—"])
    if (d.durationDays != null) {
      rows.push(["Duration", `${d.durationDays} ${d.durationDays === 1 ? "day" : "days"}`])
    }
    rows.push(["Departure Date", departureDate ?? "—"])
    rows.push(["Arrival Date", arrivalDate ?? "TBC"])
    rows.push(["Suite Type", d.suiteType ?? "—"])
    if (d.numberOfSuites != null) rows.push(["Number of Suites", d.numberOfSuites])
    if (d.mealPlan) rows.push(["Meal Basis", d.mealPlan])
  } else if (block.serviceType === "hotel") {
    if (d.roomType) rows.push(["Room Type", d.roomType])
    if (d.nights != null) rows.push(["Nights", d.nights])
    if (d.mealPlan) rows.push(["Meal Plan", d.mealPlan])
    if (departureDate) rows.push(["Check-In", departureDate])
    if (arrivalDate) rows.push(["Check-Out", arrivalDate])
  } else if (block.serviceType === "transfer") {
    if (d.vehicleType) rows.push(["Vehicle", d.vehicleType])
    if (d.pickup) rows.push(["Pickup", d.pickup])
    if (d.dropoff) rows.push(["Drop-off", d.dropoff])
    if (departureDate) rows.push(["Date", departureDate])
  } else if (block.serviceType === "tour") {
    if (d.itinerary) rows.push(["Itinerary", d.itinerary])
    if (departureDate) rows.push(["Start Date", departureDate])
    if (arrivalDate) rows.push(["End Date", arrivalDate])
  } else if (block.serviceType === "airline") {
    if (d.route) rows.push(["Route", d.route])
    if (d.cabin) rows.push(["Cabin", d.cabin])
    if (d.flightNumber) rows.push(["Flight", d.flightNumber])
    if (departureDate) rows.push(["Departure", departureDate])
    if (arrivalDate) rows.push(["Arrival", arrivalDate])
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
