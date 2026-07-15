import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import type { ReactNode } from "react"

interface BaseLayoutProps {
  preview: string
  children: ReactNode
  footerTagline?: string
  /** Absolute URL of the brand logo; null renders a text wordmark instead. */
  logoUrl?: string | null
}

export function BaseLayout({ preview, children, footerTagline, logoUrl }: BaseLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            {logoUrl ? (
              <Img alt="Luxus Travel & Tours" height="48" src={logoUrl} style={logo} />
            ) : (
              <Text style={wordmark}>Luxus Travel &amp; Tours</Text>
            )}
          </Section>
          <Section style={content}>{children}</Section>
          <Section style={footer}>
            <Text style={footerText}>Luxus Travel & Tours</Text>
            <Text style={footerText}>{footerTagline?.trim() || "Luxury train journeys, handled with care."}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const body = {
  margin: "0",
  backgroundColor: "#f6f2ea",
  fontFamily: "Arial, sans-serif",
}

const container = {
  width: "100%",
  maxWidth: "640px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
}

const header = {
  padding: "24px 32px 12px",
  borderBottom: "1px solid #e8dfd2",
}

const logo = {
  display: "block",
  objectFit: "contain" as const,
}

const wordmark = {
  margin: "0",
  color: "#2f2a24",
  fontSize: "20px",
  lineHeight: "28px",
  fontWeight: "bold" as const,
  letterSpacing: "0.4px",
}

const content = {
  padding: "28px 32px",
}

const footer = {
  padding: "18px 32px 24px",
  borderTop: "1px solid #e8dfd2",
  backgroundColor: "#fbf8f3",
}

const footerText = {
  margin: "0 0 4px",
  color: "#6f675d",
  fontSize: "12px",
  lineHeight: "18px",
}
