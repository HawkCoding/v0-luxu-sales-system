import type { Metadata } from 'next'
import { Playfair_Display, Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/theme-provider'
import { getAppBranding } from '@/lib/branding/app-logo'
import './globals.css'

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-playfair",
})

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

// Dynamic so an uploaded logo (Settings > Company Information) becomes the
// browser tab icon. There's no committed favicon file to fall back to — a
// removed logo means no favicon, which is the chosen behavior; the browser's
// default icon takes over.
export async function generateMetadata(): Promise<Metadata> {
  const { logoUrl, businessName } = await getAppBranding()

  return {
    title: `${businessName} - Sales Operations`,
    description: `Internal sales ops system for ${businessName}`,
    icons: logoUrl ? { icon: [{ url: logoUrl, type: 'image/png' }] } : { icon: [] },
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
          <Toaster position="top-right" duration={2500} />
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  )
}
