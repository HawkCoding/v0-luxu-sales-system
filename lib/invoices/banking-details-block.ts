import type { BankingSettings } from "@/lib/settings-access"

// Builds the {{bankingDetails}} block token for invoice/reminder email
// templates. Returns an empty string when nothing is configured so templates
// degrade gracefully before Settings are filled in.

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
  { key: "payment_reference_hint", label: "Payment reference" },
]

export function buildBankingDetailsBlock(settings: BankingSettings): string {
  const rows = BANKING_ROWS.filter(({ key }) => settings[key])
  if (rows.length === 0) return ""

  const lines = rows
    .map(
      ({ key, label }) =>
        `<strong>${label}:</strong> ${escapeHtml(settings[key])}`,
    )
    .join("<br/>")

  // data-label names the locked placeholder card in the send-dialog editor.
  return (
    `<div style="margin:18px 0;padding:14px 16px;background-color:#fbf8f3;border:1px solid #e8dfd2;` +
    `color:#312b24;font-size:13px;line-height:20px;" data-label="Banking details">` +
    `<p style="margin:0 0 6px;"><strong>Banking details</strong></p>` +
    `<p style="margin:0;">${lines}</p>` +
    `</div>`
  )
}
