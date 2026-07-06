import { render } from "@react-email/render"
import { createElement } from "react"
import { InvoiceEmail, type InvoiceEmailProps } from "@/emails/invoice-email"
import { getEmailFooterTagline } from "@/lib/settings-access"

export async function renderInvoiceEmail(props: InvoiceEmailProps): Promise<string> {
  const footerTagline = await getEmailFooterTagline()
  return render(createElement(InvoiceEmail, { ...props, footerTagline }))
}
