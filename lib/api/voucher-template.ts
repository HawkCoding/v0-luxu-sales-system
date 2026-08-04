import type { createSessionClient } from "@/lib/supabase/server"

export async function getOrCreateVoucherTemplateId(
  supabase: Awaited<ReturnType<typeof createSessionClient>>,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("voucher_template")
    .select("id")
    .maybeSingle()

  if (existing) return existing.id

  const { data: inserted, error } = await supabase
    .from("voucher_template")
    .insert({})
    .select("id")
    .single()

  if (error || !inserted) {
    console.error("voucher-template:create-singleton", error)
    return null
  }

  return inserted.id
}
