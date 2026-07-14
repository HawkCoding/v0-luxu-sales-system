import { Text, View } from "@react-pdf/renderer"
import type { VoucherData } from "@/lib/generate-voucher"
import { formatDisplayDateLong } from "@/lib/date-format"
import type { voucherStyles } from "../styles"
import { InfoRow } from "./info-row"

type Styles = ReturnType<typeof voucherStyles>

interface ServiceProviderProps {
  data: VoucherData
  styles: Styles
}

// `departure` is pre-formatted upstream; `arrival` still arrives as raw ISO.
function formatServiceDate(value: string | null | undefined): string {
  if (!value) return ""
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value
  return formatDisplayDateLong(value) || value
}

export function ServiceProvider({ data, styles }: ServiceProviderProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} minPresenceAhead={60}>
        Service Provider
      </Text>
      <View style={styles.providerBox}>
        <Text style={styles.providerName}>{data.supplierName}</Text>
        {data.supplierDescription ? (
          <Text style={styles.providerDescription}>{data.supplierDescription}</Text>
        ) : null}
        <InfoRow label="Your Reference" value={data.voucherNumber} styles={styles} />
        <InfoRow label="Route" value={data.route} styles={styles} />
        <InfoRow label="Departure Date" value={formatServiceDate(data.departure)} styles={styles} />
        <InfoRow label="Arrival Date" value={formatServiceDate(data.arrival) || "TBC"} styles={styles} />
        <InfoRow label="Suite Type" value={data.suiteType} styles={styles} />
        <InfoRow label="Number of Suites" value={data.enquiry.noOfSuites} styles={styles} />
        <InfoRow label="Meal Basis" value="Full Board (All meals included)" styles={styles} />
      </View>
    </View>
  )
}
