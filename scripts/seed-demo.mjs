#!/usr/bin/env node
/**
 * Applies supabase/seed-demo.sql against the local Supabase database by
 * piping the SQL into psql inside the running Supabase Postgres container.
 *
 * The standard `supabase db reset` re-runs seed.sql but does not pick up
 * additional files. `supabase db query --file` rejects multi-statement SQL
 * (it uses a single prepared statement), so we shell to docker exec
 * directly. This requires the local Supabase stack to be running — start
 * with `pnpm db:start` if it isn't.
 *
 * Local-only by design: refuses to run if NEXT_PUBLIC_SUPABASE_URL points
 * at anything other than 127.0.0.1 / localhost. Production seeding belongs
 * in the production bootstrap scripts, not here.
 */
import path from "node:path"
import { fileURLToPath } from "node:url"
import { applyLocalSqlFile, assertLocalStack, loadEnvFile } from "./lib/local-psql.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")

const SEED_FILE = path.join(repoRoot, "supabase", "seed-demo.sql")

function main() {
  loadEnvFile(path.join(repoRoot, ".env.local"))
  assertLocalStack("db:seed:demo")
  applyLocalSqlFile(SEED_FILE, { label: "seed-demo" })
  console.log("[seed-demo] done. DEMO-2026-0001 booking is at 'accepted' with quote DEMO-2026-0001-Q1 sent.")
}

try {
  main()
} catch (error) {
  console.error("[seed-demo] failed:", error instanceof Error ? error.message : error)
  process.exit(1)
}
