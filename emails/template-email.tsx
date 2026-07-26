import { BaseLayout } from "@/emails/base-layout"
import type { EmailFontFamily, EmailFontSize } from "@/lib/email/appearance"
import type { BrandBlockPosition, DocumentBrand } from "@/lib/settings-access"
import { CONTENT_CLASS_NAME, CONTENT_SLOT_END, CONTENT_SLOT_START } from "@/lib/templates/content-slot"

export interface TemplateEmailProps {
  preview: string
  /** Rendered template body HTML — inserted into the branded layout's content slot. */
  contentHtml: string
  /** SARAIL brand copy + logo. */
  brand?: DocumentBrand
  /** Where the brand block sits: below the header, in the footer, or hidden. */
  brandPosition?: BrandBlockPosition
  fontFamily?: EmailFontFamily
  fontSize?: EmailFontSize
  /** Pre-rendered signature fragment, bracketed with slot markers below the content. */
  signatureHtml?: string
}

/**
 * Generic branded wrapper for DB-template-driven emails. The content is
 * bracketed with slot marker comments so the preview dialog can swap in an
 * edited body without re-rendering the wrapper server-side.
 */
export function TemplateEmail({
  preview,
  contentHtml,
  brand,
  brandPosition,
  fontFamily,
  fontSize,
  signatureHtml,
}: TemplateEmailProps) {
  return (
    <BaseLayout
      preview={preview}
      brand={brand}
      brandPosition={brandPosition}
      fontFamily={fontFamily}
      fontSize={fontSize}
      signatureHtml={signatureHtml}
    >
      <div
        className={CONTENT_CLASS_NAME}
        dangerouslySetInnerHTML={{
          __html: `${CONTENT_SLOT_START}${contentHtml}${CONTENT_SLOT_END}`,
        }}
      />
    </BaseLayout>
  )
}
