import { BRAND_SHORT_NAME } from "@/lib/brand"

export interface RenderThankYouEmailInput {
  customerFirstName: string
  routeName: string
  tripEndDate: string
  consultantName: string
}

export interface RenderedThankYouEmail {
  subject: string
  bodyHtml: string
  bodyText: string
}

export function renderThankYouEmail({
  customerFirstName,
  routeName,
  tripEndDate,
  consultantName,
}: RenderThankYouEmailInput): RenderedThankYouEmail {
  const greetingName = customerFirstName.trim() || "there"
  const route = routeName.trim() || "your journey"
  const subject = `Thank you for travelling with ${BRAND_SHORT_NAME} - ${greetingName}`
  const bodyText = [
    `Dear ${greetingName},`,
    "",
    `Thank you for choosing ${BRAND_SHORT_NAME} to help create lasting memories on ${route}. We hope your journey, which concluded on ${tripEndDate}, was everything you imagined and more.`,
    "",
    "It was a privilege to be part of your travel plans. We would be grateful to hear any feedback when you have a moment.",
    "",
    `Warm regards,`,
    consultantName.trim() || `The ${BRAND_SHORT_NAME} team`,
  ].join("\n")
  const bodyHtml = `
    <p>Dear ${greetingName},</p>
    <p>Thank you for choosing ${BRAND_SHORT_NAME} to help create lasting memories on ${route}. We hope your journey, which concluded on ${tripEndDate}, was everything you imagined and more.</p>
    <p>It was a privilege to be part of your travel plans. We would be grateful to hear any feedback when you have a moment.</p>
    <p>Warm regards,<br>${consultantName.trim() || `The ${BRAND_SHORT_NAME} team`}</p>
  `.trim()

  return { subject, bodyHtml, bodyText }
}
