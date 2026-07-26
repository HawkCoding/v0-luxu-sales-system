import { render } from "@react-email/render"
import { createElement } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { TemplateEmail } from "@/emails/template-email"
import { renderSignatureFragment } from "@/lib/email/render-signature"
import { resolveEmailSignature } from "@/lib/email/signature"
import { getDocumentBrandForEmail, getEmailBrandingSettings } from "@/lib/settings-access"
import { getTemplate, type EmailTemplate } from "@/lib/templates/get-template"
import { renderTemplate } from "@/lib/templates/render"

export interface ComposedEmail {
  subject: string
  /** Full branded email HTML (BaseLayout wrapper + content/signature slot markers). */
  bodyHtml: string
  /** The rendered template content only — what the salesperson edits in the preview. */
  bodyContentHtml: string
  warnings: string[]
  /** Profile id whose signature was resolved — the send dialog's brand switch must re-resolve for this profile, not the logged-in user. */
  signatureProfileId: string | null
  /** Brand id actually resolved (may differ from a requested unknown/disabled id, which falls back to the first enabled brand). */
  signatureBrandId: string | null
}

export interface ComposeTokens {
  /** Scalar values — HTML-escaped on substitution. */
  tokens: Record<string, string>
  /** Raw HTML fragments (e.g. banking details) — body only. */
  blocks?: Record<string, string>
}

export interface ComposeOptions extends ComposeTokens {
  /**
   * Profile id of the sender whose signature (name/title/contact, set in
   * Settings) is appended below the content. Omitted renders no signature —
   * SMTP/IMAP transport a message as-is, nothing appends one automatically.
   */
  senderProfileId?: string | null
  /** Division brand to render in the signature; omitted resolves to the first enabled brand. */
  signatureBrandId?: string | null
}

/** Compose from an already-fetched template (e.g. once per worker run). */
export async function composeFromTemplate(
  template: Pick<EmailTemplate, "subject" | "bodyHtml">,
  { tokens, blocks, senderProfileId, signatureBrandId }: ComposeOptions,
): Promise<ComposedEmail> {
  const rendered = renderTemplate({
    subject: template.subject,
    bodyHtml: template.bodyHtml,
    tokens,
    blocks,
  })

  const [branding, emailBrand, signature] = await Promise.all([
    getEmailBrandingSettings(),
    getDocumentBrandForEmail(),
    resolveEmailSignature(senderProfileId, signatureBrandId),
  ])
  const signatureHtml = signature ? await renderSignatureFragment(signature) : ""
  const bodyHtml = await render(
    createElement(TemplateEmail, {
      preview: rendered.subject,
      contentHtml: rendered.bodyHtml,
      brand: emailBrand.brand,
      brandPosition: emailBrand.position,
      fontFamily: branding.email_font_family,
      fontSize: branding.email_font_size,
      signatureHtml,
    }),
  )

  return {
    subject: rendered.subject,
    bodyHtml,
    bodyContentHtml: rendered.bodyHtml,
    warnings: rendered.warnings,
    signatureProfileId: signature ? signature.profileId : null,
    signatureBrandId: signature ? signature.brandId : null,
  }
}

/**
 * Fetch the template for `key` and compose the full branded email.
 * Returns null only for unknown custom keys — system keys always compose.
 */
export async function composeEmail(
  supabase: SupabaseClient<Database>,
  key: string,
  options: ComposeOptions,
): Promise<ComposedEmail | null> {
  const template = await getTemplate(supabase, key)
  if (!template) return null
  return composeFromTemplate(template, options)
}
