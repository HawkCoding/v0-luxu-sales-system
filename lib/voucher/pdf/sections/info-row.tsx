import { Text, View } from "@react-pdf/renderer"
import { designRowLabel } from "@/lib/pdf/sarail-design"
import type { VoucherRowCell } from "@/lib/voucher/service-block-rows"
import { VOUCHER_CELL_COLUMNS, type VoucherStyles } from "../styles"

export interface InfoRowProps {
  label: string
  value: string | number
  styles: VoucherStyles
}

/** "Label:  value" — bold label in the box's fixed label column, value beside it. */
/** A value long enough to crowd a page (an essay in Notes) may break across pages; any other row
 * stays whole. */
const LONG_VALUE_CHARS = 400

export function InfoRow({ label, value, styles }: InfoRowProps) {
  return (
    <View style={styles.infoRow} wrap={String(value ?? "").length > LONG_VALUE_CHARS}>
      <Text style={styles.infoLabel}>{designRowLabel(label)}</Text>
      <Text style={styles.infoValue}>{String(value || "")}</Text>
    </View>
  )
}

export interface CellRowProps {
  label: string
  cells: VoucherRowCell[]
  styles: VoucherStyles
}

/** Rough Manrope Bold 8pt advance per character — enough to size an inline cell label. */
const BOLD_CHAR_WIDTH = 4

function labelWidth(label: string): number {
  return Math.max(38, Math.ceil(label.length * BOLD_CHAR_WIDTH) + 7)
}

/**
 * "Room Type:  Deluxe Suite   QTY: 1" / "Guests:  Adults: 2   Children: 0   Infants: 0" — several
 * label/value pairs on one row, each label set inline before its value as the template does. Cells
 * sit on the template's three columns (126.7pt / 140pt / the rest of the value area). A cell that
 * repeats the row's own label (the suite/room name) prints its value alone and wraps inside the
 * first column, so "QTY" always lines up with "Children" whatever the booking's suite is called.
 */
export function CellRow({ label, cells, styles }: CellRowProps) {
  const [firstColumn, secondColumn] = VOUCHER_CELL_COLUMNS
  let column = 0
  return (
    <View style={styles.infoRow} wrap={false}>
      <Text style={styles.infoLabel}>{designRowLabel(label)}</Text>
      <View style={styles.cellGroup}>
        {cells.map((cell, idx) => {
          const isRowValue = cell.label === label
          const value = String(cell.value ?? "")
          const width = column === 0 ? firstColumn : column === 1 ? secondColumn : undefined
          column += 1
          const isLast = idx === cells.length - 1 || column >= 3
          return (
            <View
              key={`${cell.label}-${idx}`}
              style={[
                styles.cell,
                isLast && width === undefined ? { flex: 1 } : { width: width ?? firstColumn },
                // Room for a wrapped suite name to clear the next column.
                isRowValue ? { paddingRight: 8 } : {},
              ]}
            >
              {isRowValue ? null : (
                <Text style={[styles.cellLabel, { width: labelWidth(designRowLabel(cell.label)) }]}>
                  {designRowLabel(cell.label)}
                </Text>
              )}
              <Text style={styles.cellValue}>{value}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}
