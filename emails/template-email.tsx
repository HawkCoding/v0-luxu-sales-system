import { BaseLayout } from "@/emails/base-layout"
import { CONTENT_SLOT_END, CONTENT_SLOT_START } from "@/lib/templates/content-slot"

export interface TemplateEmailProps {
  preview: string
  /** Rendered template body HTML — inserted into the branded layout's content slot. */
  contentHtml: string
  footerTagline?: string
  logoUrl?: string | null
}

/**
 * Generic branded wrapper for DB-template-driven emails. The content is
 * bracketed with slot marker comments so the preview dialog can swap in an
 * edited body without re-rendering the wrapper server-side.
 */
export function TemplateEmail({ preview, contentHtml, footerTagline, logoUrl }: TemplateEmailProps) {
  return (
    <BaseLayout preview={preview} footerTagline={footerTagline} logoUrl={logoUrl}>
      <div
        dangerouslySetInnerHTML={{
          __html: `${CONTENT_SLOT_START}${contentHtml}${CONTENT_SLOT_END}`,
        }}
      />
    </BaseLayout>
  )
}
