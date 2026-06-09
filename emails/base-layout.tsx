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
import { BRAND_NAME, BRAND_LOGO_URL } from "@/lib/brand"

interface BaseLayoutProps {
  preview: string
  children: ReactNode
}

export function BaseLayout({ preview, children }: BaseLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Img
              alt={BRAND_NAME}
              height="48"
              src={BRAND_LOGO_URL}
              style={logo}
            />
          </Section>
          <Section style={content}>{children}</Section>
          <Section style={footer}>
            <Text style={footerText}>{BRAND_NAME}</Text>
            <Text style={footerText}>Luxury train journeys, handled with care.</Text>
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
