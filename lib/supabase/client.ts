import { createClient } from "@supabase/supabase-js"
import type { Database } from "./types"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Browser / Client Component singleton
// Uses the anon key — subject to RLS policies.
// Authenticated staff sessions are managed via Supabase Auth.
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
