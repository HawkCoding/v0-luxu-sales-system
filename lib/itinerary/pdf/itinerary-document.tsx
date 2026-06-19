import { Document, Page, Text, View } from "@react-pdf/renderer"
import { StyleSheet } from "@react-pdf/renderer"
import type { ItineraryData } from "@/lib/itinerary/build-itinerary"
import type { VoucherTemplate } from "@/lib/types"
import { VOUCHER_TEMPLATE_DEFAULTS } from "@/lib/types"
import { registerVoucherFonts, resolveVoucherFontFamily } from "@/lib/voucher/pdf/fonts"
import { voucherStyles } from "@/lib/voucher/pdf/styles"
import { HeaderBanner } from "@/lib/voucher/pdf/sections/header-banner"
import { VoucherFooter } from "@/lib/voucher/pdf/sections/footer"
import { ServiceBlock } from "@/lib/voucher/pdf/sections/service-block"
import { sortedVoucherServiceBlocks } from "@/lib/generate-voucher"

export interface ItineraryDocumentProps {
  data: ItineraryData
  template?: VoucherTemplate | null
}

function normalizeTemplate(t?: VoucherTemplate | null): VoucherTemplate {
  return { ...VOUCHER_TEMPLATE_DEFAULTS, ...t }
}

export function ItineraryDocument({ data, template }: ItineraryDocumentProps) {
  registerVoucherFonts()

  const t = normalizeTemplate(template)
  const fontFamily = resolveVoucherFontFamily(t.font_family)
  const styles = voucherStyles({
    accentColour: t.accent_colour,
    sectionBg: t.section_bg,
    fontFamily,
  })

  const extra = StyleSheet.create({
    titleRow: {
      alignItems: "flex-start",
      flexDirection: "column",
      marginBottom: 6,
      marginTop: 16,
    },
    tripTitle: {
      color: t.accent_colour,
      fontSize: 18,
      fontWeight: 700,
    },
    ref: {
      color: "#888888",
      fontSize: 9,
      marginTop: 2,
    },
    guestRow: {
      flexDirection: "row",
      marginBottom: 12,
      marginTop: 4,
    },
    guestLabel: {
      color: "#555555",
      fontSize: 10,
      fontWeight: 700,
      width: 90,
    },
    guestValue: {
      color: "#333333",
      flex: 1,
      fontSize: 10,
    },
    notesBox: {
      backgroundColor: "#f8f5f0",
      borderLeftColor: t.accent_colour,
      borderLeftWidth: 3,
      color: "#444444",
      fontSize: 10,
      lineHeight: 1.5,
      marginBottom: 20,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    journeyHeading: {
      backgroundColor: t.section_bg,
      borderRadius: 2,
      color: "#ffffff",
      fontSize: 12,
      fontWeight: 700,
      marginBottom: 14,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
  })

  const sorted = sortedVoucherServiceBlocks(data.serviceBlocks)

  return (
    <Document
      author="Luxus Travel & Tours"
      subject={`Itinerary for ${data.bookingNumber}`}
      title={data.tripTitle || `Itinerary — ${data.bookingNumber}`}
    >
      <Page size="A4" style={styles.page}>
        <HeaderBanner template={t} styles={styles} />

        <View style={extra.titleRow}>
          <Text style={extra.tripTitle}>{data.tripTitle || "Your Itinerary"}</Text>
          <Text style={extra.ref}>Booking ref: {data.bookingNumber}</Text>
        </View>

        <View style={extra.guestRow}>
          <Text style={extra.guestLabel}>Guests:</Text>
          <Text style={extra.guestValue}>{data.guestNames}</Text>
        </View>
        <View style={extra.guestRow}>
          <Text style={extra.guestLabel}>Departure:</Text>
          <Text style={extra.guestValue}>{data.departure}</Text>
        </View>

        {data.tripNotes ? (
          <Text style={extra.notesBox}>{data.tripNotes}</Text>
        ) : null}

        {sorted.length > 0 ? (
          <>
            <Text style={extra.journeyHeading}>Your Journey</Text>
            {sorted.map((block, idx) => (
              <ServiceBlock
                key={`${block.serviceType}-${idx}`}
                block={block}
                styles={styles}
              />
            ))}
          </>
        ) : null}

        <VoucherFooter template={t} styles={styles} />

        <Text
          fixed
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          style={styles.pageNumber}
        />
      </Page>
    </Document>
  )
}
