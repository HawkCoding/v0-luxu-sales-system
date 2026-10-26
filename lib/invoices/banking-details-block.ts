import { EMAIL_COLORS, emailSpacerRow, LAYOUT_TABLE_ATTRS } from "@/lib/email/email-chrome"
import type { BankingSettings } from "@/lib/settings-access"

// Builds the {{bankingDetails}} block token for invoice/reminder email
// templates. Returns an empty string when nothing is configured so templates
// degrade gracefully before Settings are filled in.

// Bank reference shown to the customer: invoice number followed by their
// surname, so a same-day transfer without a matching name is still traceable
// back to the booking (e.g. "37766 Smith").
export function buildPaymentReference(invoiceNumber: string, surname?: string | null): string {
  const trimmedSurname = surname?.trim()
  return trimmedSurname ? `${invoiceNumber} ${trimmedSurname}` : invoiceNumber
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

const BANKING_ROWS: Array<{ key: keyof BankingSettings; label: string }> = [
  { key: "bank_name", label: "Bank" },
  { key: "bank_account_name", label: "Account name" },
  { key: "bank_account_number", label: "Account number" },
  { key: "bank_branch_code", label: "Branch code" },
  { key: "bank_swift_code", label: "SWIFT/BIC" },
]

export function buildBankingDetailsBlock(settings: BankingSettings, invoiceNumber: string): string {
  const rows = BANKING_ROWS.filter(({ key }) => settings[key])
  if (rows.length === 0) return ""

  const lines = [
    ...rows.map(({ key, label }) => `<strong>${label}:</strong> ${escapeHtml(settings[key])}`),
    ...(invoiceNumber ? [`<strong>Payment reference:</strong> ${escapeHtml(invoiceNumber)}`] : []),
  ].join("<br/>")

  // data-label names the locked placeholder card in the send-dialog editor;
  // data-payment-block marks it so PaymentMethodPicker can find and replace
  // it in-place when the salesperson switches payment methods on a send —
  // both sit on the one top-level element, the table.
  //
  // A plain outlined box, no fill (client, 2026-10-26): a single-cell table
  // with the padding and border on the <td>, which Outlook's Word engine keeps
  // (it drops both on a <div>). The gaps around it are spacer rows rather than
  // margins: 10px above (a default paragraph above adds its own 8px — see
  // lib/templates/email-spacing.ts), 18px below.
  return (
    `<table ${LAYOUT_TABLE_ATTRS} data-label="Banking details" data-payment-block="1"><tbody>` +
    emailSpacerRow(10) +
    `<tr><td style="padding:14px 16px;border:1px solid ${EMAIL_COLORS.divider};color:#312b24;font-size:13px;line-height:20px;">` +
    `<p style="margin:0 0 6px;"><strong>Banking details</strong></p>` +
    `<p style="margin:0;">${lines}</p>` +
    `</td></tr>` +
    emailSpacerRow(18) +
    `</tbody></table>`
  )
}
