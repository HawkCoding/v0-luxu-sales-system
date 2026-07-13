// Builds the {{quoteSummaryTable}} block token for the quote_email template:
// quote meta summary, line-item table, and totals as inline-styled HTML.
// Styling mirrors the retired emails/quote-email.tsx React Email component.

export interface QuoteSummaryLineItem {
  description: string
  supplierDescription?: string | null
  qty: number
  unitPrice: number
  total: number
}

export interface QuoteSummaryInput {
  quoteNumber: string
  quoteDate: string
  validUntil: string | null
  subtotal: number
  vat: number
  total: number
  lineItems: QuoteSummaryLineItem[]
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatQuoteDate(value: string | null): string {
  if (!value) return "To be confirmed"
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`))
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
const headerCell =
  "padding:10px 8px;border-bottom:1px solid #d8cdbc;color:#6f675d;font-size:11px;text-transform:uppercase;"
const bodyCell =
  "padding:10px 8px;border-bottom:1px solid #eee6dc;color:#312b24;font-size:13px;line-height:18px;"
const supplierNote =
  "display:block;margin-top:3px;color:#8a7f74;font-size:11px;font-style:italic;line-height:16px;"

export function buildQuoteSummaryBlock(input: QuoteSummaryInput): string {
  const rows = input.lineItems
    .map((item) => {
      const supplier = item.supplierDescription
        ? `<span style="${supplierNote}">${escapeHtml(item.supplierDescription)}</span>`
        : ""
      const unitPrice = item.unitPrice === 0 ? "Included" : formatMoney(item.unitPrice)
      const total = item.total === 0 ? "—" : formatMoney(item.total)
      return (
        `<tr><td style="${bodyCell}">${escapeHtml(item.description)}${supplier}</td>` +
        `<td style="${bodyCell}text-align:right;white-space:nowrap;">${item.qty}</td>` +
        `<td style="${bodyCell}text-align:right;white-space:nowrap;">${unitPrice}</td>` +
        `<td style="${bodyCell}text-align:right;white-space:nowrap;">${total}</td></tr>`
      )
    })
    .join("")

  return (
    `<div style="${summaryBox}">` +
    `<p style="${summaryLine}"><strong>Quote number:</strong> ${escapeHtml(input.quoteNumber)}</p>` +
    `<p style="${summaryLine}"><strong>Quote date:</strong> ${formatQuoteDate(input.quoteDate)}</p>` +
    `<p style="${summaryLine}"><strong>Valid until:</strong> ${formatQuoteDate(input.validUntil)}</p>` +
    `</div>` +
    `<table style="width:100%;border-collapse:collapse;margin-top:18px;">` +
    `<thead><tr>` +
    `<th style="${headerCell}text-align:left;">Description</th>` +
    `<th style="${headerCell}text-align:right;">Qty</th>` +
    `<th style="${headerCell}text-align:right;">Unit price</th>` +
    `<th style="${headerCell}text-align:right;">Total</th>` +
    `</tr></thead><tbody>${rows}</tbody></table>` +
    `<div style="margin-top:16px;text-align:right;">` +
    `<p style="margin:0 0 4px;color:#554c42;font-size:13px;">Subtotal: ${formatMoney(input.subtotal)}</p>` +
    `<p style="margin:0 0 4px;color:#554c42;font-size:13px;">VAT: ${formatMoney(input.vat)}</p>` +
    `<p style="margin:8px 0 0;color:#172018;font-size:16px;font-weight:700;">Total: ${formatMoney(input.total)}</p>` +
    `</div>` +
    `<hr style="margin:24px 0 18px;border:none;border-top:1px solid #e8dfd2;"/>`
  )
}
