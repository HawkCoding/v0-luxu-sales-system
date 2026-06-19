import { render } from "@react-email/render"
import { createElement } from "react"
import { ItineraryEmail, type ItineraryEmailProps } from "@/emails/itinerary-email"

export async function renderItineraryEmail(props: ItineraryEmailProps): Promise<string> {
  return render(createElement(ItineraryEmail, props))
}
