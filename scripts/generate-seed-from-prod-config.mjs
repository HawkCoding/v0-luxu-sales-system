import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")
const inDir = path.join(repoRoot, "tmp-db-sync", "prod-config")
const outDir = path.join(repoRoot, "tmp-db-sync", "prod-config-sql")

function load(table) {
  return JSON.parse(readFileSync(path.join(inDir, `${table}.json`), "utf8"))
}

function sqlValue(v) {
  if (v === null || v === undefined) return "null"
  if (typeof v === "boolean") return v ? "true" : "false"
  if (typeof v === "number") return String(v)
  if (Array.isArray(v)) {
    if (v.length === 0) return "ARRAY[]::text[]"
    return `ARRAY[${v.map((item) => `'${String(item).replace(/'/g, "''")}'`).join(",")}]::text[]`
  }
  return `'${String(v).replace(/'/g, "''")}'`
}

function insertBlock(table, columns, rows, conflictClause) {
  if (rows.length === 0) return ""
  const values = rows
    .map((row) => `  (${columns.map((c) => sqlValue(row[c])).join(",")})`)
    .join(",\n")
  return `insert into public.${table} (${columns.join(",")}) values\n${values}\n${conflictClause};\n\n`
}

function genSimple(table, conflictClause, columns) {
  const rows = load(table)
  const cols = columns ?? (rows.length > 0 ? Object.keys(rows[0]) : [])
  return insertBlock(table, cols, rows, conflictClause)
}

let out = ""

out += "-- LOCATIONS (from production)\n"
out += genSimple("locations", "on conflict (id) do update set name=excluded.name,country=excluded.country,region_code=excluded.region_code,parent_location_id=excluded.parent_location_id,updated_at=excluded.updated_at")

out += "-- COUNTRIES & ALIASES (from production)\n"
out += genSimple("countries", "on conflict (id) do update set name=excluded.name,iso_alpha2=excluded.iso_alpha2,iso_alpha3=excluded.iso_alpha3")
out += genSimple("country_aliases", "on conflict (id) do update set country_id=excluded.country_id,alias=excluded.alias")

out += "-- SUPPLIERS (from production, full replace)\n"
{
  const rows = load("suppliers")
  const cols = Object.keys(rows[0])
  out += insertBlock(
    "suppliers",
    cols,
    rows,
    "on conflict (id) do update set " +
      cols
        .filter((c) => c !== "id")
        .map((c) => `${c}=excluded.${c}`)
        .join(",")
  )
  const activeIds = rows.filter((r) => r.active).map((r) => `'${r.id}'`)
  if (activeIds.length > 0) {
    out += `update public.suppliers set active = true where id in (${activeIds.join(",")});\n\n`
  }
}

out += "-- SUPPLIER EMAILS & LABELS (from production)\n"
out += genSimple("supplier_emails", "on conflict (id) do update set supplier_id=excluded.supplier_id,email=excluded.email,label=excluded.label")
out += genSimple("supplier_email_labels", "on conflict (id) do update set name=excluded.name,sort_order=excluded.sort_order")

out += "-- RATE TYPES (from production)\n"
out += genSimple("rate_types", "on conflict (id) do update set code=excluded.code,name=excluded.name,sort_order=excluded.sort_order,is_default=excluded.is_default,archived_at=excluded.archived_at,is_standard=excluded.is_standard,updated_at=excluded.updated_at")

// The base and quoted rate types live on suppliers itself, so they ride along
// in the suppliers block above.
out += "-- SUPPLIER RATE ADJUSTMENTS (from production)\n"
out += genSimple("supplier_rate_adjustments", "on conflict (id) do update set supplier_id=excluded.supplier_id,rate_type_id=excluded.rate_type_id,discount_pct=excluded.discount_pct,updated_at=excluded.updated_at")

out += "-- SUITE TYPES & VARIANT VOCABULARY (from production)\n"
out += genSimple("suite_types", "on conflict (id) do update set supplier_id=excluded.supplier_id,name=excluded.name,description=excluded.description,passenger_capacity=excluded.passenger_capacity,luggage_capacity=excluded.luggage_capacity,sort_order=excluded.sort_order,active=excluded.active,updated_at=excluded.updated_at")
out += genSimple("bathroom_types", "on conflict (id) do update set supplier_id=excluded.supplier_id,name=excluded.name,sort_order=excluded.sort_order,archived_at=excluded.archived_at,updated_at=excluded.updated_at")
out += genSimple("bedroom_layouts", "on conflict (id) do update set supplier_id=excluded.supplier_id,name=excluded.name,sort_order=excluded.sort_order,archived_at=excluded.archived_at,updated_at=excluded.updated_at")
out += genSimple("bedroom_types", "on conflict (id) do update set supplier_id=excluded.supplier_id,name=excluded.name,sort_order=excluded.sort_order,archived_at=excluded.archived_at,updated_at=excluded.updated_at")
out += genSimple("suite_type_bathroom_types", "on conflict do nothing")
out += genSimple("suite_type_bedroom_layouts", "on conflict do nothing")
out += genSimple("suite_type_bedroom_types", "on conflict do nothing")

out += "-- ROUTES (from production)\n"
out += genSimple("routes", "on conflict (id) do nothing")

out += "-- RATE CARDS (from production)\n"
out += genSimple("rate_cards", "on conflict (id) do nothing")

out += "-- PACKAGES, LEGS & LEG ROUTES (from production, excluding per-booking synthetic packages)\n"
{
  const packages = load("packages").filter((p) => p.booking_id === null)
  const packageIds = new Set(packages.map((p) => p.id))
  out += insertBlock("packages", Object.keys(packages[0]), packages, "on conflict (id) do nothing")

  const legs = load("package_legs").filter((l) => packageIds.has(l.package_id))
  const legIds = new Set(legs.map((l) => l.id))
  out += insertBlock("package_legs", Object.keys(legs[0]), legs, "on conflict (id) do nothing")

  const legRoutes = load("package_leg_routes").filter((lr) => legIds.has(lr.package_leg_id))
  out += insertBlock("package_leg_routes", Object.keys(legRoutes[0]), legRoutes, "on conflict do nothing")
}

out += "-- OUTCOME REASONS (from production)\n"
out += genSimple("outcome_reasons", "on conflict (id) do update set label=excluded.label,applies_to=excluded.applies_to,active=excluded.active")

out += "-- APP SETTINGS (from production, full replace)\n"
{
  const rows = load("app_settings")
  out += insertBlock("app_settings", ["key", "value", "updated_at"], rows, "on conflict (key) do update set value=excluded.value,updated_at=excluded.updated_at")
}

mkdirSync(outDir, { recursive: true })
writeFileSync(path.join(outDir, "catalog.sql"), out)
console.log(`Written ${out.length} bytes to tmp-db-sync/prod-config-sql/catalog.sql`)
