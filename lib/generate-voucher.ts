import type { Enquiry, ConsultantAbbreviation } from "./types"

interface VoucherData {
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

interface VoucherTemplate {
  headerText: string
  productLine: string
  guidanceText: string
  footerText: string
}

export function generateVoucherHTML(data: VoucherData): string {
  // Get template from localStorage or use defaults
  let template: VoucherTemplate = {
    headerText: "A division of Luxus Travel & Tours",
    productLine: "THE BLUE TRAIN  •  ROVOS RAIL",
    guidanceText: "This voucher confirms your reservation. All services are pre-paid unless indicated. Additional services or upgrades may incur extra charges payable directly to the service provider.",
    footerText: "For any queries, please contact your consultant. Safe travels!"
  }

  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('voucher-template')
    if (saved) {
      const parsed = JSON.parse(saved)
      template = {
        headerText: parsed.headerText,
        productLine: parsed.productLine,
        guidanceText: parsed.guidanceText,
        footerText: parsed.footerText
      }
    }
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Travel Voucher - ${data.voucherNumber}</title>
  <style>
    @page {
      size: A4;
      margin: 20mm;
    }
    body {
      font-family: 'Helvetica', 'Arial', sans-serif;
      font-size: 11pt;
      line-height: 1.4;
      color: #333;
      margin: 0;
      padding: 0;
    }
    .header {
      text-align: center;
      border-bottom: 2px solid #0B2A3A;
      padding-bottom: 10px;
      margin-bottom: 20px;
    }
    .header-subtitle {
      font-size: 9pt;
      color: #666;
      margin-top: 3px;
    }
    .product-line {
      font-size: 9pt;
      font-weight: bold;
      color: #0B2A3A;
      letter-spacing: 1px;
      margin-top: 5px;
    }
    .voucher-number {
      text-align: right;
      font-size: 10pt;
      color: #666;
      margin-bottom: 15px;
    }
    h1 {
      font-size: 18pt;
      color: #0B2A3A;
      margin: 20px 0 10px 0;
      border-bottom: 1px solid #ddd;
      padding-bottom: 5px;
    }
    .guidance {
      background: #f8f9fa;
      border-left: 3px solid #5E7582;
      padding: 10px 15px;
      margin: 15px 0;
      font-size: 9pt;
      color: #555;
    }
    .section {
      margin-bottom: 20px;
    }
    .section-title {
      font-size: 12pt;
      font-weight: bold;
      color: #0B2A3A;
      margin-bottom: 8px;
      border-bottom: 1px solid #ddd;
      padding-bottom: 3px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 130px 1fr;
      gap: 8px 15px;
      margin-bottom: 10px;
    }
    .info-label {
      font-weight: bold;
      color: #555;
      font-size: 10pt;
    }
    .info-value {
      color: #333;
      font-size: 10pt;
    }
    .provider-box {
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 15px;
      margin: 15px 0;
      background: #fafafa;
    }
    .provider-name {
      font-size: 14pt;
      font-weight: bold;
      color: #0B2A3A;
      margin-bottom: 5px;
    }
    .provider-contact {
      font-size: 9pt;
      color: #666;
      margin-bottom: 10px;
    }
    .footer {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 1px solid #ddd;
      text-align: center;
      font-size: 9pt;
      color: #666;
    }
    .page-number {
      text-align: center;
      font-size: 8pt;
      color: #999;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-subtitle">${template.headerText}</div>
    <div class="product-line">${template.productLine}</div>
  </div>

  <div class="voucher-number">
    <strong>Voucher Number:</strong> ${data.voucherNumber}
  </div>

  <h1>TRAVEL VOUCHERS</h1>

  <div class="guidance">
    ${template.guidanceText}
  </div>

  <div class="section">
    <div class="section-title">Guest Information</div>
    <div class="info-grid">
      <div class="info-label">Guest Names:</div>
      <div class="info-value">${data.guestNames}</div>
      
      <div class="info-label">Number of Guests:</div>
      <div class="info-value">${data.numberOfGuests} (${data.enquiry.noOfAdults} adults, ${data.enquiry.noOfChildren} children)</div>
      
      <div class="info-label">Contact Email:</div>
      <div class="info-value">${data.customerEmail}</div>
      
      <div class="info-label">Contact Phone:</div>
      <div class="info-value">${data.customerPhone}</div>
      
      <div class="info-label">Consultant:</div>
      <div class="info-value">${data.consultant} - ${data.consultantName}</div>
      
      ${data.specialRequests ? `
      <div class="info-label">Special Requests:</div>
      <div class="info-value">${data.specialRequests}</div>
      ` : ''}
    </div>
  </div>

  <div class="section">
    <div class="section-title">Service Provider</div>
    <div class="provider-box">
      <div class="provider-name">${data.supplierName}</div>
      <div class="provider-contact">Tel: +27 12 315 8242 • Pretoria, South Africa</div>
      
      <div class="info-grid">
        <div class="info-label">Your Reference:</div>
        <div class="info-value">${data.voucherNumber}</div>
        
        <div class="info-label">Route:</div>
        <div class="info-value">${data.route}</div>
        
        <div class="info-label">Departure Date:</div>
        <div class="info-value">${data.departure}</div>
        
        <div class="info-label">Arrival Date:</div>
        <div class="info-value">${data.arrival || 'TBC'}</div>
        
        <div class="info-label">Suite Type:</div>
        <div class="info-value">${data.suiteType}</div>
        
        <div class="info-label">Number of Suites:</div>
        <div class="info-value">${data.enquiry.noOfSuites}</div>
        
        <div class="info-label">Meal Basis:</div>
        <div class="info-value">Full Board (All meals included)</div>
      </div>
    </div>
  </div>

  <div class="footer">
    ${template.footerText}
  </div>

  <div class="page-number">Page 1 of 1</div>
</body>
</html>
  `

  return html
}

export function downloadVoucherPDF(html: string, filename: string) {
  // Create a blob with the HTML content
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  
  // Open in new window for printing/saving as PDF
  const printWindow = window.open(url, '_blank')
  if (printWindow) {
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print()
        URL.revokeObjectURL(url)
      }, 250)
    }
  }
}
