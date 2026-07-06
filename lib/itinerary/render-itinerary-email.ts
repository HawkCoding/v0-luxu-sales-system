import { render } from "@react-email/render"
import { createElement } from "react"
import { ItineraryEmail, type ItineraryEmailProps } from "@/emails/itinerary-email"
import { getEmailFooterTagline } from "@/lib/settings-access"

export async function renderItineraryEmail(props: ItineraryEmailProps): Promise<string> {
  const footerTagline = await getEmailFooterTagline()
  return render(createElement(ItineraryEmail, { ...props, footerTagline }))
}
