import { StyleSheet } from "@react-pdf/renderer"
import { voucherTokens } from "./design-tokens"
import { DENSITY, type DocumentDensity } from "./density"
import type { DocumentFontPairing as VoucherFontPairing } from "@/lib/pdf/document-fonts"

export function voucherStyles({
  accentColour,
  sectionBg,
  fonts,
  density = "comfortable",
}: {
  accentColour: string
  sectionBg: string
  fonts: VoucherFontPairing
  density?: DocumentDensity
}) {
  const t = voucherTokens({ accentColour, sectionBg })
  const d = DENSITY[density]

  return StyleSheet.create({
    page: {
      color: t.ink,
      fontFamily: fonts.body,
      fontSize: 10,
      // NOTE: do not set lineHeight on the Page — react-pdf drops `fixed`
      // render-prop text (the footer page number) when a Page ancestor has
      // lineHeight. Apply lineHeight on the individual text styles instead.
      paddingBottom: d.page.paddingBottom,
      paddingHorizontal: d.page.paddingHorizontal,
      paddingTop: d.page.paddingTop,
    },
    frameOuter: {
      borderColor: t.frameOuter,
      borderWidth: 0.75,
      bottom: d.frame.outerInset,
      left: d.frame.outerInset,
      position: "absolute",
      right: d.frame.outerInset,
      top: d.frame.outerInset,
    },
    frameInner: {
      borderColor: t.frameInner,
      borderWidth: 0.5,
      bottom: d.frame.innerInset,
      left: d.frame.innerInset,
      position: "absolute",
      right: d.frame.innerInset,
      top: d.frame.innerInset,
    },
    header: {
      marginBottom: d.header.marginBottom,
    },
    headerSplit: {
      borderBottomColor: t.rule,
      borderBottomWidth: 0.5,
      flexDirection: "row",
      minHeight: d.header.minHeight,
      paddingBottom: 12,
    },
    headerLogoSide: {
      alignItems: "center",
      backgroundColor: "#ffffff",
      justifyContent: "center",
      padding: 8,
      width: 120,
    },
    headerLogo: {
      height: d.header.logoHeight,
      objectFit: "contain",
      width: d.header.logoWidth,
    },
    headerBannerSide: {
      flex: 1,
      minHeight: d.header.minHeight,
      position: "relative",
    },
    headerBanner: {
      height: d.header.bannerHeight,
      objectFit: "cover",
      width: "100%",
    },
    headerTextOverlay: {
      alignItems: "center",
      backgroundColor: "rgba(0, 0, 0, 0.35)",
      bottom: 0,
      left: 0,
      paddingHorizontal: 16,
      paddingVertical: 8,
      position: "absolute",
      right: 0,
    },
    headerLogoOnly: {
      alignItems: "center",
      borderBottomColor: t.rule,
      borderBottomWidth: 0.5,
      paddingBottom: 12,
    },
    headerLogoCenter: {
      height: d.header.logoCenterHeight,
      objectFit: "contain",
      width: d.header.logoCenterWidth,
    },
    headerBannerOnly: {
      borderBottomColor: t.rule,
      borderBottomWidth: 0.5,
      paddingBottom: 8,
    },
    headerBannerFull: {
      height: d.header.bannerFullHeight,
      objectFit: "cover",
      width: "100%",
    },
    headerTextBelow: {
      alignItems: "center",
      paddingVertical: 8,
    },
    headerTextOnly: {
      alignItems: "center",
      borderBottomColor: t.rule,
      borderBottomWidth: 0.5,
      paddingBottom: 12,
    },
    productLine: {
      color: t.accent,
      fontFamily: fonts.sans,
      fontSize: 8.5,
      fontWeight: 600,
      letterSpacing: 2,
      marginTop: 8,
      textTransform: "uppercase",
    },
    overlayProductLine: {
      color: "#ffffff",
      fontFamily: fonts.sans,
      fontSize: 8.5,
      fontWeight: 600,
      letterSpacing: 2,
      textTransform: "uppercase",
    },
    headerSubtitle: {
      color: t.inkMuted,
      fontFamily: fonts.display,
      fontSize: 9,
      fontStyle: "italic",
      marginTop: 4,
    },
    overlaySubtitle: {
      color: "rgba(255, 255, 255, 0.85)",
      fontFamily: fonts.display,
      fontSize: 9,
      fontStyle: "italic",
      marginTop: 2,
    },
    voucherNumberRow: {
      alignItems: "flex-end",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: d.voucherNumberRow.marginBottom,
      marginTop: d.voucherNumberRow.marginTop,
    },
    title: {
      color: t.accent,
      fontFamily: fonts.display,
      fontSize: d.title.fontSize,
      fontWeight: 700,
      letterSpacing: d.title.letterSpacing,
      textTransform: "uppercase",
    },
    voucherStub: {
      alignItems: "center",
      borderColor: t.accent,
      borderLeftStyle: "dashed",
      borderWidth: 0.75,
      paddingHorizontal: 12,
      paddingVertical: d.stub.paddingVertical,
    },
    voucherStubLabel: {
      color: t.inkMuted,
      fontFamily: fonts.sans,
      fontSize: 7.5,
      fontWeight: 600,
      letterSpacing: 1.5,
      textTransform: "uppercase",
    },
    voucherStubNumber: {
      color: t.accent,
      fontFamily: fonts.display,
      fontSize: d.stub.numberFontSize,
      fontWeight: 700,
      marginTop: 2,
    },
    guidance: {
      color: t.inkMuted,
      fontFamily: fonts.display,
      fontSize: d.guidance.fontSize,
      fontStyle: "italic",
      lineHeight: d.guidance.lineHeight,
      marginBottom: d.guidance.marginBottom,
      marginTop: 4,
      paddingRight: 48,
    },
    section: {
      marginBottom: d.section.marginBottom,
    },
    sectionTitle: {
      borderBottomColor: t.ruleFaint,
      borderBottomWidth: 0.5,
      color: t.eyebrow,
      fontFamily: fonts.sans,
      fontSize: d.sectionTitle.fontSize,
      fontWeight: 600,
      letterSpacing: d.sectionTitle.letterSpacing,
      marginBottom: d.sectionTitle.marginBottom,
      paddingBottom: d.sectionTitle.paddingBottom,
      textTransform: "uppercase",
    },
    infoRow: {
      flexDirection: "row",
      marginBottom: d.infoRow.marginBottom,
    },
    // Legacy tables ruled every row with a dotted line — applied inside providerBox only;
    // Guest Information uses alternating bands (infoRowShaded) instead, since that's how the
    // legacy voucher distinguished its guest table.
    // NOTE: borderBottomStyle "dotted" corrupts rendering in this react-pdf version (rows after
    // it silently drop their text) — a plain thin solid rule reads close enough to "dotted" at
    // this size and renders reliably.
    infoRowDotted: {
      borderBottomColor: t.ruleFaint,
      borderBottomWidth: 0.5,
      paddingBottom: d.infoRowDotted.paddingBottom,
    },
    infoRowShaded: {
      backgroundColor: t.rowShade,
      marginHorizontal: -6,
      paddingHorizontal: d.infoRowShaded.paddingHorizontal,
      paddingVertical: d.infoRowShaded.paddingVertical,
    },
    infoLabel: {
      color: t.inkMuted,
      fontFamily: fonts.sans,
      fontSize: d.infoLabel.fontSize,
      fontWeight: 600,
      letterSpacing: d.infoLabel.letterSpacing,
      paddingRight: 12,
      paddingTop: 1,
      textAlign: d.infoLabel.textAlign,
      textTransform: "uppercase",
      width: d.infoLabel.width,
    },
    infoValue: {
      color: t.ink,
      flex: 1,
      fontSize: d.infoValue.fontSize,
      lineHeight: d.infoValue.lineHeight,
    },
    cellRow: {
      flexDirection: "row",
      marginBottom: d.infoRow.marginBottom,
    },
    cell: {
      marginRight: d.cell.marginRight,
    },
    cellLabel: {
      color: t.inkMuted,
      fontFamily: fonts.sans,
      fontSize: d.cell.labelFontSize,
      fontWeight: 600,
      letterSpacing: 1,
      marginBottom: 2,
      textTransform: "uppercase",
    },
    cellValue: {
      color: t.ink,
      fontSize: d.cell.valueFontSize,
      lineHeight: d.infoValue.lineHeight,
    },
    providerBox: {
      borderColor: t.ruleFaint,
      borderWidth: 0.75,
      paddingHorizontal: d.providerBox.paddingHorizontal,
      paddingVertical: d.providerBox.paddingVertical,
    },
    providerName: {
      color: t.accent,
      fontFamily: fonts.display,
      fontSize: d.providerName.fontSize,
      fontWeight: 700,
      marginBottom: d.providerName.marginBottom,
    },
    providerContact: {
      color: t.inkMuted,
      fontFamily: fonts.sans,
      fontSize: d.providerContact.fontSize,
      marginBottom: d.providerContact.marginBottom,
    },
    providerDescription: {
      color: t.inkMuted,
      fontFamily: fonts.display,
      fontSize: 9.5,
      fontStyle: "italic",
      marginBottom: 10,
    },
    providerFootnote: {
      color: t.inkMuted,
      fontFamily: fonts.display,
      fontSize: 7.5,
      fontStyle: "italic",
      marginTop: 3,
    },
    endOfServices: {
      color: t.inkFaint,
      fontFamily: fonts.sans,
      fontSize: 8,
      letterSpacing: 1.5,
      marginTop: d.endOfServices.marginTop,
      marginBottom: d.endOfServices.marginBottom,
      textAlign: "center",
      textTransform: "uppercase",
    },
    footerSection: {
      alignItems: "center",
      marginTop: d.footerSection.marginTop,
    },
    footerRule: {
      borderTopColor: t.rule,
      borderTopWidth: 0.5,
      marginBottom: d.footerRule.marginBottom,
      width: 64,
    },
    footerCompany: {
      color: t.accent,
      fontFamily: fonts.sans,
      fontSize: 8.5,
      fontWeight: 600,
      letterSpacing: 1.5,
      textTransform: "uppercase",
    },
    footerContact: {
      color: t.inkMuted,
      fontFamily: fonts.sans,
      fontSize: 7.5,
      marginTop: 4,
    },
    pageNumber: {
      bottom: d.pageNumber.bottom,
      color: t.inkFaint,
      fontFamily: fonts.sans,
      fontSize: 7.5,
      left: 0,
      position: "absolute",
      right: 0,
      textAlign: "center",
    },
  })
}
