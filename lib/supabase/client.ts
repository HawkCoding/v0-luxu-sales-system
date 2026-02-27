import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./types"

let supabase: SupabaseClient<Database> | null = null

// Browser / Client Component singleton
// Uses the anon key — subject to RLS policies.
// Authenticated staff sessions are managed via Supabase Auth.
export function getSupabase() {
  if (supabase) return supabase

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase public env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel."
    )
  }

  supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
  return supabase
}
