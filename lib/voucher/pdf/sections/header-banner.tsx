import { Image, Text, View } from "@react-pdf/renderer"
import type { BrandLogoImage } from "@/lib/pdf/brand-logo"
import type { DocumentBrand } from "@/lib/settings-access"
import type { voucherStyles } from "../styles"

type Styles = ReturnType<typeof voucherStyles>

interface HeaderBannerProps {
  styles: Styles
  /** Shared brand copy — heading, sub-heading and logo all come from the brand block, so
   * every document (quote, invoice, voucher, itinerary) stays in step with one setting. */
  brand?: DocumentBrand
  /** Logo resolved to embeddable bytes; a URL string is not reliable for react-pdf's
   * <Image> during server-side rendering (see lib/pdf/brand-logo.ts). */
  brandLogo?: BrandLogoImage | null
}

export function HeaderBanner({ styles, brand, brandLogo }: HeaderBannerProps) {
  const heading = brand?.heading ?? ""
  const subheading = brand?.subheading ?? ""

  if (brandLogo) {
    return (
      <View style={[styles.header, styles.headerLogoOnly]}>
        <Image src={brandLogo} style={styles.headerLogoCenter} />
        <Text style={styles.productLine}>{heading}</Text>
        <Text style={styles.headerSubtitle}>{subheading}</Text>
      </View>
    )
  }

  return (
    <View style={[styles.header, styles.headerTextOnly]}>
      <Text style={styles.productLine}>{heading}</Text>
      <Text style={styles.headerSubtitle}>{subheading}</Text>
    </View>
  )
}
