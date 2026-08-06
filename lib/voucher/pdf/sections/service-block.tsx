import { Text, View } from "@react-pdf/renderer"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { voucherServiceTypeLabel } from "@/lib/generate-voucher"
import { voucherProviderContactLine, voucherRowsForBlock, type VoucherRow } from "@/lib/voucher/service-block-rows"
import type { DocumentDensity } from "../density"
import { DENSITY } from "../density"
import type { voucherStyles } from "../styles"
import { CellRow, InfoRow } from "./info-row"

type Styles = ReturnType<typeof voucherStyles>

interface ServiceBlockProps {
  block: VoucherServiceBlock
  styles: Styles
  density?: DocumentDensity
  /** Print the letterspaced eyebrow above the provider name. The voucher turns this off since
   * the provider name (e.g. "Blue Train") already repeats what the eyebrow says (e.g. "Blue
   * Train Service") — the itinerary keeps it on for its more editorial layout. */
  showEyebrow?: boolean
  /** Print the client-facing supplier blurb. The voucher turns this off — it's operational
   * paperwork, not sales copy — the itinerary keeps it on since it sells the property. */
  showDescription?: boolean
}

function rowChars(row: VoucherRow): number {
  if (row.cells) return row.cells.reduce((sum, cell) => sum + cell.label.length + String(cell.value).length, 0)
  return row.label.length + String(row.value ?? "").length
}

function fitsOnOnePage(rows: VoucherRow[], extra: string, charBudget: number): boolean {
  const chars = rows.reduce((sum, row) => sum + rowChars(row), extra.length)
  return chars <= charBudget
}

export function ServiceBlock({ block, styles, density = "comfortable", showEyebrow = true, showDescription = true }: ServiceBlockProps) {
  const title = block.title || voucherServiceTypeLabel(block.serviceType)
  const rows = voucherRowsForBlock(block)
  const name = block.contactDetails.name ?? ""
  const contactLine = voucherProviderContactLine(block.contactDetails)
  const footnote = block.serviceData.footnote
  const charBudget = DENSITY[density].singlePageCharBudget

  return (
    <View style={styles.section} wrap={!fitsOnOnePage(rows, `${title}${name}${contactLine ?? ""}`, charBudget)}>
      {showEyebrow ? (
        <Text style={styles.sectionTitle} minPresenceAhead={60}>
          {title}
        </Text>
      ) : null}
      <View style={styles.providerBox}>
        {/* When the eyebrow is hidden (voucher), the provider name is the block's only heading,
         * so it needs the title as a fallback; with the eyebrow shown (itinerary) the original
         * behaviour — no heading line when there's no named contact — is preserved. */}
        {name || !showEyebrow ? <Text style={styles.providerName}>{name || title}</Text> : null}
        {contactLine ? <Text style={styles.providerContact}>{contactLine}</Text> : null}
        {showDescription && block.contactDetails.description ? (
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
        {footnote ? <Text style={styles.providerFootnote}>{footnote}</Text> : null}
      </View>
    </View>
  )
}
