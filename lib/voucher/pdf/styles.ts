import { StyleSheet } from "@react-pdf/renderer"
import { voucherTokens } from "./design-tokens"
import type { DocumentFontPairing as VoucherFontPairing } from "@/lib/pdf/document-fonts"

export function voucherStyles({
  accentColour,
  sectionBg,
  fonts,
}: {
  accentColour: string
  sectionBg: string
  fonts: VoucherFontPairing
}) {
  const t = voucherTokens({ accentColour, sectionBg })

  return StyleSheet.create({
    page: {
      color: t.ink,
      fontFamily: fonts.body,
      fontSize: 10,
      // NOTE: do not set lineHeight on the Page — react-pdf drops `fixed`
      // render-prop text (the footer page number) when a Page ancestor has
      // lineHeight. Apply lineHeight on the individual text styles instead.
      paddingBottom: 56,
      paddingHorizontal: 56,
      paddingTop: 48,
    },
    frameOuter: {
      borderColor: t.frameOuter,
      borderWidth: 0.75,
      bottom: 20,
      left: 20,
      position: "absolute",
      right: 20,
      top: 20,
    },
    frameInner: {
      borderColor: t.frameInner,
      borderWidth: 0.5,
      bottom: 24,
      left: 24,
      position: "absolute",
      right: 24,
      top: 24,
    },
    header: {
      marginBottom: 18,
    },
    headerSplit: {
      borderBottomColor: t.rule,
      borderBottomWidth: 0.5,
      flexDirection: "row",
      minHeight: 100,
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
      height: 80,
      objectFit: "contain",
      width: 100,
    },
    headerBannerSide: {
      flex: 1,
      minHeight: 100,
      position: "relative",
    },
    headerBanner: {
      height: 100,
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
      height: 70,
      objectFit: "contain",
      width: 180,
    },
    headerBannerOnly: {
      borderBottomColor: t.rule,
      borderBottomWidth: 0.5,
      paddingBottom: 8,
    },
    headerBannerFull: {
      height: 110,
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
      marginBottom: 10,
      marginTop: 18,
    },
    title: {
      color: t.accent,
      fontFamily: fonts.display,
      fontSize: 22,
      fontWeight: 700,
      letterSpacing: 3,
      textTransform: "uppercase",
    },
    voucherStub: {
      alignItems: "center",
      borderColor: t.accent,
      borderLeftStyle: "dashed",
      borderWidth: 0.75,
      paddingHorizontal: 12,
      paddingVertical: 6,
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
      fontSize: 14,
      fontWeight: 700,
      marginTop: 2,
    },
    guidance: {
      color: t.inkMuted,
      fontFamily: fonts.display,
      fontSize: 9,
      fontStyle: "italic",
      lineHeight: 1.5,
      marginBottom: 18,
      marginTop: 4,
      paddingRight: 48,
    },
    section: {
      marginBottom: 18,
    },
    sectionTitle: {
      borderBottomColor: t.ruleFaint,
      borderBottomWidth: 0.5,
      color: t.eyebrow,
      fontFamily: fonts.sans,
      fontSize: 8.5,
      fontWeight: 600,
      letterSpacing: 2,
      marginBottom: 10,
      paddingBottom: 6,
      textTransform: "uppercase",
    },
    infoRow: {
      flexDirection: "row",
      marginBottom: 6,
    },
    infoLabel: {
      color: t.inkMuted,
      fontFamily: fonts.sans,
      fontSize: 8.5,
      fontWeight: 600,
      letterSpacing: 1,
      paddingRight: 12,
      paddingTop: 1,
      textTransform: "uppercase",
      width: 140,
    },
    infoValue: {
      color: t.ink,
      flex: 1,
      fontSize: 10,
      lineHeight: 1.4,
    },
    providerBox: {
      borderColor: t.ruleFaint,
      borderWidth: 0.75,
      padding: 14,
    },
    providerName: {
      color: t.accent,
      fontFamily: fonts.display,
      fontSize: 13,
      fontWeight: 700,
      marginBottom: 10,
    },
    providerDescription: {
      color: t.inkMuted,
      fontFamily: fonts.display,
      fontSize: 9.5,
      fontStyle: "italic",
      marginBottom: 10,
    },
    footerSection: {
      alignItems: "center",
      marginTop: 8,
    },
    footerRule: {
      borderTopColor: t.rule,
      borderTopWidth: 0.5,
      marginBottom: 12,
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
      bottom: 32,
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
