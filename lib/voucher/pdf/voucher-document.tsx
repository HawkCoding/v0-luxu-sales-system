import { Document, Page, Text, View } from "@react-pdf/renderer"
import type { VoucherData } from "@/lib/generate-voucher"
import { sortedVoucherServiceBlocks } from "@/lib/generate-voucher"
import type { DocumentBrand } from "@/lib/settings-access"
import type { VoucherSectionKey, VoucherTemplate } from "@/lib/types"
import { VOUCHER_TEMPLATE_DEFAULTS } from "@/lib/types"
import { registerDocumentFonts, resolveDocumentFontPairing } from "@/lib/pdf/document-fonts"
import { voucherStyles } from "./styles"
import { HeaderBanner } from "./sections/header-banner"
import { GuestInfo } from "./sections/guest-info"
import { ServiceProvider } from "./sections/service-provider"
import { ServiceBlock } from "./sections/service-block"
import { VoucherFooter } from "./sections/footer"

export interface VoucherDocumentProps {
  data: VoucherData
  template?: VoucherTemplate | null
  docTitle?: string
  /** Shared brand copy for the masthead; omitted keeps the template's own text. */
  brand?: DocumentBrand
}

function normalizeTemplate(template?: VoucherTemplate | null): VoucherTemplate {
  return { ...VOUCHER_TEMPLATE_DEFAULTS, ...template }
}

function sectionFor(key: VoucherSectionKey, data: VoucherData, template: VoucherTemplate, styles: ReturnType<typeof voucherStyles>) {
  if (key === "guest_info") return <GuestInfo key={key} data={data} styles={styles} />
  if (key === "service_provider") {
    const blocks = data.serviceBlocks ?? []
    if (blocks.length === 0) {
      return (
        <View key={key}>
          <ServiceProvider data={data} styles={styles} />
          <Text style={styles.endOfServices}>End of Services</Text>
        </View>
      )
    }
    return (
      <View key={key}>
        {sortedVoucherServiceBlocks(blocks).map((block, idx) => (
          <ServiceBlock key={`${block.serviceType}-${idx}`} block={block} styles={styles} />
        ))}
        <Text style={styles.endOfServices}>End of Services</Text>
      </View>
    )
  }
  if (key === "footer") return <VoucherFooter key={key} template={template} styles={styles} />
  return null
}

export function VoucherDocument({ data, template, docTitle = "TRAVEL VOUCHERS", brand }: VoucherDocumentProps) {
  registerDocumentFonts()

  const t = normalizeTemplate(template)
  const styles = voucherStyles({
    accentColour: t.accent_colour,
    sectionBg: t.section_bg,
    fonts: resolveDocumentFontPairing(t.font_family),
  })
  const sectionOrder = t.section_order.length > 0 ? t.section_order : VOUCHER_TEMPLATE_DEFAULTS.section_order
  const hiddenSections = new Set(t.hidden_sections)

  return (
    <Document
      author="Luxus Travel & Tours"
      subject={`Travel voucher ${data.voucherNumber}`}
      title={`Travel Voucher - ${data.voucherNumber}`}
    >
      <Page size="A4" style={styles.page}>
        <View fixed style={styles.frameOuter} />
        <View fixed style={styles.frameInner} />

        <HeaderBanner template={t} styles={styles} brand={brand} />

        <View style={styles.voucherNumberRow}>
          <Text style={styles.title}>{docTitle}</Text>
          <View style={styles.voucherStub}>
            <Text style={styles.voucherStubLabel}>Voucher no.</Text>
            <Text style={styles.voucherStubNumber}>{data.voucherNumber}</Text>
          </View>
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
