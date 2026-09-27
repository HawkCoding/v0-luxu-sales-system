import { Text, View } from "@react-pdf/renderer"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { voucherServiceTypeLabel } from "@/lib/generate-voucher"
import { nestBulletLines, parseBulletLines, type NestedBulletLine } from "@/lib/inclusions/bullet-lines"
import { NestedBulletList, PAGE_BOTTOM, PAGE_HEIGHT, PAGE_TOP, designRowLabel } from "@/lib/pdf/sarail-design"
import { voucherProviderContactLine, voucherRowsForBlock, type VoucherRow } from "@/lib/voucher/service-block-rows"
import type { VoucherStyles } from "../styles"
import { CellRow, InfoRow } from "./info-row"

interface ServiceBlockProps {
  block: VoucherServiceBlock
  styles: VoucherStyles
  /** Print the client-facing supplier blurb. The voucher turns this off — it's operational
   * paperwork, not sales copy — the itinerary keeps it on since it sells the property. */
  showDescription?: boolean
  /** Print train and hotel inclusions, as the quote's nested bullet list under an "Included:"
   * label. The voucher turns this off for the same reason as the blurb above — what the package
   * includes was already sold on the quote and the itinerary; the voucher only needs what was
   * booked and where to be. */
  showInclusions?: boolean
}

/** Kinds whose inclusions print — the same two the single-line "Included" row covered. */
const INCLUSION_KINDS = new Set<VoucherServiceBlock["serviceType"]>(["train", "hotel"])

interface BlockContent {
  title: string
  rows: VoucherRow[]
  inclusions: NestedBulletLine[]
  name: string
  contactLine: string | null
  paragraphs: string[]
  footnote: string | null
}

function blockContent(block: VoucherServiceBlock, showDescription: boolean, showInclusions: boolean): BlockContent {
  const description = showDescription ? block.contactDetails.description?.trim() || null : null
  return {
    title: block.title || voucherServiceTypeLabel(block.serviceType),
    // Inclusions print as a bullet list below the rows rather than as one run-on "Included" value.
    rows: voucherRowsForBlock(block, { showInclusions: false }),
    inclusions:
      showInclusions && INCLUSION_KINDS.has(block.serviceType)
        ? nestBulletLines(parseBulletLines(block.serviceData.inclusions))
        : [],
    name: block.contactDetails.name ?? "",
    contactLine: voucherProviderContactLine(block.contactDetails, block.serviceType),
    paragraphs: (description ?? "").split(/\n+/).map((paragraph) => paragraph.trim()).filter(Boolean),
    footnote: block.serviceData.footnote ?? null,
  }
}

/** The room a block has on a page of its own: y 55 → 813.9. */
const PAGE_BODY_HEIGHT = PAGE_HEIGHT - PAGE_TOP - PAGE_BOTTOM
/** The estimate below runs a little high on purpose; this margin covers what it can still miss. */
const KEEP_WHOLE_LIMIT = PAGE_BODY_HEIGHT - 40

/** Characters per line at each text size, over each column's width — rounded down so a line
 * count is never short. */
const CHARS = { rowValue: 86, cellValue: 27, contact: 150, paragraph: 110, bullet: 80, footnote: 110 }

/** Printed lines of a value: each typed line break starts a new line, and each segment wraps. */
function lines(text: string | number | null | undefined, perLine: number): number {
  return String(text ?? "")
    .split("\n")
    .reduce((sum, segment) => sum + Math.max(1, Math.ceil(segment.length / perLine)), 0)
}

/**
 * The block's printed height, estimated before layout (react-pdf measures nothing up front). Used
 * only to decide whether the block can be kept whole. It errs tall: a block wrongly judged too tall
 * merely breaks across pages, while one wrongly kept whole would be clipped at the page foot.
 */
export function estimatedBlockHeight(content: BlockContent): number {
  let height = 10.3 + 13.7 // top padding + provider name
  if (content.contactLine) height += 3.5 + 8.2 * lines(content.contactLine, CHARS.contact)
  for (const paragraph of content.paragraphs) height += 8 + 10.7 * lines(paragraph, CHARS.paragraph)
  height += 8.7 // gap above the rows
  for (const row of content.rows) {
    const rowLines = row.cells
      ? Math.max(...row.cells.map((cell) => lines(cell.value, cell.label === row.label ? CHARS.cellValue : CHARS.rowValue)))
      : lines(row.value, CHARS.rowValue)
    height += 11.1 * rowLines
  }
  for (const line of content.inclusions) height += 10.7 * lines(line.text, CHARS.bullet) + (line.level === 0 ? 3 : 0)
  if (content.footnote) height += 4 + 9.1 * lines(content.footnote, CHARS.footnote)
  return height + 12.7 // bottom padding
}

/**
 * Whether a block is short enough to be kept whole — the rule every voucher block follows.
 * `followedBy` adds whatever must stay on the same page after it (the voucher's closing line and
 * the footer's clearance), for a caller deciding whether the two can travel as one group.
 */
export function serviceBlockFitsOnOnePage(
  block: VoucherServiceBlock,
  { showDescription = true, showInclusions = true }: Omit<ServiceBlockProps, "block" | "styles"> = {},
  followedBy = 0,
): boolean {
  return estimatedBlockHeight(blockContent(block, showDescription, showInclusions)) + followedBy <= KEEP_WHOLE_LIMIT
}

/**
 * One supplier's voucher block: a Swirl box headed by the provider's name and contact line, then
 * its rows. The template's rule is that a block always stays together — it moves whole to the next
 * page rather than splitting — so the box only breaks when it is taller than a page on its own.
 */
export function ServiceBlock({ block, styles, showDescription = true, showInclusions = true }: ServiceBlockProps) {
  const content = blockContent(block, showDescription, showInclusions)
  const { title, rows, inclusions, name, contactLine, paragraphs, footnote } = content
  const keepWhole = estimatedBlockHeight(content) <= KEEP_WHOLE_LIMIT

  return (
    <View style={[styles.box, { paddingTop: 0 }]} wrap={!keepWhole}>
      {/* The box's top padding as a `fixed` child: react-pdf strips a breaking box's padding from
          the part carried to the next page, but repeats fixed children on every part. */}
      <View fixed style={{ height: 10.3 }} />
      <Text style={styles.providerName}>{name || title}</Text>
      {contactLine ? <Text style={styles.providerContact}>{contactLine}</Text> : null}
      {paragraphs.map((paragraph, idx) => (
        <Text key={idx} style={[styles.providerDescription, idx > 0 ? { marginTop: 3 } : {}]}>
          {paragraph}
        </Text>
      ))}
      <View style={styles.rows}>
        {rows.map((row, idx) =>
          row.cells ? (
            <CellRow key={`${block.serviceType}-${idx}`} label={row.label} cells={row.cells} styles={styles} />
          ) : (
            <InfoRow key={`${block.serviceType}-${idx}`} label={row.label} value={row.value ?? ""} styles={styles} />
          ),
        )}
        {inclusions.length > 0 ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{designRowLabel("Included")}</Text>
            <View style={{ flex: 1 }}>
              <NestedBulletList lines={inclusions} />
            </View>
          </View>
        ) : null}
      </View>
      {footnote ? <Text style={styles.providerFootnote}>{footnote}</Text> : null}
    </View>
  )
}
