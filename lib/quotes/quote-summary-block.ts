// Builds the {{quoteSummaryTable}} block token for the quote_email template:
// quote meta summary (incl. journey dates + guests), the dated package
// itinerary and exclusions, then the per-person rate and bold VAT-inclusive
// total as the final block — as inline-styled HTML. Content mirrors the quote
// PDF (lib/quotes/pdf/quote-document.tsx) via the shared quote-presentation
// helpers. Each section carries a data-label attribute so the send-dialog
// editor can show a readable name on its locked placeholder card.

import { formatDisplayDate, formatDisplayDateLong } from "@/lib/date-format"
import { QUOTE_VALIDITY_ENABLED } from "@/lib/feature-flags"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { sortItineraryBlocksChronologically } from "@/lib/itinerary/sort-blocks"
import {
  buildQuoteItineraryLines,
  collectQuoteExclusions,
  derivePerPersonRate,
  formatJourneyRange,
  formatPaxLabel,
  formatTotalLabel,
} from "@/lib/quotes/quote-presentation"

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
  /** Package itinerary; empty array omits the section entirely. */
  itineraryBlocks: VoucherServiceBlock[]
  /** Heading for the itinerary section (document-text setting). */
  packageIncludesHeading?: string
  /** Heading for the exclusions section (document-text setting). */
  packageExcludesHeading?: string
  /** Standing exclusion appended after the suppliers' own; empty omits it. */
  packageExcludesDefault?: string
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
const itineraryTitle = "margin:0 0 2px;color:#172018;font-size:13px;font-weight:700;line-height:19px;"
const itineraryText = "margin:0 0 3px;color:#312b24;font-size:13px;line-height:19px;"
const itineraryDetail =
  "margin:0 0 2px;padding-left:12px;color:#554c42;font-size:12px;line-height:17px;"
const excludesItem = "margin:0 0 4px;color:#554c42;font-size:12px;line-height:18px;"

const DEFAULT_INCLUDES_HEADING = "Your Package Includes"
const DEFAULT_EXCLUDES_HEADING = "Your Package Excludes"

export function buildQuoteSummaryBlock(input: QuoteSummaryInput): string {
  const pax = { adults: input.adults, children: input.children }
  const paxLabel = formatPaxLabel(pax)
  const journeyRange = formatJourneyRange(input.journeyStart, input.journeyEnd)
  const perPersonRate = derivePerPersonRate(input.total, pax)

  const metaLines = [
    `<p style="${summaryLine}"><strong>Quote number:</strong> ${escapeHtml(input.quoteNumber)}</p>`,
    `<p style="${summaryLine}"><strong>Quote date:</strong> ${formatQuoteDate(input.quoteDate)}</p>`,
    ...(QUOTE_VALIDITY_ENABLED
      ? [`<p style="${summaryLine}"><strong>Valid until:</strong> ${formatQuoteDate(input.validUntil)}</p>`]
      : []),
    `<p style="${summaryLine}"><strong>Journey:</strong> ${escapeHtml(journeyRange ?? "To be confirmed")}</p>`,
  ]
  if (paxLabel) {
    metaLines.push(`<p style="${summaryLine}"><strong>Guests:</strong> ${escapeHtml(paxLabel)}</p>`)
  }

  const pricing =
    `<div style="${pricingBox}" data-label="Total price">` +
    (perPersonRate !== null
      ? `<p style="${perPersonLine}">${escapeHtml(paxLabel)} x ${formatMoney(perPersonRate)} per person</p>`
      : "") +
    `<p style="${totalLine}">${escapeHtml(formatTotalLabel(pax))}: ${formatMoney(input.total)} (VAT inclusive)</p>` +
    `</div>`

  const sortedBlocks = sortItineraryBlocksChronologically(input.itineraryBlocks)

  let itinerary = ""
  const itineraryLines = buildQuoteItineraryLines(sortedBlocks)
  if (itineraryLines.length > 0) {
    const heading = input.packageIncludesHeading || DEFAULT_INCLUDES_HEADING
    const items = itineraryLines
      .map((line) => {
        const date = line.dateISO
          ? formatDisplayDateLong(line.dateISO) || "Date to be confirmed"
          : "Date to be confirmed"
        const bullets = line.bullets
          .map((bullet) => `<p style="${itineraryDetail}">- ${escapeHtml(bullet)}</p>`)
          .join("")
        return (
          `<div style="margin:0 0 10px;">` +
          `<p style="${itineraryTitle}"><strong>${escapeHtml(date)}</strong></p>` +
          `<p style="${itineraryText}">${escapeHtml(line.text)}</p>` +
          bullets +
          `</div>`
        )
      })
      .join("")
    itinerary =
      `<div data-label="${escapeHtml(heading)}">` +
      `<p style="${sectionHeading}">${escapeHtml(heading)}</p>${items}</div>`
  }

  let excludes = ""
  const exclusions = collectQuoteExclusions(sortedBlocks, input.packageExcludesDefault)
  if (exclusions.length > 0) {
    const heading = input.packageExcludesHeading || DEFAULT_EXCLUDES_HEADING
    const items = exclusions
      .map((item) => `<p style="${excludesItem}">- ${escapeHtml(item)}</p>`)
      .join("")
    excludes =
      `<div data-label="${escapeHtml(heading)}">` +
      `<p style="${sectionHeading}">${escapeHtml(heading)}</p>${items}</div>`
  }

  // The total price block deliberately renders last, directly before whatever
  // text follows the {{quoteSummaryTable}} token in the template.
  return (
    `<div style="${summaryBox}" data-label="Quote details">${metaLines.join("")}</div>` +
    itinerary +
    excludes +
    pricing +
    `<hr style="margin:24px 0 18px;border:none;border-top:1px solid #e8dfd2;" data-label="Divider line"/>`
  )
}
