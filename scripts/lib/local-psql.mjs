/**
 * Shared helper for applying a SQL file to the local Supabase Postgres
 * container via `docker exec ... psql`. Used by any script that needs to
 * apply SQL beyond what `supabase db reset` covers in one shot — plain
 * `supabase db query --file` rejects multi-statement SQL because it uses a
 * single prepared statement.
 *
 * Local-only by design: refuses to run unless NEXT_PUBLIC_SUPABASE_URL
 * resolves to 127.0.0.1 / localhost.
 */
import { existsSync, readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"])
const DEFAULT_LOCAL_URL = "http://127.0.0.1:54321"

export function loadEnvFile(filePath) {
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

export function assertLocalStack(scriptLabel) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? DEFAULT_LOCAL_URL
  let host
  try {
    host = new URL(supabaseUrl).hostname
  } catch {
    throw new Error(`Invalid NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl}`)
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `${scriptLabel} is local-only. Refusing to run against ${host}. ` +
        `Unset NEXT_PUBLIC_SUPABASE_URL or point it at ${DEFAULT_LOCAL_URL}.`
    )
  }
}

function resolveContainerName() {
  if (process.env.SUPABASE_DB_CONTAINER) return process.env.SUPABASE_DB_CONTAINER
  const project = process.env.SUPABASE_PROJECT_ID ?? "luxus-sales-system"
  return `supabase_db_${project}`
}

/** Pipes a SQL file into psql inside the running local Supabase container. */
export function applyLocalSqlFile(sqlFilePath, { label } = {}) {
  if (!existsSync(sqlFilePath)) {
    throw new Error(`SQL file not found at ${sqlFilePath}`)
  }

  const sql = readFileSync(sqlFilePath, "utf8")
  const container = resolveContainerName()

  console.log(`[${label ?? "local-psql"}] applying ${sqlFilePath} via docker exec ${container}`)

  const result = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"],
    { input: sql, encoding: "utf8", shell: true }
  )
  if (result.error) {
    throw new Error(
      `Failed to spawn docker: ${result.error.message}. ` +
        `Is Docker Desktop running? Is the local Supabase stack up (\`pnpm db:start\`)?`
    )
  }
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.status !== 0) {
    throw new Error(
      `docker exec psql exited ${result.status}. ` +
        `Is the local Supabase stack running? Try \`pnpm db:start\` then re-run.`
    )
  }
}
