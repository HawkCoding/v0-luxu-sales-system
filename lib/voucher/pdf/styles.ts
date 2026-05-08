import { StyleSheet } from "@react-pdf/renderer"

export function voucherStyles({
  accentColour,
  sectionBg,
  fontFamily,
}: {
  accentColour: string
  sectionBg: string
  fontFamily: string
}) {
  return StyleSheet.create({
    page: {
      padding: 56,
      color: "#333333",
      fontFamily,
      fontSize: 10,
      lineHeight: 1.4,
    },
    header: {
      marginBottom: 20,
    },
    headerSplit: {
      borderBottomColor: accentColour,
      borderBottomWidth: 2,
      flexDirection: "row",
      minHeight: 100,
    },
    headerLogoSide: {
      alignItems: "center",
      backgroundColor: "#ffffff",
      justifyContent: "center",
      padding: 8,
      width: 120,
    },
    headerLogo: {
      maxHeight: 80,
      maxWidth: 100,
      objectFit: "contain",
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
      backgroundColor: "rgba(0, 0, 0, 0.45)",
      bottom: 0,
      left: 0,
      paddingHorizontal: 12,
      paddingVertical: 6,
      position: "absolute",
      right: 0,
    },
    headerLogoOnly: {
      alignItems: "center",
      borderBottomColor: accentColour,
      borderBottomWidth: 2,
      paddingBottom: 10,
    },
    headerLogoCenter: {
      maxHeight: 70,
      maxWidth: 180,
      objectFit: "contain",
    },
    headerBannerOnly: {
      borderBottomColor: accentColour,
      borderBottomWidth: 2,
    },
    headerBannerFull: {
      height: 110,
      objectFit: "cover",
      width: "100%",
    },
    headerTextBelow: {
      alignItems: "center",
      paddingVertical: 6,
    },
    headerTextOnly: {
      alignItems: "center",
      borderBottomColor: accentColour,
      borderBottomWidth: 2,
      paddingBottom: 10,
    },
    productLine: {
      color: accentColour,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 1,
      marginTop: 5,
      textTransform: "uppercase",
    },
    overlayProductLine: {
      color: "#ffffff",
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    headerSubtitle: {
      color: "#666666",
      fontSize: 9,
      fontStyle: "italic",
      marginTop: 3,
    },
    overlaySubtitle: {
      color: "#e6e6e6",
      fontSize: 8,
      fontStyle: "italic",
    },
    voucherNumberRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 8,
      marginTop: 16,
    },
    title: {
      color: accentColour,
      fontSize: 18,
      fontWeight: 700,
    },
    voucherBadge: {
      borderColor: accentColour,
      borderRadius: 3,
      borderWidth: 2,
      color: accentColour,
      fontSize: 11,
      fontWeight: 700,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    guidance: {
      backgroundColor: "#f8f9fa",
      borderLeftColor: sectionBg,
      borderLeftWidth: 3,
      color: "#555555",
      fontSize: 9,
      fontStyle: "italic",
      marginVertical: 14,
      paddingHorizontal: 15,
      paddingVertical: 10,
    },
    section: {
      marginBottom: 20,
    },
    sectionTitle: {
      backgroundColor: sectionBg,
      borderRadius: 2,
      color: "#ffffff",
      fontSize: 11,
      fontWeight: 700,
      marginBottom: 8,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    infoRow: {
      flexDirection: "row",
      marginBottom: 6,
    },
    infoLabel: {
      color: "#555555",
      fontSize: 10,
      fontWeight: 700,
      paddingRight: 12,
      width: 150,
    },
    infoValue: {
      color: "#333333",
      flex: 1,
      fontSize: 10,
    },
    providerBox: {
      backgroundColor: "#fafafa",
      borderColor: "#dddddd",
      borderRadius: 4,
      borderWidth: 1,
      padding: 14,
    },
    providerName: {
      color: accentColour,
      fontSize: 13,
      fontWeight: 700,
      marginBottom: 10,
    },
    footerSection: {
      borderTopColor: "#dddddd",
      borderTopWidth: 1,
      marginTop: 10,
      paddingTop: 14,
    },
    footerContact: {
      color: "#666666",
      fontSize: 9,
      textAlign: "center",
    },
    pageNumber: {
      bottom: 24,
      color: "#999999",
      fontSize: 8,
      left: 0,
      position: "absolute",
      right: 0,
      textAlign: "center",
    },
  })
}
