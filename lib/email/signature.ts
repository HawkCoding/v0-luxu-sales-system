import { toSignatureBrand, type SignatureBrand } from "@/lib/email/signature-brands"
import { getEmailSignatureSettings } from "@/lib/settings-access"
import { createServiceClient } from "@/lib/supabase/server"

export interface ResolvedEmailSignature {
  profileId: string
  brandId: string
  fullName: string
  jobTitle: string | null
  tel: string | null
  cell: string | null
  fax: string | null
  email: string | null
  website: string | null
  brand: SignatureBrand
}

/**
 * Resolve the outgoing-email signature for a sender. SMTP/IMAP only
 * transport a message — nothing appends a signature client-side — so this
 * merges the per-person `email_signatures` row (admin-edited in Settings)
 * with `profiles` for the name/email fallback and a `signature_brands` row
 * for the division chrome (banner, badges, legal text) the salesperson picks
 * in the send dialog.
 *
 * Returns null when signatures are disabled, no profile is resolvable, no
 * brand exists, or the lookup fails — a branding lookup must never block a
 * send. An unknown or disabled `brandId` falls through to the first enabled
 * brand rather than null, so a stale id never silently strips the signature.
 */
export async function resolveEmailSignature(
  profileId: string | null | undefined,
  brandId?: string | null,
): Promise<ResolvedEmailSignature | null> {
  if (!profileId) return null

  try {
    const supabase = createServiceClient()
    const emailSignatureSettings = await getEmailSignatureSettings()
    if (emailSignatureSettings.signature_enabled !== "true") return null

    const [{ data: signature }, { data: profile }, { data: credential }, { data: brandRows }] = await Promise.all([
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
      supabase
        .from("signature_brands")
        .select("*")
        .eq("enabled", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ])

    const brands = brandRows ?? []
    if (brands.length === 0) return null

    const brandRow = (brandId && brands.find((b) => b.id === brandId)) || brands[0]

    const profileName = [profile?.name, profile?.surname].filter(Boolean).join(" ").trim()
    const fullName = signature?.full_name?.trim() || profileName
    if (!fullName) return null

    return {
      profileId,
      brandId: brandRow.id,
      fullName,
      jobTitle: signature?.job_title?.trim() || null,
      tel: signature?.tel?.trim() || null,
      cell: signature?.cell?.trim() || null,
      fax: signature?.fax?.trim() || null,
      email: signature?.email?.trim() || credential?.email_address || profile?.email || null,
      website: signature?.website?.trim() || null,
      brand: toSignatureBrand(brandRow, emailSignatureSettings),
    }
  } catch {
    return null
  }
}
