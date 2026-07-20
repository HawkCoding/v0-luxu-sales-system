import { render } from "@react-email/render"
import { createElement } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { TemplateEmail } from "@/emails/template-email"
import { getEmailLogoUrl } from "@/lib/email/branding"
import { getDocumentBrandForEmail, getEmailBrandingSettings } from "@/lib/settings-access"
import { getTemplate, type EmailTemplate } from "@/lib/templates/get-template"
import { renderTemplate } from "@/lib/templates/render"

export interface ComposedEmail {
  subject: string
  /** Full branded email HTML (BaseLayout wrapper + content slot markers). */
  bodyHtml: string
  /** The rendered template content only — what the salesperson edits in the preview. */
  bodyContentHtml: string
  warnings: string[]
}

export interface ComposeTokens {
  /** Scalar values — HTML-escaped on substitution. */
  tokens: Record<string, string>
  /** Raw HTML fragments (e.g. banking details) — body only. */
  blocks?: Record<string, string>
}

/** Compose from an already-fetched template (e.g. once per worker run). */
export async function composeFromTemplate(
  template: Pick<EmailTemplate, "subject" | "bodyHtml">,
  { tokens, blocks }: ComposeTokens,
): Promise<ComposedEmail> {
  const rendered = renderTemplate({
    subject: template.subject,
    bodyHtml: template.bodyHtml,
    tokens,
    blocks,
  })

  const [branding, logoUrl, emailBrand] = await Promise.all([
    getEmailBrandingSettings(),
    getEmailLogoUrl(),
    getDocumentBrandForEmail(),
  ])
  const bodyHtml = await render(
    createElement(TemplateEmail, {
      preview: rendered.subject,
      contentHtml: rendered.bodyHtml,
      logoUrl,
      brand: emailBrand.brand,
      brandPosition: emailBrand.position,
      fontFamily: branding.email_font_family,
      fontSize: branding.email_font_size,
    }),
  )

  return {
    subject: rendered.subject,
    bodyHtml,
    bodyContentHtml: rendered.bodyHtml,
    warnings: rendered.warnings,
  }
}

/**
 * Fetch the template for `key` and compose the full branded email.
 * Returns null only for unknown custom keys — system keys always compose.
 */
export async function composeEmail(
  supabase: SupabaseClient<Database>,
  key: string,
  tokens: ComposeTokens,
): Promise<ComposedEmail | null> {
  const template = await getTemplate(supabase, key)
  if (!template) return null
  return composeFromTemplate(template, tokens)
}
