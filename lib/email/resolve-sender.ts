import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

export interface ResolvedSender {
  /** From address to use, or null when no salesperson-specific address exists. */
  fromAddress: string | null
  /** Credential id for per-salesperson SMTP routing in sendEmail, if configured. */
  salespersonCredentialId: string | null
}

/**
 * Resolve the sending identity for a booking's assigned salesperson:
 * their SMTP credential (preferred — routes the send through their own
 * mailbox), falling back to their profile email as a From header only.
 */
export async function resolveSalespersonSender(
  supabase: SupabaseClient<Database>,
  salespersonProfileId: string | null | undefined,
): Promise<ResolvedSender> {
  if (!salespersonProfileId) {
    return { fromAddress: null, salespersonCredentialId: null }
  }

  const { data: credential } = await supabase
    .from("salesperson_credentials")
    .select("id, email_address")
    .eq("profile_id", salespersonProfileId)
    .maybeSingle()

  if (credential) {
    return { fromAddress: credential.email_address, salespersonCredentialId: credential.id }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("user_id", salespersonProfileId)
    .maybeSingle()

  return { fromAddress: profile?.email ?? null, salespersonCredentialId: null }
}
