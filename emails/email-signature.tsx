import { Hr, Img, Link, Section, Text } from "@react-email/components"
import type { ResolvedEmailSignature } from "@/lib/email/signature"

interface EmailSignatureProps {
  signature: ResolvedEmailSignature
}

/**
 * Per-sender signature (name/title/contact) plus the SARAIL company chrome,
 * rendered under the message body and above the FooterBrandBlock. Not
 * wrapped in the `.luxus-content` class — the sender's font settings scale
 * their message body, not the signature — same rule FooterBrandBlock follows.
 */
export function EmailSignature({ signature }: EmailSignatureProps) {
  const { fullName, jobTitle, tel, cell, fax, email, website, company } = signature

  const contactLine = [
    tel ? `Tel: ${tel}` : null,
    cell ? `Cell: ${cell}` : null,
    fax ? `Fax: ${fax}` : null,
  ].filter(Boolean).join(" | ")

  return (
    <Section style={block}>
      <Text style={kindRegards}>Kind regards,</Text>
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

      {company.signature_banner_url ? (
        <Img
          alt="SA-Rail — The Blue Train, Rovos Rail, Kruger Shalati"
          src={company.signature_banner_url}
          style={banner}
        />
      ) : null}

      <Hr style={hr} />

      <Text style={smallPrint}>{company.signature_company_line}</Text>
      <Text style={smallPrint}>
        {company.signature_registration_line} | {company.signature_trading_hours}
      </Text>
      <Text style={smallPrint}>{company.signature_divisions_line}</Text>
      <Text style={confidentiality}>{company.signature_confidentiality}</Text>
    </Section>
  )
}

const block = {
  padding: "4px 24px 0",
}

const kindRegards = {
  margin: "0 0 6px",
  color: "#2f2a24",
  fontSize: "13px",
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
  width: "100%",
  maxWidth: "480px",
  height: "auto",
  margin: "12px 0",
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
