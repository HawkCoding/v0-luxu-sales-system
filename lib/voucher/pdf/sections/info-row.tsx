import { Text, View } from "@react-pdf/renderer"
import type { VoucherRowCell } from "@/lib/voucher/service-block-rows"
import type { voucherStyles } from "../styles"

type Styles = ReturnType<typeof voucherStyles>

export interface InfoRowProps {
  label: string
  value: string | number
  styles: Styles
  /** Dotted bottom rule, used inside a provider box — legacy tables ruled every row. */
  dotted?: boolean
  /** Alternating band background, used in Guest Information only. */
  shaded?: boolean
}

export function InfoRow({ label, value, styles, dotted, shaded }: InfoRowProps) {
  const rowStyle = [
    styles.infoRow,
    ...(dotted ? [styles.infoRowDotted] : []),
    ...(shaded ? [styles.infoRowShaded] : []),
  ]
  return (
    <View style={rowStyle} wrap={false}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{String(value || "")}</Text>
    </View>
  )
}

export interface CellRowProps {
  label: string
  cells: VoucherRowCell[]
  styles: Styles
  dotted?: boolean
}

/** "Suite Type | Qty", "Adults | Children | Infant" — several label/value pairs tabled inline on
 * one row, the way the legacy voucher printed suite quantity and guest breakdowns. Shares
 * InfoRow's row shell (fixed label gutter, flex:1 value area) so every row in a provider box —
 * cell rows and plain rows alike — lines up on the same grid. */
export function CellRow({ label, cells, styles, dotted }: CellRowProps) {
  const rowStyle = [
    styles.infoRow,
    ...(dotted ? [styles.infoRowDotted] : []),
  ]
  return (
    <View style={rowStyle} wrap={false}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.cellGroup}>
        {cells.map((cell, idx) => (
          <View key={`${cell.label}-${idx}`} style={styles.cell}>
            <Text style={styles.cellLabel}>{cell.label}</Text>
            <Text style={styles.cellValue}>{String(cell.value ?? "")}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
