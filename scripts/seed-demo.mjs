#!/usr/bin/env node
/**
 * Applies supabase/seed-demo.sql against the local Supabase database via the
 * Supabase CLI's `db query --local --file` subcommand.
 *
 * The standard `supabase db reset` re-runs seed.sql but does not pick up
 * additional files. We layer seed-demo.sql on top via this script. The CLI
 * shells to a psql session inside the local Supabase Docker container, so
 * no host-level psql install is required.
 *
 * Local-only by design: refuses to run if NEXT_PUBLIC_SUPABASE_URL points
 * at anything other than 127.0.0.1 / localhost. Production seeding belongs
 * in the production bootstrap scripts, not here.
 */
import { existsSync, readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")

const SEED_FILE = path.join(repoRoot, "supabase", "seed-demo.sql")
const DEFAULT_LOCAL_URL = "http://127.0.0.1:54321"
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"])

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return
  const contents = readFileSync(filePath, "utf8")
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#") || !/^[A-Za-z_][A-Za-z0-9_]*=/.test(line)) continue
    const [name, ...valueParts] = line.split("=")
    if (process.env[name]) continue
    let value = valueParts.join("=").trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[name] = value
  }
}

function main() {
  loadEnvFile(path.join(repoRoot, ".env.local"))

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? DEFAULT_LOCAL_URL
  let host
  try {
    host = new URL(supabaseUrl).hostname
  } catch {
    throw new Error(`Invalid NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl}`)
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `db:seed:demo is local-only. Refusing to run against ${host}. ` +
        `Unset NEXT_PUBLIC_SUPABASE_URL or point it at ${DEFAULT_LOCAL_URL}.`,
    )
  }

  if (!existsSync(SEED_FILE)) {
    throw new Error(`Demo seed file not found at ${SEED_FILE}`)
  }

  console.log(`[seed-demo] applying ${path.relative(repoRoot, SEED_FILE)} via supabase db query --local`)

  // Windows-friendly invocation: spawn npx with shell:true so PATH lookups
  // resolve npx.cmd on Windows without us hard-coding extensions.
  const result = spawnSync(
    "npx",
    ["supabase", "db", "query", "--local", "--file", SEED_FILE],
    { stdio: "inherit", shell: true, cwd: repoRoot },
  )
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `supabase db query exited ${result.status}. ` +
        `Is the local Supabase stack running? Try \`pnpm db:start\` then re-run.`,
    )
  }

  console.log("[seed-demo] done. DEMO-2026-0001 booking is at 'accepted' with quote DEMO-2026-0001-Q1 sent.")
}

try {
  main()
} catch (error) {
  console.error("[seed-demo] failed:", error instanceof Error ? error.message : error)
  process.exit(1)
}
