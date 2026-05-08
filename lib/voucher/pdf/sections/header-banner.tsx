import { Image, Text, View } from "@react-pdf/renderer"
import type { VoucherTemplate } from "@/lib/types"
import type { voucherStyles } from "../styles"

type Styles = ReturnType<typeof voucherStyles>

interface HeaderBannerProps {
  template: VoucherTemplate
  styles: Styles
}

export function HeaderBanner({ template, styles }: HeaderBannerProps) {
  const hasLogo = Boolean(template.logo_url)
  const hasBanner = Boolean(template.banner_url)

  if (hasLogo && hasBanner) {
    return (
      <View style={[styles.header, styles.headerSplit]}>
        <View style={styles.headerLogoSide}>
          <Image src={template.logo_url ?? ""} style={styles.headerLogo} />
        </View>
        <View style={styles.headerBannerSide}>
          <Image src={template.banner_url ?? ""} style={styles.headerBanner} />
          <View style={styles.headerTextOverlay}>
            <Text style={styles.overlayProductLine}>{template.product_line}</Text>
            <Text style={styles.overlaySubtitle}>{template.header_text}</Text>
          </View>
        </View>
      </View>
    )
  }

  if (hasLogo) {
    return (
      <View style={[styles.header, styles.headerLogoOnly]}>
        <Image src={template.logo_url ?? ""} style={styles.headerLogoCenter} />
        <Text style={styles.productLine}>{template.product_line}</Text>
        <Text style={styles.headerSubtitle}>{template.header_text}</Text>
      </View>
    )
  }

  if (hasBanner) {
    return (
      <View style={[styles.header, styles.headerBannerOnly]}>
        <Image src={template.banner_url ?? ""} style={styles.headerBannerFull} />
        <View style={styles.headerTextBelow}>
          <Text style={styles.productLine}>{template.product_line}</Text>
          <Text style={styles.headerSubtitle}>{template.header_text}</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.header, styles.headerTextOnly]}>
      <Text style={styles.productLine}>{template.product_line}</Text>
      <Text style={styles.headerSubtitle}>{template.header_text}</Text>
    </View>
  )
}
