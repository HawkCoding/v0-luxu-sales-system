#!/usr/bin/env node
/**
 * Applies supabase/seed-prod-config.sql to the currently running local
 * Supabase stack, without a full `db reset`. Used by `pnpm db:sync:prod-config`
 * after pulling and regenerating the overlay, so a refresh takes effect
 * immediately instead of waiting for the next reset.
 *
 * Local-only by design: refuses to run if NEXT_PUBLIC_SUPABASE_URL points
 * at anything other than 127.0.0.1 / localhost.
 */
import path from "node:path"
import { fileURLToPath } from "node:url"
import { applyLocalSqlFile, assertLocalStack, loadEnvFile } from "./lib/local-psql.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")

const SEED_FILE = path.join(repoRoot, "supabase", "seed-prod-config.sql")

function main() {
  loadEnvFile(path.join(repoRoot, ".env.local"))
  assertLocalStack("db:sync:prod-config")
  applyLocalSqlFile(SEED_FILE, { label: "seed-prod-config" })
  console.log("[seed-prod-config] done. Local suppliers/settings/catalogue now match production.")
}

try {
  main()
} catch (error) {
  console.error("[seed-prod-config] failed:", error instanceof Error ? error.message : error)
  process.exit(1)
}
