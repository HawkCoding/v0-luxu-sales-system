import { render } from "@react-email/render"
import { createElement } from "react"
import { InvoiceEmail, type InvoiceEmailProps } from "@/emails/invoice-email"

export async function renderInvoiceEmail(props: InvoiceEmailProps): Promise<string> {
  return render(createElement(InvoiceEmail, props))
}
