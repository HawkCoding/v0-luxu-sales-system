const PDF_ASSETS = ["./assets/fonts/**", "./assets/brand/**"]

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Client crash reports arrive as minified frames (`eB` at char 123534), which cannot be traced
  // back to a file without maps. The app is login-gated and no secret ships in a client bundle, so
  // the only cost is that the original source is readable in devtools.
  productionBrowserSourceMaps: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ]
  },
  // Document PDF fonts, the page background and the fallback seal are read from disk at render
  // time; make sure every serverless route that renders a quote/invoice/voucher/itinerary PDF
  // bundles them.
  outputFileTracingIncludes: {
    "/api/voucher/generate": PDF_ASSETS,
    "/api/vouchers/[id]/prepare-send": PDF_ASSETS,
    "/api/invoices/deposit": PDF_ASSETS,
    "/api/invoices/[id]/reminder": PDF_ASSETS,
    "/api/jobs/[id]/payment-received": PDF_ASSETS,
    "/api/jobs/[id]/worksheet": PDF_ASSETS,
    "/api/quotes/[id]/pdf": PDF_ASSETS,
    "/api/correspondence": PDF_ASSETS,
    "/api/pdf-preview/[type]": PDF_ASSETS,
  },
}

export default nextConfig
