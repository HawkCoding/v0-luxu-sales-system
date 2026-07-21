import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
} from "@react-email/components"
import type { ReactNode } from "react"
import {
  EMAIL_APPEARANCE_DEFAULTS,
  type EmailFontFamily,
  type EmailFontSize,
} from "@/lib/email/appearance"
import type { BrandBlockPosition, DocumentBrand } from "@/lib/settings-access"
import { CONTENT_CLASS_NAME } from "@/lib/templates/content-slot"
import { FooterBrandBlock } from "@/emails/footer-brand-block"
import { EmailSignature } from "@/emails/email-signature"
import type { ResolvedEmailSignature } from "@/lib/email/signature"

interface BaseLayoutProps {
  preview: string
  children: ReactNode
  /** SARAIL brand copy + logo; omitted falls back to the constants. */
  brand?: DocumentBrand
  /** Brand block slot: the masthead, the footer, or hidden. Default masthead. */
  brandPosition?: BrandBlockPosition
  fontFamily?: EmailFontFamily
  fontSize?: EmailFontSize
  /** Sender signature, rendered below the content, above the bottom brand block. Omitted renders nothing. */
  signature?: ResolvedEmailSignature | null
}

export function BaseLayout({
  preview,
  children,
  brand,
  brandPosition = "top",
  fontFamily = EMAIL_APPEARANCE_DEFAULTS.email_font_family,
  fontSize = EMAIL_APPEARANCE_DEFAULTS.email_font_size,
  signature,
}: BaseLayoutProps) {
  // Outlook's Word engine resets fonts on block elements, so a font-family on
  // <Body> alone never reaches the template content's <p> tags. The head rule
  // below targets those elements directly; both values come from an allowlist
  // (lib/email/appearance.ts) and are safe to interpolate here.
  const contentFontCss = `
.${CONTENT_CLASS_NAME}, .${CONTENT_CLASS_NAME} p, .${CONTENT_CLASS_NAME} li,
.${CONTENT_CLASS_NAME} td, .${CONTENT_CLASS_NAME} a, .${CONTENT_CLASS_NAME} span,
.${CONTENT_CLASS_NAME} div {
  font-family: ${fontFamily};
  font-size: ${fontSize};
  line-height: 1.4;
}
.${CONTENT_CLASS_NAME} p {
  margin: 0 0 8px;
}
.${CONTENT_CLASS_NAME} ul, .${CONTENT_CLASS_NAME} ol {
  margin: 0 0 8px;
  padding-left: 20px;
}
.${CONTENT_CLASS_NAME} li {
  margin: 0 0 2px;
}`.trim()

  return (
    <Html>
      <Head>
        <style dangerouslySetInnerHTML={{ __html: contentFontCss }} />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ ...body, fontFamily, fontSize }}>
        <Container style={container}>
          {brandPosition === "top" && (
            <Section style={topBrand}>
              <FooterBrandBlock brand={brand} />
            </Section>
          )}
          <Section style={content}>{children}</Section>
          {signature ? <EmailSignature signature={signature} /> : null}
          {brandPosition === "bottom" && (
            <Section style={footer}>
              <FooterBrandBlock brand={brand} />
            </Section>
          )}
        </Container>
      </Body>
    </Html>
  )
}

// fontFamily/fontSize are applied per-render from the app settings.
const body = {
  margin: "0",
  backgroundColor: "#f6f2ea",
}

const container = {
  width: "100%",
  maxWidth: "640px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
}

const content = {
  padding: "20px 24px",
}

const footer = {
  padding: "18px 24px",
  borderTop: "1px solid #e8dfd2",
  backgroundColor: "#fbf8f3",
  textAlign: "center" as const,
}

// Top placement is the email's masthead; a bottom border divides it from the
// content the way the footer's top border does.
const topBrand = {
  padding: "18px 24px",
  borderBottom: "1px solid #e8dfd2",
  backgroundColor: "#fbf8f3",
  textAlign: "center" as const,
}
