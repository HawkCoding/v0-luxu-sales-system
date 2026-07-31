import type { SupabaseClient } from "@supabase/supabase-js"
import { createServiceClient } from "@/lib/supabase/server"
import type { Database } from "@/lib/supabase/types"

/** Why the sender resolved the way it did — lets callers explain a missing mailbox precisely. */
export type ResolvedSenderReason =
  | "credential"
  | "profile-email"
  | "no-salesperson"
  | "lookup-failed"

export interface ResolvedSender {
  /** From address to use, or null when no salesperson-specific address exists. */
  fromAddress: string | null
  /** Credential id for per-salesperson SMTP routing in sendEmail, if configured. */
  salespersonCredentialId: string | null
  reason: ResolvedSenderReason
}

/**
 * Resolve the sending identity for a booking's assigned salesperson:
 * their SMTP credential (preferred — routes the send through their own
 * mailbox), falling back to their profile email as a From header only.
 *
 * The credential lookup uses the service client on purpose: which mailbox an
 * email leaves from is transport routing, not user-visible data, and RLS on
 * salesperson_credentials only lets a consultant read their own row — under the
 * session client a consultant sending for another salesperson's booking would
 * silently resolve to "no credential". Only `id` and `email_address` are read;
 * `encrypted_password` never leaves smtp-transport.
 */
export async function resolveSalespersonSender(
  supabase: SupabaseClient<Database>,
  salespersonProfileId: string | null | undefined,
): Promise<ResolvedSender> {
  if (!salespersonProfileId) {
    return { fromAddress: null, salespersonCredentialId: null, reason: "no-salesperson" }
  }

  const service = createServiceClient()
  const { data: credential, error: credentialError } = await service
    .from("salesperson_credentials")
    .select("id, email_address")
    .eq("profile_id", salespersonProfileId)
    .maybeSingle()

  if (credentialError) {
    console.error("[email] salesperson credential lookup failed", credentialError.message)
    return { fromAddress: null, salespersonCredentialId: null, reason: "lookup-failed" }
  }

  if (credential) {
    return {
      fromAddress: credential.email_address,
      salespersonCredentialId: credential.id,
      reason: "credential",
    }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("user_id", salespersonProfileId)
    .maybeSingle()

  return {
    fromAddress: profile?.email ?? null,
    salespersonCredentialId: null,
    reason: "profile-email",
  }
}
