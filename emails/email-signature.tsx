import { Hr, Img, Link, Section, Text } from "@react-email/components"
import type { CSSProperties } from "react"
import { renderSenderLayout } from "@/lib/email/sender-layout"
import type { ResolvedEmailSignature } from "@/lib/email/signature"

interface EmailSignatureProps {
  signature: ResolvedEmailSignature
}

const joinParts = (parts: (string | null | false | undefined)[]) => parts.filter(Boolean).join(" | ")

/**
 * Per-sender signature (name/title/contact) plus the picked division's
 * chrome, rendered under the message body and above the FooterBrandBlock.
 * Not wrapped in the `.luxus-content` class — the sender's font settings
 * scale their message body, not the signature — same rule FooterBrandBlock
 * follows. The "Kind regards" sign-off deliberately lives in the template
 * body, not here, so it is never doubled up.
 *
 * The sender name/contact block and the brand's company-text lines are
 * admin-authored, sanitized inline HTML (formatted with the same rich-text
 * toolbar as email bodies — see lib/email/signature-html.ts and
 * lib/email/sender-layout.ts), so they're injected via dangerouslySetInnerHTML
 * rather than built from JSX — the source of truth for their markup is
 * already-sanitized HTML, not React children.
 */
export function EmailSignature({ signature }: EmailSignatureProps) {
  const { fullName, jobTitle, tel, cell, fax, email, website, brand } = signature

  const senderHtml = renderSenderLayout(brand.senderLayout, { fullName, jobTitle, tel, cell, fax, email, website })
  const smallPrintLine = joinParts([brand.registrationLine, brand.tradingHours])

  return (
    <Section style={block}>
      <Text style={senderLines} dangerouslySetInnerHTML={{ __html: senderHtml }} />

      {brand.bannerUrl ? (
        <Img
          alt={brand.name}
          src={brand.bannerUrl}
          width={brand.bannerWidth ?? undefined}
          height={brand.bannerHeight ?? undefined}
          style={banner}
        />
      ) : null}

      {brand.officeAddress ? (
        <Text style={smallPrint} dangerouslySetInnerHTML={{ __html: brand.officeAddress }} />
      ) : null}

      <Hr style={hr} />

      {brand.companyLine ? (
        <Text style={smallPrint} dangerouslySetInnerHTML={{ __html: brand.companyLine }} />
      ) : null}
      {smallPrintLine ? <Text style={smallPrint} dangerouslySetInnerHTML={{ __html: smallPrintLine }} /> : null}
      {brand.divisionsLine ? (
        <Text style={smallPrint} dangerouslySetInnerHTML={{ __html: brand.divisionsLine }} />
      ) : null}
      {brand.confidentiality ? (
        <Text style={confidentiality} dangerouslySetInnerHTML={{ __html: brand.confidentiality }} />
      ) : null}

      {brand.badges.length > 0 ? (
        <table role="presentation" cellPadding={0} cellSpacing={0} style={badgeTable}>
          <tbody>
            <tr>
              {brand.badges.map((badge, i) => {
                const img = (
                  <Img
                    key={i}
                    alt={badge.alt}
                    src={badge.url}
                    width={badge.width}
                    height={badge.height}
                    style={badgeImg}
                  />
                )
                return (
                  <td key={i} style={badgeCell}>
                    {badge.href ? (
                      <Link href={badge.href} style={badgeLink}>
                        {img}
                      </Link>
                    ) : (
                      img
                    )}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      ) : null}
    </Section>
  )
}

const block = {
  padding: "0 24px 0",
}

// react-email's <Text> hardcodes line-height:24px on every <p>, applied
// before the caller's style — that's what opened the gaps between these
// 12-13px lines, not margin. Override it explicitly; the mso rule stops
// Outlook's Word engine rounding it back up.
const senderLines = {
  margin: "16px 0 0",
  fontSize: "13px",
  lineHeight: "16px",
  msoLineHeightRule: "exactly",
  color: "#3d3831",
} as CSSProperties

const banner = {
  display: "block",
  maxWidth: "400px",
  maxHeight: "120px",
  width: "auto",
  height: "auto",
  margin: "12px 0",
  border: "0",
  outline: "none",
  textDecoration: "none",
  objectFit: "contain" as const,
}

const badgeTable = {
  margin: "8px 0 0",
}

const badgeCell = {
  paddingRight: "8px",
  verticalAlign: "middle" as const,
}

const badgeImg = {
  display: "block",
  maxWidth: "100%",
  maxHeight: "32px",
  width: "auto",
  height: "auto",
  border: "0",
  outline: "none",
  textDecoration: "none",
  objectFit: "contain" as const,
}

const badgeLink = {
  textDecoration: "none",
  border: "0",
}

const hr = {
  margin: "12px 0",
  borderColor: "#e8dfd2",
}

const smallPrint = {
  margin: "0 0 4px",
  color: "#8a7f74",
  fontSize: "10px",
  lineHeight: "14px",
}

const confidentiality = {
  margin: "8px 0 0",
  color: "#8a7f74",
  fontSize: "10px",
  lineHeight: "14px",
  fontStyle: "italic" as const,
}
