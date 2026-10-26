import { Body, Head, Html, Preview } from "@react-email/components"
import type { ReactNode } from "react"
import {
  EMAIL_APPEARANCE_DEFAULTS,
  EMAIL_DEFAULT_LINE_HEIGHT,
  type EmailFontFamily,
  type EmailFontSize,
} from "@/lib/email/appearance"
import { buildChromeFontCss, CHROME_CLASS_NAME, EMAIL_COLORS } from "@/lib/email/email-chrome"
import type { BrandBlockPosition, DocumentBrand } from "@/lib/settings-access"
import { CONTENT_CLASS_NAME } from "@/lib/templates/content-slot"
import { SIGNATURE_SLOT_END, SIGNATURE_SLOT_START } from "@/lib/templates/signature-slot"
import { FOOTER_BRAND_RESPONSIVE_CSS, FooterBrandBlock } from "@/emails/footer-brand-block"

interface BaseLayoutProps {
  preview: string
  children: ReactNode
  /** SARAIL brand copy + logo; omitted falls back to the constants. */
  brand?: DocumentBrand
  /** Brand block slot: the masthead, the footer, or hidden. Default masthead. */
  brandPosition?: BrandBlockPosition
  fontFamily?: EmailFontFamily
  fontSize?: EmailFontSize
  /**
   * Pre-rendered signature fragment, bracketed with slot markers so the send
   * dialog can swap in a different brand's rendering client-side. Rendered
   * unconditionally (even empty) so the slot always exists to swap into.
   */
  signatureHtml?: string
}

export function BaseLayout({
  preview,
  children,
  brand,
  brandPosition = "top",
  fontFamily = EMAIL_APPEARANCE_DEFAULTS.email_font_family,
  fontSize = EMAIL_APPEARANCE_DEFAULTS.email_font_size,
  signatureHtml,
}: BaseLayoutProps) {
  // Outlook's Word engine resets fonts on block elements, so a font-family on
  // <Body> alone never reaches the template content's <p> tags. The head rule
  // below targets those elements directly; both values come from an allowlist
  // (lib/email/appearance.ts) and are safe to interpolate here.
  //
  // font-size and line-height are deliberately scoped to block/inline-block
  // containers only — not span/a — so a per-section size the salesperson sets
  // on a <span>, or the line spacing they set inline on a <p>/<li> (see the
  // template editor's toolbar), isn't overridden by this rule; span/a inherit
  // the container's values instead. (A span keeping its own 1.4 would hold a
  // "Single"-spaced line open wherever a link or styled run sits.)
  //
  // The paragraph and list spacing here is only the fallback: Outlook can't be
  // trusted to apply it, so the send path writes the same values inline on every
  // element in the content slot (lib/templates/email-spacing.ts). Keep the two
  // in step. There is deliberately no `p:last-child` rule — Outlook can't apply
  // it per element, and the space under the last paragraph is the gap Carmen
  // wants before the signature (client, 2026-10-26).
  const contentFontCss = `
.${CONTENT_CLASS_NAME}, .${CONTENT_CLASS_NAME} p, .${CONTENT_CLASS_NAME} li,
.${CONTENT_CLASS_NAME} td, .${CONTENT_CLASS_NAME} a, .${CONTENT_CLASS_NAME} span,
.${CONTENT_CLASS_NAME} div {
  font-family: ${fontFamily};
}
.${CONTENT_CLASS_NAME}, .${CONTENT_CLASS_NAME} p, .${CONTENT_CLASS_NAME} li,
.${CONTENT_CLASS_NAME} td, .${CONTENT_CLASS_NAME} div {
  font-size: ${fontSize};
  line-height: ${EMAIL_DEFAULT_LINE_HEIGHT};
}
.${CONTENT_CLASS_NAME} p {
  margin: 0 0 8px;
}
.${CONTENT_CLASS_NAME} ul, .${CONTENT_CLASS_NAME} ol {
  margin: 0 0 8px 20px;
  padding: 0;
}
.${CONTENT_CLASS_NAME} li {
  margin: 0 0 2px;
}`.trim()

  // The signature and brand strips sit outside .luxus-content (the sender's
  // font size scales their message, not the chrome), so they get their own
  // family-only rule — without it Outlook drops them back to Times New Roman.
  // The inline fontFamily on each wrapper covers clients that strip <style>.
  const headCss = `${contentFontCss}\n${buildChromeFontCss(fontFamily)}\n${FOOTER_BRAND_RESPONSIVE_CSS}`

  // One plain frame, like a message typed in Outlook: no fill anywhere, and the
  // masthead, the body and the signature share one left edge (client,
  // 2026-10-26). A hand-written table rather than react-email's Container/
  // Section, which stamp align="center" on every table — Outlook honours it.
  // react-email's <Body> keeps its own wrapper table (100% wide, so its
  // align="center" moves nothing); it carries the font onto a <td> for clients
  // that strip <body> styles. Every gap is padding on a <td>: Outlook ignores
  // padding and margins on a <table>.
  return (
    <Html>
      <Head>
        <style dangerouslySetInnerHTML={{ __html: headCss }} />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ fontFamily, fontSize }}>
        <table role="presentation" width="100%" border={0} cellPadding={0} cellSpacing={0} style={frame}>
          <tbody>
            {brandPosition === "top" && (
              <tr>
                <td className={CHROME_CLASS_NAME} style={{ ...topBrand, fontFamily }}>
                  <FooterBrandBlock brand={brand} />
                </td>
              </tr>
            )}
            <tr>
              <td style={brandPosition === "top" ? contentBelowMasthead : content}>{children}</td>
            </tr>
            <tr>
              <td>
                {/* The wrapper (class + inline font) stays put when the send dialog
                    swaps a different brand's fragment in between the markers. */}
                <div
                  className={CHROME_CLASS_NAME}
                  style={{ fontFamily }}
                  dangerouslySetInnerHTML={{
                    __html: `${SIGNATURE_SLOT_START}${signatureHtml ?? ""}${SIGNATURE_SLOT_END}`,
                  }}
                />
              </td>
            </tr>
            {brandPosition === "bottom" && (
              <tr>
                <td className={CHROME_CLASS_NAME} style={{ ...footer, fontFamily }}>
                  <FooterBrandBlock brand={brand} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Body>
    </Html>
  )
}

// fontFamily/fontSize are applied per-render from the app settings. No align
// attribute and no auto margins: the frame sits on the left like a typed
// message. Outlook ignores max-width and fills the reading pane, as a typed
// message does.
const frame = {
  maxWidth: "640px",
  margin: "0",
}

const content = {
  padding: "0",
}

// The masthead's divider sits right above the message, so the message starts a
// little below it.
const contentBelowMasthead = {
  padding: "20px 0 0",
}

const footer = {
  padding: "18px 0",
  borderTop: `1px solid ${EMAIL_COLORS.divider}`,
}

// Top placement is the email's masthead; a bottom border divides it from the
// content the way the footer's top border does.
const topBrand = {
  padding: "18px 0",
  borderBottom: `1px solid ${EMAIL_COLORS.divider}`,
}
