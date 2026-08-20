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
 * cell rows and plain rows alike — lines up on the same grid. Each cell is sized as a percentage
 * of the row's total span count (default span 1 each), not an equal flex share, so a cell that
 * spans more columns in one row (e.g. the suite name) can still leave its neighbour ("Qty") lined
 * up with the same-position cell in a different row below it ("Infant"). */
export function CellRow({ label, cells, styles, dotted }: CellRowProps) {
  const rowStyle = [
    styles.infoRow,
    ...(dotted ? [styles.infoRowDotted] : []),
  ]
  const columns = cells.reduce((sum, cell) => sum + (cell.span ?? 1), 0)
  return (
    <View style={rowStyle} wrap={false}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.cellGroup}>
        {cells.map((cell, idx) => (
          <View
            key={`${cell.label}-${idx}`}
            style={[styles.cell, { width: `${((cell.span ?? 1) / columns) * 100}%` }]}
          >
            <Text style={styles.cellLabel}>{cell.label}</Text>
            <Text style={styles.cellValue}>{String(cell.value ?? "")}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
