import { Text, View } from "@react-pdf/renderer"
import type { VoucherData } from "@/lib/generate-voucher"
import type { voucherStyles } from "../styles"

type Styles = ReturnType<typeof voucherStyles>

interface InfoRowProps {
  label: string
  value: string | number
  styles: Styles
}

function InfoRow({ label, value, styles }: InfoRowProps) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{String(value || "")}</Text>
    </View>
  )
}

interface ServiceProviderProps {
  data: VoucherData
  styles: Styles
}

export function ServiceProvider({ data, styles }: ServiceProviderProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Service Provider</Text>
      <View style={styles.providerBox}>
        <Text style={styles.providerName}>{data.supplierName}</Text>
        {data.supplierDescription ? (
          <Text style={{ fontSize: 10, color: "#555555", fontStyle: "italic", marginBottom: 8 }}>
            {data.supplierDescription}
          </Text>
        ) : null}
        <InfoRow label="Your Reference:" value={data.voucherNumber} styles={styles} />
        <InfoRow label="Route:" value={data.route} styles={styles} />
        <InfoRow label="Departure Date:" value={data.departure} styles={styles} />
        <InfoRow label="Arrival Date:" value={data.arrival || "TBC"} styles={styles} />
        <InfoRow label="Suite Type:" value={data.suiteType} styles={styles} />
        <InfoRow label="Number of Suites:" value={data.enquiry.noOfSuites} styles={styles} />
        <InfoRow label="Meal Basis:" value="Full Board (All meals included)" styles={styles} />
      </View>
    </View>
  )
}
