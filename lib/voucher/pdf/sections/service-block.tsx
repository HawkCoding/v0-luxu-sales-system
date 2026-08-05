import { Text, View } from "@react-pdf/renderer"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { voucherServiceTypeLabel } from "@/lib/generate-voucher"
import { voucherProviderContactLine, voucherRowsForBlock, type VoucherRow } from "@/lib/voucher/service-block-rows"
import type { voucherStyles } from "../styles"
import { CellRow, InfoRow } from "./info-row"

type Styles = ReturnType<typeof voucherStyles>

interface ServiceBlockProps {
  block: VoucherServiceBlock
  styles: Styles
}

// A block that cannot physically fit on one page must stay wrappable, otherwise
// react-pdf clips the overflow instead of continuing it. Rough character budget
// for a full A4 content column at these type sizes.
const SINGLE_PAGE_CHAR_BUDGET = 1800

function rowChars(row: VoucherRow): number {
  if (row.cells) return row.cells.reduce((sum, cell) => sum + cell.label.length + String(cell.value).length, 0)
  return row.label.length + String(row.value ?? "").length
}

function fitsOnOnePage(rows: VoucherRow[], extra: string): boolean {
  const chars = rows.reduce((sum, row) => sum + rowChars(row), extra.length)
  return chars <= SINGLE_PAGE_CHAR_BUDGET
}

export function ServiceBlock({ block, styles }: ServiceBlockProps) {
  const title = block.title || voucherServiceTypeLabel(block.serviceType)
  const rows = voucherRowsForBlock(block)
  const name = block.contactDetails.name ?? ""
  const contactLine = voucherProviderContactLine(block.contactDetails)

  return (
    <View style={styles.section} wrap={!fitsOnOnePage(rows, `${title}${name}${contactLine ?? ""}`)}>
      <Text style={styles.sectionTitle} minPresenceAhead={60}>
        {title}
      </Text>
      <View style={styles.providerBox}>
        {name ? <Text style={styles.providerName}>{name}</Text> : null}
        {contactLine ? <Text style={styles.providerContact}>{contactLine}</Text> : null}
        {block.contactDetails.description ? (
          <Text style={styles.providerDescription}>{block.contactDetails.description}</Text>
        ) : null}
        {rows.map((row, idx) =>
          row.cells ? (
            <CellRow key={`${block.serviceType}-${idx}`} cells={row.cells} styles={styles} dotted />
          ) : (
            <InfoRow
              key={`${block.serviceType}-${idx}`}
              label={row.label}
              value={row.value ?? ""}
              styles={styles}
              dotted
            />
          ),
        )}
      </View>
    </View>
  )
}
