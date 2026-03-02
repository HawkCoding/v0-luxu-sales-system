import type { Metadata } from 'next'
import { Playfair_Display, Inter } from 'next/font/google'
import dynamic from 'next/dynamic'
import { Toaster } from 'sonner'
import './globals.css'

const Analytics = dynamic(
  () => import('@vercel/analytics/next').then((mod) => mod.Analytics),
  { ssr: false }
)

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-playfair",
})

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

export const metadata: Metadata = {
  title: 'Luxus - Travel Sales Operations',
  description: 'Internal sales ops system for Luxus Travel & Tours',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        {children}
        <Toaster position="top-right" />
        {process.env.VERCEL && <Analytics />}
      </body>
    </html>
  )
}
