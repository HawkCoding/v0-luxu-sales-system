import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { SupplierKind } from "@/lib/types"

async function safeQuery<T>(build: () => PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> {
  try {
    const { data } = await build()
    return data ?? null
  } catch {
    return null
  }
}

/** The supplier's kind, for deciding which leg dates the trip and what a document calls it. */
export async function loadSupplierKind(
  supabase: SupabaseClient<Database>,
  supplierId: string | null,
): Promise<SupplierKind | null> {
  if (!supplierId) return null
  const row = await safeQuery<{ kind: SupplierKind }>(() =>
    supabase.from("suppliers").select("kind").eq("id", supplierId).maybeSingle(),
  )
  return row?.kind ?? null
}
