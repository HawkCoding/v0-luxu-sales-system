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
  // Document PDF fonts are read from disk at render time; make sure every
  // serverless route that renders a voucher/itinerary/invoice PDF bundles them.
  outputFileTracingIncludes: {
    "/api/voucher/generate": ["./assets/fonts/**"],
    "/api/vouchers/[id]/prepare-send": ["./assets/fonts/**"],
    "/api/invoices/deposit": ["./assets/fonts/**"],
    "/api/invoices/[id]/reminder": ["./assets/fonts/**"],
    "/api/jobs/[id]/payment-received": ["./assets/fonts/**"],
    "/api/pdf-preview/[type]": ["./assets/fonts/**"],
  },
}

export default nextConfig
