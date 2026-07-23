import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createClient } from "@supabase/supabase-js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")
const outDir = path.join(repoRoot, "tmp-db-sync", "prod-config")

const TABLES = [
  "templates",
  "app_settings",
  "voucher_template",
  "suppliers",
  "supplier_emails",
  "supplier_email_labels",
  "supplier_pricing_options",
  "supplier_seasonal_periods",
  "supplier_seasonal_prices",
  "supplier_rate_adjustments",
  "supplier_kind_default_rate_types",
  "bathroom_types",
  "bedroom_layouts",
  "bedroom_types",
  "suite_types",
  "suite_type_bathroom_types",
  "suite_type_bedroom_layouts",
  "suite_type_bedroom_types",
  "rate_types",
  "rate_cards",
  "routes",
  "packages",
  "package_legs",
  "package_leg_routes",
  "vehicle_rental_route_details",
  "hotel_offers",
  "locations",
  "countries",
  "country_aliases",
  "outcome_reasons",
]

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return

  const contents = readFileSync(filePath, "utf8")
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#") || !/^[A-Za-z_][A-Za-z0-9_]*=/.test(line)) {
      continue
    }

    const [name, ...valueParts] = line.split("=")
    if (process.env[name]) continue

    let value = valueParts.join("=").trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[name] = value
  }
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing ${name}. Add it to .env.production.local or .env.local.`)
  }
  return value
}

function assertNotLocal(supabaseUrl) {
  const host = new URL(supabaseUrl).host
  if (/^(localhost|127\.0\.0\.1)/.test(host)) {
    throw new Error(
      `Refusing to pull "production config" from ${host} — this looks like the local stack, not production.`
    )
  }
}

async function pullTable(supabase, table) {
  const { data, error } = await supabase.from(table).select("*")
  if (error) {
    throw new Error(`Failed to read ${table}: ${error.message}`)
  }
  return data ?? []
}

async function main() {
  loadEnvFile(path.join(repoRoot, ".env.production.local"))
  loadEnvFile(path.join(repoRoot, ".env.local"))

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  assertNotLocal(supabaseUrl)

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  mkdirSync(outDir, { recursive: true })

  for (const table of TABLES) {
    const rows = await pullTable(supabase, table)
    writeFileSync(path.join(outDir, `${table}.json`), JSON.stringify(rows, null, 2))
    console.log(`${table}: ${rows.length} rows`)
  }

  console.log(`\nWritten to ${path.relative(repoRoot, outDir)}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
