import { Document, Page, Text, View } from "@react-pdf/renderer"
import type { VoucherData } from "@/lib/generate-voucher"
import { sortedVoucherServiceBlocks } from "@/lib/generate-voucher"
import type { VoucherSectionKey, VoucherTemplate } from "@/lib/types"
import { VOUCHER_TEMPLATE_DEFAULTS } from "@/lib/types"
import { BRAND_NAME } from "@/lib/brand"
import { registerVoucherFonts, resolveVoucherFontFamily } from "./fonts"
import { voucherStyles } from "./styles"
import { HeaderBanner } from "./sections/header-banner"
import { GuestInfo } from "./sections/guest-info"
import { ServiceProvider } from "./sections/service-provider"
import { ServiceBlock } from "./sections/service-block"
import { VoucherFooter } from "./sections/footer"

export interface VoucherDocumentProps {
  data: VoucherData
  template?: VoucherTemplate | null
}

function normalizeTemplate(template?: VoucherTemplate | null): VoucherTemplate {
  return { ...VOUCHER_TEMPLATE_DEFAULTS, ...template }
}

function sectionFor(key: VoucherSectionKey, data: VoucherData, template: VoucherTemplate, styles: ReturnType<typeof voucherStyles>) {
  if (key === "guest_info") return <GuestInfo key={key} data={data} styles={styles} />
  if (key === "service_provider") {
    const blocks = data.serviceBlocks ?? []
    if (blocks.length === 0) return <ServiceProvider key={key} data={data} styles={styles} />
    return (
      <View key={key}>
        {sortedVoucherServiceBlocks(blocks).map((block, idx) => (
          <ServiceBlock key={`${block.serviceType}-${idx}`} block={block} styles={styles} />
        ))}
      </View>
    )
  }
  if (key === "footer") return <VoucherFooter key={key} template={template} styles={styles} />
  return null
}

export function VoucherDocument({ data, template }: VoucherDocumentProps) {
  registerVoucherFonts()

  const t = normalizeTemplate(template)
  const styles = voucherStyles({
    accentColour: t.accent_colour,
    sectionBg: t.section_bg,
    fontFamily: resolveVoucherFontFamily(t.font_family),
  })
  const sectionOrder = t.section_order.length > 0 ? t.section_order : VOUCHER_TEMPLATE_DEFAULTS.section_order
  const hiddenSections = new Set(t.hidden_sections)

  return (
    <Document
      author={BRAND_NAME}
      subject={`Travel voucher ${data.voucherNumber}`}
      title={`Travel Voucher - ${data.voucherNumber}`}
    >
      <Page size="A4" style={styles.page}>
        <HeaderBanner template={t} styles={styles} />

        <View style={styles.voucherNumberRow}>
          <Text style={styles.title}>TRAVEL VOUCHERS</Text>
          <Text style={styles.voucherBadge}>Voucher no. {data.voucherNumber}</Text>
        </View>

        {t.guidance_text ? <Text style={styles.guidance}>{t.guidance_text}</Text> : null}

        {sectionOrder
          .filter((key) => !hiddenSections.has(key))
          .map((key) => sectionFor(key, data, t, styles))}

        <Text
          fixed
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          style={styles.pageNumber}
        />
      </Page>
    </Document>
  )
}
