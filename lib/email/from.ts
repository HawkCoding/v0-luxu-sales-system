import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

const DEFAULT_FROM_ADDRESS = "Luxus <onboarding@resend.dev>"

type SettingsClient = Pick<
  SupabaseClient<Database>,
  "from"
>

export async function getEmailFromAddress(supabase?: SettingsClient): Promise<string> {
  if (supabase) {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "email_from_address")
      .maybeSingle()

    if (!error && typeof data?.value === "string" && data.value.trim()) {
      return data.value.trim()
    }
  }

  return (
    process.env.EMAIL_FROM_ADDRESS?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    DEFAULT_FROM_ADDRESS
  )
}
