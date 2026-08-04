import { Image, Text, View } from "@react-pdf/renderer"
import { isRasterAssetUrl } from "@/lib/assets/raster-url"
import type { DocumentBrand } from "@/lib/settings-access"
import type { VoucherTemplate } from "@/lib/types"
import type { voucherStyles } from "../styles"

type Styles = ReturnType<typeof voucherStyles>

interface HeaderBannerProps {
  template: VoucherTemplate
  styles: Styles
  /**
   * Shared brand copy. The masthead heading/subheading come from here so they
   * stay in step with the quote/invoice brand block; the template still owns the
   * logo/banner imagery. Omitted falls back to the template's own text columns.
   */
  brand?: DocumentBrand
}

export function HeaderBanner({ template, styles, brand }: HeaderBannerProps) {
  const heading = brand?.heading ?? template.header_text
  const subheading = brand?.subheading ?? template.product_line
  const hasLogo = isRasterAssetUrl(template.logo_url)
  const hasBanner = isRasterAssetUrl(template.banner_url)

  if (hasLogo && hasBanner) {
    return (
      <View style={[styles.header, styles.headerSplit]}>
        <View style={styles.headerLogoSide}>
          <Image src={template.logo_url ?? ""} style={styles.headerLogo} />
        </View>
        <View style={styles.headerBannerSide}>
          <Image src={template.banner_url ?? ""} style={styles.headerBanner} />
          <View style={styles.headerTextOverlay}>
            <Text style={styles.overlayProductLine}>{heading}</Text>
            <Text style={styles.overlaySubtitle}>{subheading}</Text>
          </View>
        </View>
      </View>
    )
  }

  if (hasLogo) {
    return (
      <View style={[styles.header, styles.headerLogoOnly]}>
        <Image src={template.logo_url ?? ""} style={styles.headerLogoCenter} />
        <Text style={styles.productLine}>{heading}</Text>
        <Text style={styles.headerSubtitle}>{subheading}</Text>
      </View>
    )
  }

  if (hasBanner) {
    return (
      <View style={[styles.header, styles.headerBannerOnly]}>
        <Image src={template.banner_url ?? ""} style={styles.headerBannerFull} />
        <View style={styles.headerTextBelow}>
          <Text style={styles.productLine}>{heading}</Text>
          <Text style={styles.headerSubtitle}>{subheading}</Text>
        </View>
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
