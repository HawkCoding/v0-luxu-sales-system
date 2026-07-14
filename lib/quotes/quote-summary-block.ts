// Builds the {{quoteSummaryTable}} block token for the quote_email template:
// quote meta summary (incl. journey dates + guests), per-person rate and bold
// VAT-inclusive total, no-price inclusions list, and the dated package
// itinerary — as inline-styled HTML. Content mirrors the quote PDF
// (lib/quotes/pdf/quote-document.tsx) via the shared quote-presentation helpers.

import { formatDisplayDate, formatDisplayDateLong } from "@/lib/date-format"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { sortItineraryBlocksChronologically } from "@/lib/itinerary/sort-blocks"
import {
  derivePerPersonRate,
  formatJourneyRange,
  formatPaxLabel,
  formatTotalLabel,
  summarizeServiceBlock,
} from "@/lib/quotes/quote-presentation"

export interface QuoteSummaryInclusion {
  description: string
  supplierDescription?: string | null
  qty: number
  unit?: string | null
}

export interface QuoteSummaryInput {
  quoteNumber: string
  quoteDate: string
  validUntil: string | null
  journeyStart: string | null
  journeyEnd: string | null
  adults: number
  children: number
  /** VAT-inclusive grand total (quotes.total). */
  total: number
  inclusions: QuoteSummaryInclusion[]
  /** Package itinerary; empty array omits the section entirely. */
  itineraryBlocks: VoucherServiceBlock[]
  /** Heading for the itinerary section (document-text setting). */
  packageIncludesHeading?: string
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatQuoteDate(value: string | null): string {
  return formatDisplayDate(value) || "To be confirmed"
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

const summaryBox =
  "margin:18px 0;padding:14px 16px;background-color:#fbf8f3;border:1px solid #e8dfd2;"
const summaryLine = "margin:0 0 6px;color:#312b24;font-size:13px;line-height:19px;"
const pricingBox =
  "margin:18px 0;padding:14px 16px;background-color:#f4efe6;border:1px solid #d8cdbc;"
const perPersonLine = "margin:0 0 6px;color:#554c42;font-size:13px;line-height:19px;"
const totalLine = "margin:0;color:#172018;font-size:16px;font-weight:700;line-height:22px;"
const sectionHeading =
  "margin:18px 0 8px;padding-bottom:5px;border-bottom:1px solid #d8cdbc;color:#172018;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;"
const bodyCell =
  "padding:10px 8px;border-bottom:1px solid #eee6dc;color:#312b24;font-size:13px;line-height:18px;"
const supplierNote =
  "display:block;margin-top:3px;color:#8a7f74;font-size:11px;font-style:italic;line-height:16px;"
const itineraryTitle = "margin:0 0 2px;color:#172018;font-size:13px;font-weight:700;line-height:19px;"
const itineraryDetail =
  "margin:0 0 2px;padding-left:12px;color:#554c42;font-size:12px;line-height:17px;"

const DEFAULT_INCLUDES_HEADING = "Your Package Includes"

export function buildQuoteSummaryBlock(input: QuoteSummaryInput): string {
  const pax = { adults: input.adults, children: input.children }
  const paxLabel = formatPaxLabel(pax)
  const journeyRange = formatJourneyRange(input.journeyStart, input.journeyEnd)
  const perPersonRate = derivePerPersonRate(input.total, pax)

  const metaLines = [
    `<p style="${summaryLine}"><strong>Quote number:</strong> ${escapeHtml(input.quoteNumber)}</p>`,
    `<p style="${summaryLine}"><strong>Quote date:</strong> ${formatQuoteDate(input.quoteDate)}</p>`,
    `<p style="${summaryLine}"><strong>Valid until:</strong> ${formatQuoteDate(input.validUntil)}</p>`,
    `<p style="${summaryLine}"><strong>Journey:</strong> ${escapeHtml(journeyRange ?? "To be confirmed")}</p>`,
  ]
  if (paxLabel) {
    metaLines.push(`<p style="${summaryLine}"><strong>Guests:</strong> ${escapeHtml(paxLabel)}</p>`)
  }

  const pricing =
    `<div style="${pricingBox}">` +
    (perPersonRate !== null
      ? `<p style="${perPersonLine}">${escapeHtml(paxLabel)} x ${formatMoney(perPersonRate)} per person</p>`
      : "") +
    `<p style="${totalLine}">${escapeHtml(formatTotalLabel(pax))}: ${formatMoney(input.total)} (VAT inclusive)</p>` +
    `</div>`

  const inclusionRows = input.inclusions
    .map((item) => {
      const supplier = item.supplierDescription
        ? `<span style="${supplierNote}">${escapeHtml(item.supplierDescription)}</span>`
        : ""
      const qty = item.unit ? `${item.qty} × ${escapeHtml(item.unit)}` : `${item.qty}`
      return (
        `<tr><td style="${bodyCell}">${escapeHtml(item.description)}${supplier}</td>` +
        `<td style="${bodyCell}text-align:right;white-space:nowrap;color:#6f675d;">${qty}</td></tr>`
      )
    })
    .join("")

  const inclusions =
    `<p style="${sectionHeading}">Your quotation includes</p>` +
    `<table style="width:100%;border-collapse:collapse;"><tbody>${inclusionRows}</tbody></table>`

  let itinerary = ""
  const itineraryLines = sortItineraryBlocksChronologically(input.itineraryBlocks).map(
    summarizeServiceBlock,
  )
  if (itineraryLines.length > 0) {
    const heading = input.packageIncludesHeading || DEFAULT_INCLUDES_HEADING
    const items = itineraryLines
      .map((line) => {
        const date = line.dateISO
          ? formatDisplayDateLong(line.dateISO) || "Date to be confirmed"
          : "Date to be confirmed"
        const details = line.details
          .map((detail) => `<p style="${itineraryDetail}">${escapeHtml(detail)}</p>`)
          .join("")
        return (
          `<div style="margin:0 0 10px;">` +
          `<p style="${itineraryTitle}"><strong>${escapeHtml(date)}</strong> — ${escapeHtml(line.title)}</p>` +
          details +
          `</div>`
        )
      })
      .join("")
    itinerary = `<p style="${sectionHeading}">${escapeHtml(heading)}</p>${items}`
  }

  return (
    `<div style="${summaryBox}">${metaLines.join("")}</div>` +
    pricing +
    inclusions +
    itinerary +
    `<hr style="margin:24px 0 18px;border:none;border-top:1px solid #e8dfd2;"/>`
  )
}
