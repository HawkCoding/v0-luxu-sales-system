import { isRasterAssetUrl } from "@/lib/assets/raster-url"
import { getEmailSignatureSettings, type EmailSignatureSettings } from "@/lib/settings-access"
import { createServiceClient } from "@/lib/supabase/server"

export interface ResolvedEmailSignature {
  fullName: string
  jobTitle: string | null
  tel: string | null
  cell: string | null
  fax: string | null
  email: string | null
  website: string | null
  company: EmailSignatureSettings
}

/**
 * Resolve the outgoing-email signature for a sender. SMTP/IMAP only
 * transport a message — nothing appends a signature client-side — so this
 * merges the per-person `email_signatures` row (admin/manager-edited in
 * Settings) with `profiles` for the name/email fallback and the
 * company-wide chrome from app_settings.
 *
 * Returns null when signatures are disabled, no profile is resolvable, or
 * the lookup fails — a branding lookup must never block a send.
 */
export async function resolveEmailSignature(
  profileId: string | null | undefined,
): Promise<ResolvedEmailSignature | null> {
  if (!profileId) return null

  try {
    const supabase = createServiceClient()
    const company = await getEmailSignatureSettings()
    if (company.signature_enabled !== "true") return null

    const [{ data: signature }, { data: profile }, { data: credential }] = await Promise.all([
      supabase
        .from("email_signatures")
        .select("full_name, job_title, tel, cell, fax, email, website")
        .eq("profile_id", profileId)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("name, surname, email")
        .eq("user_id", profileId)
        .maybeSingle(),
      supabase
        .from("salesperson_credentials")
        .select("email_address")
        .eq("profile_id", profileId)
        .maybeSingle(),
    ])

    const profileName = [profile?.name, profile?.surname].filter(Boolean).join(" ").trim()
    const fullName = signature?.full_name?.trim() || profileName
    if (!fullName) return null

    return {
      fullName,
      jobTitle: signature?.job_title?.trim() || null,
      tel: signature?.tel?.trim() || null,
      cell: signature?.cell?.trim() || null,
      fax: signature?.fax?.trim() || null,
      email: signature?.email?.trim() || credential?.email_address || profile?.email || null,
      website: signature?.website?.trim() || null,
      company: {
        ...company,
        signature_banner_url: isRasterAssetUrl(company.signature_banner_url)
          ? company.signature_banner_url
          : "",
      },
    }
  } catch {
    return null
  }
}
