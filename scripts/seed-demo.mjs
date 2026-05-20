#!/usr/bin/env node
/**
 * Applies supabase/seed-demo.sql against the local Supabase database.
 *
 * The standard `supabase db reset` re-runs seed.sql but does not pick up
 * additional files. We need a way to layer seed-demo.sql on top of a fresh
 * reset, so this script connects via the local-only postgres meta endpoint
 * exposed by `supabase start`.
 *
 * Local-only by design: refuses to run against any host that is not
 * 127.0.0.1 / localhost. Production seeding belongs in the production
 * bootstrap scripts, not here.
 */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")

const SEED_FILE = path.join(repoRoot, "supabase", "seed-demo.sql")
const DEFAULT_LOCAL_URL = "http://127.0.0.1:54321"
const DEFAULT_LOCAL_DB_HOST = "127.0.0.1"
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

async function execSql(metaUrl, sql) {
  const response = await fetch(`${metaUrl}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Meta SQL request failed (${response.status}): ${text}`)
  }
  return response.json().catch(() => null)
}

async function main() {
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
  const sql = readFileSync(SEED_FILE, "utf8")

  const metaUrl = process.env.SUPABASE_PG_META_URL ?? `http://${DEFAULT_LOCAL_DB_HOST}:54322`

  console.log(`[seed-demo] applying ${path.relative(repoRoot, SEED_FILE)}`)
  console.log(`[seed-demo] target: ${supabaseUrl}`)

  try {
    await execSql(metaUrl, sql)
  } catch (error) {
    console.error("\n[seed-demo] direct meta query failed; falling back to docker exec.")
    console.error(error instanceof Error ? error.message : error)
    await runViaDocker(sql)
  }

  console.log("[seed-demo] done. DEMO-2026-0001 booking is at 'accepted' with quote DEMO-2026-0001-Q1 sent.")
}

async function runViaDocker(sql) {
  const { spawnSync } = await import("node:child_process")
  const project = process.env.SUPABASE_PROJECT_ID ?? "luxus-sales-system"
  const container = `supabase_db_${project}`
  const result = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
    { input: sql, encoding: "utf8" },
  )
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `docker exec psql failed (exit ${result.status}). Is the local Supabase database running? ` +
        `Try \`pnpm db:start\`.\n${result.stderr ?? ""}`,
    )
  }
  if (result.stdout) console.log(result.stdout.trim())
}

main().catch((error) => {
  console.error("[seed-demo] failed:", error instanceof Error ? error.message : error)
  process.exit(1)
})
