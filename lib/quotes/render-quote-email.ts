import { render } from "@react-email/render"
import { createElement } from "react"
import { QuoteEmail, type QuoteEmailProps } from "@/emails/quote-email"

export async function renderQuoteEmail(props: QuoteEmailProps): Promise<string> {
  return render(createElement(QuoteEmail, props))
}
