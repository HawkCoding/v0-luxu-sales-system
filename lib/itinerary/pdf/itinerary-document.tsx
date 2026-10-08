import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer"
import {
  FOOTER_BRAND_DIVISION_LINE,
  FOOTER_BRAND_PRODUCT_LINE,
} from "@/lib/assets/footer-brand"
import type { ItineraryData } from "@/lib/itinerary/build-itinerary"
import { sortItineraryBlocksChronologically } from "@/lib/itinerary/sort-blocks"
import type { BrandLogoImage } from "@/lib/pdf/brand-logo"
import { registerDocumentFonts } from "@/lib/pdf/document-fonts"
import {
  BOLD,
  DESIGN_COLORS,
  DocumentFooter,
  DocumentHeader,
  PageBackground,
  RULE_WIDTH,
  buildDocumentFooterLines,
  withColon,
  type DocumentFooterCompany,
} from "@/lib/pdf/sarail-design"
import type { DocumentBrand } from "@/lib/settings-access"
import type { VoucherTemplate } from "@/lib/types"
import { VOUCHER_TEMPLATE_DEFAULTS } from "@/lib/types"
import { joinGuestNames } from "@/lib/voucher/pdf/sections/guest-info"
import { InfoRow } from "@/lib/voucher/pdf/sections/info-row"
import { ServiceBlock } from "@/lib/voucher/pdf/sections/service-block"
import { VOUCHER_PAGE_PADDING, voucherStyles } from "@/lib/voucher/pdf/styles"

export interface ItineraryDocumentProps {
  data: ItineraryData
  template?: VoucherTemplate | null
  journeyHeading?: string
  introText?: string
  /** Shared brand copy for the letterhead. */
  brand?: DocumentBrand
  /** Brand logo resolved to embeddable bytes (see lib/pdf/brand-logo.ts). */
  brandLogo?: BrandLogoImage | null
  /** Company details for the first page's footer. */
  company?: DocumentFooterCompany
}

function normalizeTemplate(t?: VoucherTemplate | null): VoucherTemplate {
  return { ...VOUCHER_TEMPLATE_DEFAULTS, ...t }
}

// The itinerary has no template of its own in the design hand-over; it wears the voucher's
// (patterned page, letterhead, Swirl boxes) so every client document reads as one family, and its
// footer is the shared one the brief says "matches the itineraries".
const extra = StyleSheet.create({
  intro: {
    fontSize: 8,
    lineHeight: 1.4,
    marginLeft: 27.7,
    marginRight: 27.7,
    marginTop: 14.7,
  },
  notes: {
    fontSize: 8,
    lineHeight: 1.4,
  },
  journeyHeading: {
    ...BOLD,
    fontSize: 12,
    marginLeft: 27.7,
    marginRight: 27.7,
    // Boxes carry their own 14.7pt gap above them, which spaces the first one off this rule.
    marginTop: 14.7,
    paddingBottom: 5.3,
    borderBottomWidth: RULE_WIDTH,
    borderBottomColor: DESIGN_COLORS.ink,
  },
})

export function ItineraryDocument({
  data,
  template,
  journeyHeading = "Your Journey",
  introText,
  brand,
  brandLogo = null,
  company,
}: ItineraryDocumentProps) {
  registerDocumentFonts()

  const t = normalizeTemplate(template)
  const styles = voucherStyles()
  const resolvedBrand: DocumentBrand = brand ?? {
    heading: FOOTER_BRAND_PRODUCT_LINE,
    subheading: FOOTER_BRAND_DIVISION_LINE,
    logoUrl: null,
  }
  const footerLines = t.hidden_sections.includes("footer") ? [] : buildDocumentFooterLines(company ?? {})

  const sorted = sortItineraryBlocksChronologically(data.serviceBlocks)

  return (
    <Document
      author="Luxus Travel & Tours"
      subject={`Itinerary for ${data.bookingNumber}`}
      title={data.tripTitle || `Itinerary — ${data.bookingNumber}`}
    >
      <Page size="A4" style={styles.page}>
        <PageBackground />
        <DocumentHeader brand={resolvedBrand} logo={brandLogo} padding={VOUCHER_PAGE_PADDING} />

        <View style={styles.titleRow}>
          <Text style={styles.title}>{data.tripTitle || "Your Itinerary"}</Text>
          <View style={styles.reference}>
            <Text style={styles.referenceLabel}>Booking Ref:</Text>
            <Text style={styles.referenceValue}>{data.bookingNumber}</Text>
          </View>
        </View>

        <View style={[styles.box, styles.guestBox]} wrap={false}>
          <InfoRow label="Guests" value={joinGuestNames(data.guestNames)} styles={styles} />
          <InfoRow label="Departure" value={data.departure} styles={styles} />
          {data.consultantName ? <InfoRow label="Consultant" value={data.consultantName} styles={styles} /> : null}
        </View>

        {introText?.trim() ? <Text style={extra.intro}>{introText.trim()}</Text> : null}

        {data.tripNotes ? (
          <View style={styles.box} wrap={false}>
            <Text style={extra.notes}>{data.tripNotes}</Text>
          </View>
        ) : null}

        {sorted.length > 0 ? (
          <>
            <Text style={extra.journeyHeading} minPresenceAhead={80}>
              {withColon(journeyHeading)}
            </Text>
            {sorted.map((block, idx) => (
              <ServiceBlock key={`${block.serviceType}-${idx}`} block={block} styles={styles} />
            ))}
          </>
        ) : null}
        <DocumentFooter lines={footerLines} />
      </Page>
    </Document>
  )
}
