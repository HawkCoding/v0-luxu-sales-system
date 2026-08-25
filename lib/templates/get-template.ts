import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { isSystemTemplateKey, type SystemTemplateKey } from "@/lib/templates/registry"

export interface EmailTemplate {
  key: string
  subject: string
  bodyHtml: string
}

// Code-level fallbacks so a send never fails because a template row was
// deactivated or deleted. Kept in sync with the seeded system templates.
export const DEFAULT_TEMPLATES: Record<SystemTemplateKey, { subject: string; bodyHtml: string }> = {
  quote_email: {
    subject: "{{supplierName}}/{{clientSurname}}-{{direction}}-{{departureDateShort}}",
    bodyHtml:
      "<p>Dear {{customerName}},</p><p>Thank you for your enquiry.</p><p>We are pleased to share your Luxus Travel &amp; Tours quote for <strong>{{direction}}</strong>, departing <strong>{{departureDate}}</strong>.</p>{{quoteSummaryTable}}<p>The full quotation is also attached as a PDF.</p><p>To accept this quote, please reply to this email and we will prepare the next booking steps for you.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>",
  },
  follow_up: {
    subject: "Following up on your enquiry — {{jobNumber}}",
    bodyHtml:
      "<p>Dear {{customerName}},</p><p>We are following up on the quotation sent on <strong>{{lastSentDate}}</strong>. Availability on peak dates can be limited — we would love to secure your suite.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>",
  },
  reservation_received: {
    subject: "Reservation received — {{jobNumber}}",
    bodyHtml:
      "<p>Dear {{customerName}},</p><p>Thank you for your reservation form well received.</p><p>Confirmation invoice with payment instructions to follow shortly.</p><p>In the meantime, I have secured your suite for you.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>",
  },
  payment_received: {
    subject: "Payment received — {{invoiceNumber}}",
    bodyHtml:
      "<p>Dear {{customerName}},</p><p>Thank you very much for your payment well received.</p><p>Please find attached your amended confirmation invoice.</p><p><strong>PAYMENT SCHEDULE</strong></p><p>Amount received: <strong>{{receivedAmount}}</strong> – Received, thank you</p><p>Final amount due {{finalDueDate}}: <strong>{{outstandingAmount}}</strong></p><p>Hope you have a wonderful day.</p><p>Kind regards,<br/>Luxus Travel &amp; Tours</p>",
  },
  deposit_request: {
    subject: "Deposit Invoice {{invoiceNumber}}",
    bodyHtml:
      "<p>Dear {{customerName}},</p><p>Thank you for confirming your reservation. A deposit of <strong>{{depositAmount}}</strong> ({{depositPercentage}}%) is required to secure your booking, due by <strong>{{dueDate}}</strong>. Invoice <strong>{{invoiceNumber}}</strong> is attached.</p>{{guestInfo}}{{bankingDetails}}<p>Kind regards,<br/>Luxus Travel &amp; Tours</p>",
  },
  full_payment_request: {
    subject: "Invoice {{invoiceNumber}}",
    bodyHtml:
      "<p>Dear {{customerName}},</p><p>As this reservation falls within 60 days of departure, full payment of <strong>{{amountDue}}</strong> is required to secure your booking, due by <strong>{{dueDate}}</strong>. Invoice <strong>{{invoiceNumber}}</strong> is attached.</p>{{guestInfo}}{{bankingDetails}}<p>Kind regards,<br/>Luxus Travel &amp; Tours</p>",
  },
  final_invoice: {
    subject: "Final Invoice {{invoiceNumber}}",
    bodyHtml:
      "<p>Dear {{customerName}},</p><p>Please find attached your final invoice <strong>{{invoiceNumber}}</strong> for <strong>{{amountDue}}</strong>, due by <strong>{{dueDate}}</strong>.</p>{{bankingDetails}}<p>Kind regards,<br/>Luxus Travel &amp; Tours</p>",
  },
  payment_reminder: {
    subject: "Payment Reminder — Invoice {{invoiceNumber}}",
    bodyHtml:
      "<p>Dear {{customerName}},</p><p>This is a friendly reminder that invoice <strong>{{invoiceNumber}}</strong> for <strong>{{amountDue}}</strong> is due by <strong>{{dueDate}}</strong>. Please find the invoice attached.</p>{{bankingDetails}}<p>Kind regards,<br/>Luxus Travel &amp; Tours</p>",
  },
  voucher_email: {
    subject: "Your Travel Voucher — {{jobNumber}}",
    bodyHtml:
      "<p>Dear {{customerName}},</p><p>Your travel voucher for the <strong>{{direction}}</strong> journey is attached, together with your itinerary. Please present the voucher to your service provider on arrival. Safe travels!</p><p>Warm regards,<br/>Luxus Travel &amp; Tours</p>",
  },
  thank_you: {
    subject: "Thank you for travelling with us — {{jobNumber}}",
    bodyHtml:
      "<p>Dear {{customerName}},</p><p>We hope you had a wonderful journey on <strong>{{routeName}}</strong>. Thank you for travelling with Luxus Travel &amp; Tours — it was a privilege to arrange your trip.</p><p>We would love to welcome you aboard again.</p><p>Warm regards,<br/>{{consultantName}}<br/>Luxus Travel &amp; Tours</p>",
  },
}

/**
 * Fetch the active template for a key. System keys always resolve — falling
 * back to the code-level default when the DB row is missing or inactive.
 * Custom keys return null when not found.
 *
 * `supplierId`, when given, tries the (key, supplierId) variant row first
 * (e.g. a Rovos-specific quote_email body) and falls back to the untagged
 * (key, null) row — so a train with no variant of its own keeps using the
 * shared default without any special-casing at the call site.
 */
export async function getTemplate(
  supabase: SupabaseClient<Database>,
  key: string,
  supplierId?: string | null,
): Promise<EmailTemplate | null> {
  if (supplierId) {
    const { data: variant } = await supabase
      .from("templates")
      .select("key, subject, body_html")
      .eq("key", key)
      .eq("supplier_id", supplierId)
      .eq("active", true)
      .maybeSingle()

    if (variant) {
      return { key: variant.key, subject: variant.subject, bodyHtml: variant.body_html }
    }
  }

  const { data } = await supabase
    .from("templates")
    .select("key, subject, body_html")
    .eq("key", key)
    .is("supplier_id", null)
    .eq("active", true)
    .maybeSingle()

  if (data) {
    return { key: data.key, subject: data.subject, bodyHtml: data.body_html }
  }

  if (isSystemTemplateKey(key)) {
    const fallback = DEFAULT_TEMPLATES[key]
    return { key, subject: fallback.subject, bodyHtml: fallback.bodyHtml }
  }

  return null
}
