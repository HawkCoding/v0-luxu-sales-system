import { Document, Page, Text, View } from "@react-pdf/renderer"
import {
  FOOTER_BRAND_DIVISION_LINE,
  FOOTER_BRAND_PRODUCT_LINE,
} from "@/lib/assets/footer-brand"
import type { VoucherData, VoucherServiceBlock } from "@/lib/generate-voucher"
import { sortedVoucherServiceBlocks } from "@/lib/generate-voucher"
import type { BrandLogoImage } from "@/lib/pdf/brand-logo"
import { registerDocumentFonts } from "@/lib/pdf/document-fonts"
import {
  DocumentFooter,
  DocumentHeader,
  PageBackground,
  buildDocumentFooterLines,
  displayDocumentTitle,
  type DocumentFooterCompany,
} from "@/lib/pdf/sarail-design"
import type { DocumentBrand } from "@/lib/settings-access"
import type { VoucherSectionKey, VoucherTemplate } from "@/lib/types"
import { VOUCHER_TEMPLATE_DEFAULTS } from "@/lib/types"
import { VOUCHER_PAGE_PADDING, voucherStyles, type VoucherStyles } from "./styles"
import { GuestInfo } from "./sections/guest-info"
import { ServiceProvider } from "./sections/service-provider"
import { ServiceBlock, serviceBlockFitsOnOnePage } from "./sections/service-block"

export interface VoucherDocumentProps {
  data: VoucherData
  template?: VoucherTemplate | null
  docTitle?: string
  /** Shared brand copy for the letterhead. */
  brand?: DocumentBrand
  /** Brand logo resolved to embeddable bytes (see lib/pdf/brand-logo.ts). */
  brandLogo?: BrandLogoImage | null
  /** Company details for the first page's footer. */
  company?: DocumentFooterCompany
}

function normalizeTemplate(template?: VoucherTemplate | null): VoucherTemplate {
  return { ...VOUCHER_TEMPLATE_DEFAULTS, ...template }
}

/** "End Of Services": the 21.7 gap plus one 10pt line. */
const CLOSING_HEIGHT = 21.7 + 13.7

function sectionFor(key: VoucherSectionKey, data: VoucherData, template: VoucherTemplate, styles: VoucherStyles) {
  if (key === "guest_info") {
    return <GuestInfo key={key} data={data} styles={styles} guidance={template.guidance_text} />
  }
  if (key === "service_provider") {
    const blocks = sortedVoucherServiceBlocks(data.serviceBlocks ?? [])
    const last = blocks.at(-1)
    const closing = <Text style={styles.endOfServices}>End Of Services. Thank you</Text>
    const blockFor = (block: VoucherServiceBlock, idx: number) => (
      <ServiceBlock
        key={`${block.serviceType}-${idx}`}
        block={block}
        styles={styles}
        showDescription={false}
        showInclusions={false}
        wideSuiteName
      />
    )
    // The closing line travels with the last block, so "End Of Services" never sits alone on a
    // page — unless the block and the closing line together would not fit one page, when the block
    // goes on its own (whole, or breaking if it is taller than a page) and the closing line follows.
    const lastKeptWhole = last
      ? serviceBlockFitsOnOnePage(last, { showDescription: false, showInclusions: false, wideSuiteName: true }, CLOSING_HEIGHT)
      : true
    return (
      <View key={key}>
        {blocks.length === 0 ? <ServiceProvider data={data} styles={styles} /> : blocks.slice(0, -1).map(blockFor)}
        {last && !lastKeptWhole ? (
          <>
            {blockFor(last, blocks.length - 1)}
            <View wrap={false}>{closing}</View>
          </>
        ) : (
          <View wrap={false}>
            {last ? blockFor(last, blocks.length - 1) : null}
            {closing}
          </View>
        )}
      </View>
    )
  }
  // "footer" is the company footer on the first page — drawn by the Page itself, see below.
  return null
}

export function VoucherDocument({
  data,
  template,
  docTitle = "Travel Vouchers",
  brand,
  brandLogo = null,
  company,
}: VoucherDocumentProps) {
  registerDocumentFonts()

  const t = normalizeTemplate(template)
  const styles = voucherStyles()
  const sectionOrder = t.section_order.length > 0 ? t.section_order : VOUCHER_TEMPLATE_DEFAULTS.section_order
  const hiddenSections = new Set(t.hidden_sections)
  const visibleSections = sectionOrder.filter((key) => !hiddenSections.has(key))
  const resolvedBrand: DocumentBrand = brand ?? {
    heading: FOOTER_BRAND_PRODUCT_LINE,
    subheading: FOOTER_BRAND_DIVISION_LINE,
    logoUrl: null,
  }
  const footerLines = hiddenSections.has("footer") ? [] : buildDocumentFooterLines(company ?? {})

  return (
    <Document
      author="Luxus Travel & Tours"
      subject={`Travel voucher ${data.voucherNumber}`}
      title={`Travel Voucher - ${data.voucherNumber}`}
    >
      <Page size="A4" style={styles.page}>
        <PageBackground />
        <DocumentHeader brand={resolvedBrand} logo={brandLogo} padding={VOUCHER_PAGE_PADDING} />

        <View style={styles.titleRow}>
          <Text style={styles.title}>{displayDocumentTitle(docTitle) || "Travel Vouchers"}</Text>
          <View style={styles.reference}>
            <Text style={styles.referenceLabel}>Reference Nr:</Text>
            <Text style={styles.referenceValue}>{data.voucherNumber}</Text>
          </View>
        </View>

        {/* Without the guest box the hand-over note still prints, just on its own. */}
        {!visibleSections.includes("guest_info") && t.guidance_text?.trim() ? (
          <Text style={[styles.guidanceStandalone, { marginTop: 4.3 }]}>{t.guidance_text.trim()}</Text>
        ) : null}

        {visibleSections.map((key) => sectionFor(key, data, t, styles))}

        <DocumentFooter lines={footerLines} />
      </Page>
    </Document>
  )
}
