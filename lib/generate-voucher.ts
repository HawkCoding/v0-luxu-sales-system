import type { Enquiry, ConsultantAbbreviation, VoucherTemplate } from "./types"
import { VOUCHER_TEMPLATE_DEFAULTS } from "./types"

export interface VoucherData {
  voucherNumber: string
  guestNames: string
  consultantName: string
  supplierName: string
  route: string
  departure: string
  arrival: string
  suiteType: string
  numberOfGuests: number
  specialRequests: string
  customerEmail: string
  customerPhone: string
  enquiry: Enquiry
  consultant: ConsultantAbbreviation
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;"
      case "<":
        return "&lt;"
      case ">":
        return "&gt;"
      case '"':
        return "&quot;"
      case "'":
        return "&#39;"
      default:
        return char
    }
  })
}

function sanitizeFontFamily(value: string): string {
  const trimmed = value.trim()
  return /^[\w\s'",-]+$/.test(trimmed) ? trimmed : VOUCHER_TEMPLATE_DEFAULTS.font_family
}

function buildHeaderHtml(t: VoucherTemplate): string {
  const hasLogo = Boolean(t.logo_url)
  const hasBanner = Boolean(t.banner_url)

  if (hasLogo && hasBanner) {
    return `
    <div class="header header-split">
      <div class="header-logo-side">
        <img src="${escapeHtml(t.logo_url)}" alt="Logo" class="header-logo" />
      </div>
      <div class="header-banner-side">
        <img src="${escapeHtml(t.banner_url)}" alt="Header" class="header-banner" />
        <div class="header-text-overlay">
          <div class="product-line">${escapeHtml(t.product_line)}</div>
          <div class="header-subtitle">${escapeHtml(t.header_text)}</div>
        </div>
      </div>
    </div>`
  }

  if (hasLogo) {
    return `
    <div class="header header-logo-only">
      <img src="${escapeHtml(t.logo_url)}" alt="Logo" class="header-logo-center" />
      <div class="product-line">${escapeHtml(t.product_line)}</div>
      <div class="header-subtitle">${escapeHtml(t.header_text)}</div>
    </div>`
  }

  if (hasBanner) {
    return `
    <div class="header header-banner-only">
      <img src="${escapeHtml(t.banner_url)}" alt="Header" class="header-banner-full" />
      <div class="header-text-below">
        <div class="product-line">${escapeHtml(t.product_line)}</div>
        <div class="header-subtitle">${escapeHtml(t.header_text)}</div>
      </div>
    </div>`
  }

  return `
  <div class="header header-text-only">
    <div class="product-line">${escapeHtml(t.product_line)}</div>
    <div class="header-subtitle">${escapeHtml(t.header_text)}</div>
  </div>`
}

function buildGuestInfoSection(data: VoucherData): string {
  const specialRequestsHtml = data.specialRequests
    ? `

      <div class="info-label">Special Requests:</div>
      <div class="info-value">${escapeHtml(data.specialRequests)}</div>`
    : ""

  return `
  <div class="section">
    <div class="section-title">Guest Information</div>
    <div class="info-grid">
      <div class="info-label">Guest Names:</div>
      <div class="info-value">${escapeHtml(data.guestNames)}</div>

      <div class="info-label">Number of Guests:</div>
      <div class="info-value">${escapeHtml(data.numberOfGuests)} (${escapeHtml(data.enquiry.noOfAdults)} adults${data.enquiry.noOfChildren ? `, ${escapeHtml(data.enquiry.noOfChildren)} children` : ""})</div>

      <div class="info-label">Contact Email:</div>
      <div class="info-value">${escapeHtml(data.customerEmail)}</div>

      <div class="info-label">Contact Phone:</div>
      <div class="info-value">${escapeHtml(data.customerPhone)}</div>

      <div class="info-label">Consultant:</div>
      <div class="info-value">${escapeHtml(data.consultant)} – ${escapeHtml(data.consultantName)}</div>
${specialRequestsHtml}
    </div>
  </div>`
}

function buildServiceProviderSection(data: VoucherData): string {
  return `
  <div class="section">
    <div class="section-title">Service Provider</div>
    <div class="provider-box">
      <div class="provider-name">${escapeHtml(data.supplierName)}</div>

      <div class="info-grid">
        <div class="info-label">Your Reference:</div>
        <div class="info-value">${escapeHtml(data.voucherNumber)}</div>

        <div class="info-label">Route:</div>
        <div class="info-value">${escapeHtml(data.route)}</div>

        <div class="info-label">Departure Date:</div>
        <div class="info-value">${escapeHtml(data.departure)}</div>

        <div class="info-label">Arrival Date:</div>
        <div class="info-value">${escapeHtml(data.arrival || "TBC")}</div>

        <div class="info-label">Suite Type:</div>
        <div class="info-value">${escapeHtml(data.suiteType)}</div>

        <div class="info-label">Number of Suites:</div>
        <div class="info-value">${escapeHtml(data.enquiry.noOfSuites)}</div>

        <div class="info-label">Meal Basis:</div>
        <div class="info-value">Full Board (All meals included)</div>
      </div>
    </div>
  </div>`
}

function buildFooterSection(t: VoucherTemplate): string {
  const parts = [t.footer_company, t.footer_phone, t.footer_email].filter(Boolean)
  return `
  <div class="section footer-section">
    <div class="footer-contact">${parts.map((part) => escapeHtml(part)).join(" &bull; ")}</div>
  </div>`
}

export function generateVoucherHTML(data: VoucherData, template?: VoucherTemplate): string {
  const t: VoucherTemplate = template ?? VOUCHER_TEMPLATE_DEFAULTS

  const sectionOrder = t.section_order.length > 0
    ? t.section_order
    : (["guest_info", "service_provider", "footer"] as const)

  const hidden = new Set(t.hidden_sections)

  const sectionHtml = sectionOrder
    .filter((s) => !hidden.has(s))
    .map((s) => {
      if (s === "guest_info") return buildGuestInfoSection(data)
      if (s === "service_provider") return buildServiceProviderSection(data)
      if (s === "footer") return buildFooterSection(t)
      return ""
    })
    .join("\n")

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Travel Voucher – ${escapeHtml(data.voucherNumber)}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    body {
      font-family: ${sanitizeFontFamily(t.font_family)};
      font-size: 11pt;
      line-height: 1.4;
      color: #333;
      margin: 0;
      padding: 0;
    }

    /* Header variants */
    .header { margin-bottom: 20px; }
    .header-split { display: flex; align-items: stretch; border-bottom: 2px solid ${t.accent_colour}; }
    .header-logo-side { width: 120px; min-width: 120px; display: flex; align-items: center; justify-content: center; padding: 8px; background: #fff; }
    .header-logo { max-width: 100px; max-height: 80px; object-fit: contain; }
    .header-banner-side { flex: 1; position: relative; overflow: hidden; }
    .header-banner { width: 100%; height: 100px; object-fit: cover; display: block; }
    .header-text-overlay { position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.45); padding: 6px 12px; }
    .header-text-overlay .product-line { color: #fff; font-size: 10pt; font-weight: bold; letter-spacing: 1px; margin: 0; }
    .header-text-overlay .header-subtitle { color: rgba(255,255,255,0.85); font-size: 8pt; font-style: italic; margin: 0; }

    .header-logo-only { text-align: center; padding-bottom: 10px; border-bottom: 2px solid ${t.accent_colour}; }
    .header-logo-center { max-height: 70px; object-fit: contain; margin-bottom: 6px; }

    .header-banner-only .header-banner-full { width: 100%; max-height: 110px; object-fit: cover; display: block; }
    .header-text-below { text-align: center; padding: 6px 0; border-bottom: 2px solid ${t.accent_colour}; }

    .header-text-only { text-align: center; padding-bottom: 10px; border-bottom: 2px solid ${t.accent_colour}; }

    .product-line { font-size: 9pt; font-weight: bold; color: ${t.accent_colour}; letter-spacing: 1px; margin-top: 5px; }
    .header-subtitle { font-size: 9pt; color: #666; font-style: italic; margin-top: 3px; }

    /* Voucher number banner */
    .voucher-number-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 16px 0 8px;
    }
    h1 { font-size: 18pt; color: ${t.accent_colour}; margin: 0; }
    .voucher-badge {
      border: 2px solid ${t.accent_colour};
      padding: 4px 12px;
      font-size: 11pt;
      font-weight: bold;
      color: ${t.accent_colour};
      border-radius: 3px;
    }

    .guidance {
      background: #f8f9fa;
      border-left: 3px solid ${t.section_bg};
      padding: 10px 15px;
      margin: 14px 0;
      font-size: 9pt;
      color: #555;
      font-style: italic;
    }

    .section { margin-bottom: 20px; }
    .section-title {
      font-size: 11pt;
      font-weight: bold;
      color: #fff;
      background: ${t.section_bg};
      padding: 5px 10px;
      margin-bottom: 8px;
      border-radius: 2px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 150px 1fr;
      gap: 6px 12px;
    }
    .info-label { font-weight: bold; color: #555; font-size: 10pt; }
    .info-value { color: #333; font-size: 10pt; }

    .provider-box {
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 14px;
      background: #fafafa;
    }
    .provider-name { font-size: 13pt; font-weight: bold; color: ${t.accent_colour}; margin-bottom: 10px; }

    .footer-section { margin-top: 30px; padding-top: 14px; border-top: 1px solid #ddd; }
    .footer-contact { text-align: center; font-size: 9pt; color: #666; }

    .page-number { text-align: center; font-size: 8pt; color: #999; margin-top: 20px; }
  </style>
</head>
<body>
${buildHeaderHtml(t)}

  <div class="voucher-number-row">
    <h1>TRAVEL VOUCHERS</h1>
    <div class="voucher-badge">Voucher no. ${escapeHtml(data.voucherNumber)}</div>
  </div>

${t.guidance_text ? `<div class="guidance">${escapeHtml(t.guidance_text)}</div>` : ""}

${sectionHtml}

  <div class="page-number">Page 1 of 1</div>
</body>
</html>`
}

export function downloadVoucherPDF(html: string, _filename: string) {
  const blob = new Blob([html], { type: "text/html" })
  const url = URL.createObjectURL(blob)
  const printWindow = window.open(url, "_blank")
  if (printWindow) {
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print()
        URL.revokeObjectURL(url)
      }, 250)
    }
  }
}
