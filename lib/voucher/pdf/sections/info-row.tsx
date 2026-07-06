import { Text, View } from "@react-pdf/renderer"
import type { voucherStyles } from "../styles"

type Styles = ReturnType<typeof voucherStyles>

export interface InfoRowProps {
  label: string
  value: string | number
  styles: Styles
}

export function InfoRow({ label, value, styles }: InfoRowProps) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{String(value || "")}</Text>
    </View>
  )
}
