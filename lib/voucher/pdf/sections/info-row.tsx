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
  /** Let a cell take as many of the three columns as its `span` says — the suite/room name then
   * runs across the first two on one line and "QTY" lines up with "Infants". Off, every cell takes
   * one column (the itinerary still lays its rows out that way). */
  honourSpans?: boolean
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
 * repeats the row's own label (the suite/room name) prints its value alone and wraps inside its
 * column(s), so "QTY" always lines up with a Guests column whatever the booking's suite is called.
 */
export function CellRow({ label, cells, styles, honourSpans = false }: CellRowProps) {
  const [firstColumn] = VOUCHER_CELL_COLUMNS
  let column = 0
  return (
    <View style={styles.infoRow} wrap={false}>
      <Text style={styles.infoLabel}>{designRowLabel(label)}</Text>
      <View style={styles.cellGroup}>
        {cells.map((cell, idx) => {
          const isRowValue = cell.label === label
          const value = String(cell.value ?? "")
          const start = column
          column += honourSpans ? Math.max(1, Math.floor(cell.span ?? 1)) : 1
          // Fixed width while the cell stays within the two sized columns; reaching the third, it
          // takes the rest of the row.
          const width =
            column <= VOUCHER_CELL_COLUMNS.length
              ? VOUCHER_CELL_COLUMNS.slice(start, column).reduce((sum, w) => sum + w, 0)
              : undefined
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
