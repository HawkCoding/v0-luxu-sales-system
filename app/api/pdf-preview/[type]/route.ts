import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError } from "@/lib/api/responses"
import { loadBrandLogo } from "@/lib/pdf/brand-logo"
import {
  getBankingSettings,
  getDocumentBrandSettings,
  getDocumentTextSettings,
  resolveDocumentBrand,
} from "@/lib/settings-access"
import { renderVoucherPdf } from "@/lib/voucher/render-pdf"
import { renderItineraryPdf } from "@/lib/itinerary/render-pdf"
import { renderQuotePdf } from "@/lib/quotes/render-quote-pdf"
import { renderInvoicePdf } from "@/lib/invoices/render-invoice-pdf"
import { renderWorksheetPdf } from "@/lib/worksheet/render-worksheet-pdf"
import { sampleVoucherData, sampleVoucherServiceBlocks } from "@/lib/voucher/pdf/sample-data"
import { sampleItineraryData } from "@/lib/itinerary/sample-data"
import { sampleQuotePdfData } from "@/lib/quotes/pdf/sample-data"
import { sampleInvoicePdfData } from "@/lib/invoices/sample-data"
import { sampleWorksheetData } from "@/lib/worksheet/pdf/sample-data"
import { VOUCHER_TEMPLATE_DEFAULTS, type VoucherTemplate } from "@/lib/types"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const typeSchema = z.enum(["voucher", "itinerary", "quote", "invoice", "worksheet"])
export type PdfPreviewType = z.infer<typeof typeSchema>

async function fetchVoucherTemplate(supabase: SupabaseClient<Database>): Promise<VoucherTemplate> {
  const { data } = await supabase
    .from("voucher_template")
    .select(
      "id, header_text, product_line, accent_colour, section_bg, font_family, section_order, hidden_sections, footer_company, footer_phone, footer_email, guidance_text",
    )
    .limit(1)
    .maybeSingle()
  return { ...VOUCHER_TEMPLATE_DEFAULTS, ...(data as Partial<VoucherTemplate> | null) }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ type: string }> },
) {
  const auth = await requireRole(["admin", "manager"])
  if (!auth.ok) return auth.response

  const { type: rawType } = await params
  const parsed = typeSchema.safeParse(rawType)
  if (!parsed.success) return jsonError("Unknown preview type", 400)
  const type = parsed.data

  const { supabase } = auth.value

  let buffer: Buffer
  try {
    const { brand, position } = resolveDocumentBrand(await getDocumentBrandSettings(supabase))
    const brandLogo = await loadBrandLogo(brand.logoUrl)

    if (type === "voucher") {
      const [template, documentText] = await Promise.all([
        fetchVoucherTemplate(supabase),
        getDocumentTextSettings(supabase),
      ])
      buffer = await renderVoucherPdf({
        data: { ...sampleVoucherData(), serviceBlocks: sampleVoucherServiceBlocks() },
        template,
        docTitle: documentText.voucher_doc_title,
        brand,
        brandLogo,
      })
    } else if (type === "itinerary") {
      const [template, documentText] = await Promise.all([
        fetchVoucherTemplate(supabase),
        getDocumentTextSettings(supabase),
      ])
      buffer = await renderItineraryPdf({
        data: sampleItineraryData(),
        template,
        journeyHeading: documentText.itinerary_doc_journey_heading,
        introText: documentText.itinerary_doc_intro_text,
        brand,
        brandLogo,
      })
    } else if (type === "quote") {
      const documentText = await getDocumentTextSettings(supabase)
      buffer = await renderQuotePdf({
        ...sampleQuotePdfData(),
        title: documentText.quote_doc_title,
        footerText: documentText.quote_doc_footer_text,
        packageIncludesHeading: documentText.quote_doc_includes_heading,
        packageExcludesHeading: documentText.quote_doc_excludes_heading,
        packageExcludesDefault: documentText.quote_doc_excludes_default,
        brand,
        brandPosition: position.quote,
        brandLogo,
      })
    } else if (type === "worksheet") {
      buffer = await renderWorksheetPdf({
        ...sampleWorksheetData(),
        brandLogo,
      })
    } else {
      const [banking, documentText] = await Promise.all([
        getBankingSettings(supabase),
        getDocumentTextSettings(supabase),
      ])
      buffer = await renderInvoicePdf({
        ...sampleInvoicePdfData(),
        banking,
        footerText: documentText.invoice_doc_footer_text,
        paymentNote: documentText.invoice_doc_payment_note,
        bankChargesNote: documentText.invoice_doc_bank_charges_note,
        brand,
        brandPosition: position.invoice,
        brandLogo,
      })
    }
  } catch (error) {
    console.error(`pdf-preview:${type}`, error)
    return jsonError("Preview could not be rendered", 500)
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="preview-${type}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
