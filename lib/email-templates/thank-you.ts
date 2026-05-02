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
  const subject = `Thank you for travelling with Luxus - ${greetingName}`
  const bodyText = [
    `Dear ${greetingName},`,
    "",
    `Thank you for choosing Luxus to help create lasting memories on ${route}. We hope your journey, which concluded on ${tripEndDate}, was everything you imagined and more.`,
    "",
    "It was a privilege to be part of your travel plans. We would be grateful to hear any feedback when you have a moment.",
    "",
    `Warm regards,`,
    consultantName.trim() || "The Luxus team",
  ].join("\n")
  const bodyHtml = `
    <p>Dear ${greetingName},</p>
    <p>Thank you for choosing Luxus to help create lasting memories on ${route}. We hope your journey, which concluded on ${tripEndDate}, was everything you imagined and more.</p>
    <p>It was a privilege to be part of your travel plans. We would be grateful to hear any feedback when you have a moment.</p>
    <p>Warm regards,<br>${consultantName.trim() || "The Luxus team"}</p>
  `.trim()

  return { subject, bodyHtml, bodyText }
}
