import { Hr, Img, Link, Section, Text } from "@react-email/components"
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
 */
export function EmailSignature({ signature }: EmailSignatureProps) {
  const { fullName, jobTitle, tel, cell, fax, email, website, brand } = signature

  const contactLine = joinParts([tel && `Tel: ${tel}`, cell && `Cell: ${cell}`, fax && `Fax: ${fax}`])
  const smallPrintLine = joinParts([brand.registrationLine, brand.tradingHours])

  return (
    <Section style={block}>
      <Text style={nameLine}>
        <strong>{fullName}</strong>
        {jobTitle ? <span style={jobTitleStyle}> | {jobTitle}</span> : null}
      </Text>
      {contactLine ? <Text style={contactLineStyle}>{contactLine}</Text> : null}
      {(email || website) && (
        <Text style={contactLineStyle}>
          {email ? (
            <>
              Email: <Link href={`mailto:${email}`} style={link}>{email}</Link>
            </>
          ) : null}
          {email && website ? " | " : null}
          {website ? (
            <>
              Web: <Link href={`https://${website.replace(/^https?:\/\//i, "")}`} style={link}>{website}</Link>
            </>
          ) : null}
        </Text>
      )}

      {brand.bannerUrl ? (
        <Img
          alt={brand.name}
          src={brand.bannerUrl}
          width={brand.bannerWidth ?? undefined}
          height={brand.bannerHeight ?? undefined}
          style={banner}
        />
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

      {brand.officeAddress ? <Text style={smallPrint}>{brand.officeAddress}</Text> : null}

      <Hr style={hr} />

      {brand.companyLine ? <Text style={smallPrint}>{brand.companyLine}</Text> : null}
      {smallPrintLine ? <Text style={smallPrint}>{smallPrintLine}</Text> : null}
      {brand.divisionsLine ? <Text style={smallPrint}>{brand.divisionsLine}</Text> : null}
      {brand.confidentiality ? <Text style={confidentiality}>{brand.confidentiality}</Text> : null}
    </Section>
  )
}

const block = {
  padding: "4px 24px 0",
}

const nameLine = {
  margin: "0 0 4px",
  color: "#2f2a24",
  fontSize: "13px",
}

const jobTitleStyle = {
  fontStyle: "italic" as const,
  fontWeight: "normal" as const,
}

const contactLineStyle = {
  margin: "0 0 4px",
  color: "#3d3831",
  fontSize: "12px",
}

const link = {
  color: "#3d3831",
  textDecoration: "underline",
}

const banner = {
  display: "block",
  maxWidth: "100%",
  height: "auto",
  margin: "12px 0",
  border: "0",
  outline: "none",
  textDecoration: "none",
  objectFit: "contain" as const,
}

const badgeTable = {
  margin: "8px 0",
}

const badgeCell = {
  paddingRight: "10px",
  verticalAlign: "middle" as const,
}

const badgeImg = {
  display: "block",
  maxWidth: "100%",
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
