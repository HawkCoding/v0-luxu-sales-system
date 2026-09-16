import { createServiceClient } from "@/lib/supabase/server"

/**
 * Resolve the display name for the From header of an outbound email:
 * "<agent full name> - <signature brand name>". Mirrors the name/brand
 * fallback chain in resolveEmailSignature (lib/email/signature.ts) but is
 * independent of the `signature_enabled` setting — the From header should
 * carry the agent's name even when the in-body signature block is off.
 *
 * Returns null when no profile id is given, no name is resolvable, or the
 * lookup fails — a branding lookup must never block a send.
 */
export async function resolveSenderDisplayName(
  profileId: string | null | undefined,
  brandId?: string | null,
): Promise<string | null> {
  if (!profileId) return null

  try {
    const supabase = createServiceClient()

    const [{ data: signature }, { data: profile }, { data: brandRows }] = await Promise.all([
      supabase
        .from("email_signatures")
        .select("full_name")
        .eq("profile_id", profileId)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("name, surname")
        .eq("user_id", profileId)
        .maybeSingle(),
      supabase
        .from("signature_brands")
        .select("id, name")
        .eq("enabled", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ])

    const profileName = [profile?.name, profile?.surname].filter(Boolean).join(" ").trim()
    const fullName = signature?.full_name?.trim() || profileName
    if (!fullName) return null

    const brands = brandRows ?? []
    const brand = (brandId && brands.find((b) => b.id === brandId)) || brands[0] || null

    return brand ? `${fullName} - ${brand.name}` : fullName
  } catch {
    return null
  }
}

/**
 * Format a display name + address as an RFC 5322 From header value, quoting
 * the display name so commas, quotes and non-ASCII characters (e.g.
 * "Carmen De Jongh - SA Rail") survive intact. Falls back to the bare
 * address when no name is resolvable.
 */
export function formatFromHeader(name: string | null | undefined, address: string): string {
  const trimmed = name?.trim()
  if (!trimmed) return address
  const escaped = trimmed.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
  return `"${escaped}" <${address}>`
}
