import { Image, StyleSheet, Text, View } from "@react-pdf/renderer"
import type { BrandLogoImage } from "@/lib/pdf/brand-logo"
import type { DocumentBrand } from "@/lib/settings-access"

export type BrandBlockPlacement = "top" | "bottom"

interface BrandBlockProps {
  brand: DocumentBrand
  /** Resolved logo bytes, or null to render the text lines alone. */
  logoImage: BrandLogoImage | null
  /**
   * `top` renders the large letterhead treatment (bigger seal, bold heading,
   * rule beneath); `bottom` the small, quiet footer treatment.
   */
  placement: BrandBlockPlacement
}

/**
 * The SARAIL brand mark shared by the quote and invoice PDFs. The invoice's own
 * page header is a separate, meta-bearing letterhead that mirrors the `top`
 * styling here; this component covers every other slot.
 */
export function BrandBlock({ brand, logoImage, placement }: BrandBlockProps) {
  const s = placement === "top" ? topStyles : bottomStyles
  return (
    <View style={s.block}>
      {logoImage ? <Image src={logoImage} style={s.seal} /> : null}
      <View style={s.text}>
        <Text style={s.heading}>{brand.heading}</Text>
        <Text style={s.subheading}>{brand.subheading}</Text>
      </View>
    </View>
  )
}

// Lifted from the invoice header (headerSeal/headerBrand/headerDivision/
// headerProduct) so a top-placed block reads as a letterhead.
const topStyles = StyleSheet.create({
  block: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "#8b5a2b",
    paddingBottom: 10,
    marginBottom: 12,
  },
  seal: {
    width: 58,
    height: 58,
    objectFit: "contain",
    marginRight: 12,
  },
  text: {
    flex: 1,
    alignItems: "center",
  },
  heading: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: "#172018",
  },
  subheading: {
    fontSize: 7.5,
    color: "#8a7f74",
    letterSpacing: 0.6,
    marginTop: 3,
  },
})

// Lifted from the previous footer-brand-block: quiet, centred.
const bottomStyles = StyleSheet.create({
  block: {
    marginTop: 16,
    alignItems: "center",
  },
  seal: {
    width: 42,
    height: 42,
    objectFit: "contain",
    marginBottom: 5,
  },
  text: {
    alignItems: "center",
  },
  heading: {
    fontSize: 9,
    color: "#554c42",
  },
  subheading: {
    fontSize: 7.5,
    color: "#8a7f74",
    letterSpacing: 0.6,
    marginTop: 2,
  },
})
