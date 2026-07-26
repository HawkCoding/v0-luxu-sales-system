import { getAppBranding } from "@/lib/branding/app-logo"

// Intentionally unauthenticated: the login screen needs the app logo and
// company name before a session exists. No new disclosure — the storage
// bucket is already public and the company name appears on every outbound
// document. Do not add anything else to this response.
export async function GET() {
  const branding = await getAppBranding()
  return Response.json(branding)
}
