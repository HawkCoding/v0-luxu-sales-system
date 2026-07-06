import { render } from "@react-email/render"
import { createElement } from "react"
import { QuoteEmail, type QuoteEmailProps } from "@/emails/quote-email"
import { getEmailFooterTagline } from "@/lib/settings-access"

export async function renderQuoteEmail(props: QuoteEmailProps): Promise<string> {
  const footerTagline = await getEmailFooterTagline()
  return render(createElement(QuoteEmail, { ...props, footerTagline }))
}
