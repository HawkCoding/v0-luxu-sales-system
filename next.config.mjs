/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Voucher/itinerary PDF fonts are read from disk at render time; make sure
  // every serverless route that renders a voucher-family PDF bundles them.
  outputFileTracingIncludes: {
    "/api/voucher/generate": ["./assets/fonts/**"],
    "/api/itinerary/generate": ["./assets/fonts/**"],
  },
}

export default nextConfig
