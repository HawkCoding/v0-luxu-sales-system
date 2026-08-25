/**
 * Turns the JSON dumps in tmp-db-sync/prod-config/ (written by
 * scripts/pull-production-config.mjs) into supabase/seed-prod-config.sql —
 * a committed overlay applied AFTER supabase/seed.sql on every
 * `pnpm db:reset` (see supabase/config.toml [db.seed].sql_paths).
 *
 * Each table's rows are loaded through json_populate_recordset() against the
 * table's own rowtype, so every column type (arrays, jsonb, enums, dates,
 * numerics) is cast correctly with no hand-written type map.
 *
 * LOCAL-ONLY: every insert block disables user triggers first. This is what
 * lets prod values land verbatim instead of being rewritten by
 * tr_set_supplier_status (forces status back to 'draft'),
 * tr_supplier_inherit_contacts / tr_supplier_propagate_contacts /
 * tr_supplier_emails_propagate_* (parent/child contact sync), the
 * payment_methods / signature_brands row-cap triggers, and the audit
 * triggers on suppliers/locations/supplier_email_labels (which would
 * otherwise flood audit_logs on every reset). Disabling user triggers is
 * only safe against a local database you fully own — never run the
 * generated file against a hosted (dev/prod) database.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")
const inDir = path.join(repoRoot, "tmp-db-sync", "prod-config")
const outPath = path.join(repoRoot, "supabase", "seed-prod-config.sql")

const DOLLAR_TAG = "$seedjson$"

function load(table) {
  const filePath = path.join(inDir, `${table}.json`)
  if (!existsSync(filePath)) {
    throw new Error(`Missing ${filePath}. Run \`pnpm db:pull:prod-config\` first.`)
  }
  return JSON.parse(readFileSync(filePath, "utf8"))
}

/** Stable topological sort on a self-referencing FK column (nulls first). */
function topoSortSelfRef(rows, idCol, parentCol) {
  const byId = new Map(rows.map((r) => [r[idCol], r]))
  const placed = new Set()
  const ordered = []
  const rest = [...rows]
  let progress = true
  while (rest.length > 0 && progress) {
    progress = false
    for (let i = rest.length - 1; i >= 0; i--) {
      const row = rest[i]
      const parent = row[parentCol]
      if (parent === null || parent === undefined || placed.has(parent) || !byId.has(parent)) {
        ordered.push(row)
        placed.add(row[idCol])
        rest.splice(i, 1)
        progress = true
      }
    }
  }
  // Any leftover rows form a cycle (shouldn't happen) — append as-is so
  // nothing is silently dropped; the insert will surface the FK error.
  return [...ordered, ...rest]
}

function toJsonLiteral(rows) {
  const json = JSON.stringify(rows)
  if (json.includes(DOLLAR_TAG)) {
    throw new Error(`Row data contains the dollar-quote tag ${DOLLAR_TAG} — pick a different tag.`)
  }
  return `${DOLLAR_TAG}${json}${DOLLAR_TAG}`
}

/** insert ... select * from json_populate_recordset(...) on conflict (conflictCols) do update ... */
function upsertBlock(table, rows, conflictCols, { skipUpdateCols = [], conflictTarget } = {}) {
  if (rows.length === 0) return ""
  const cols = Object.keys(rows[0])
  const updateCols = cols.filter((c) => !conflictCols.includes(c) && !skipUpdateCols.includes(c))
  const updateClause =
    updateCols.length > 0
      ? `do update set ${updateCols.map((c) => `${c} = excluded.${c}`).join(", ")}`
      : "do nothing"

  return [
    `alter table public.${table} disable trigger user;`,
    `insert into public.${table}`,
    `select * from json_populate_recordset(null::public.${table}, ${toJsonLiteral(rows)}::json)`,
    `on conflict ${conflictTarget ?? `(${conflictCols.join(", ")})`} ${updateClause};`,
    `alter table public.${table} enable trigger user;`,
    "",
  ].join("\n")
}

/** insert ... on conflict do nothing — for composite-PK join tables. */
function insertOnlyBlock(table, rows) {
  if (rows.length === 0) return ""
  return [
    `alter table public.${table} disable trigger user;`,
    `insert into public.${table}`,
    `select * from json_populate_recordset(null::public.${table}, ${toJsonLiteral(rows)}::json)`,
    `on conflict do nothing;`,
    `alter table public.${table} enable trigger user;`,
    "",
  ].join("\n")
}

/** Escapes a single SQL string literal. */
function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

/**
 * seed.sql already seeds baseline "countries" / top-level "locations" rows
 * from an OLD production snapshot, under their own ids (some sentinel, e.g.
 * Pretoria/Cape Town/Durban = 00000000-0000-0000-0000-000000001001/2/3).
 * Production may have since re-created the same-named row under a new id
 * (row deleted/re-inserted, dedup, etc.) — inserting that new id as a
 * SEPARATE row would violate the name uniqueness constraint (countries_
 * name_unique / ux_locations_name_toplevel).
 *
 * Fix: remap the local row's id to production's id BEFORE the normal
 * upsert-by-id runs, so it becomes a plain update instead of a colliding
 * insert. Every column across the schema that stores a reference to that
 * id is rewritten in the same statement, and FK-enforcement triggers are
 * suspended for the duration (session_replication_role = replica) since we
 * are deliberately mutating primary keys other rows still point at — by
 * the time triggers resume, every reference has been moved in lockstep so
 * the database is fully consistent again.
 */
function idRemapBlock({ table, rows, natKeyCol = "name", matchWhere, referencingColumns }) {
  if (rows.length === 0) return ""
  const values = rows
    .map((r) => `(${sqlString(r.id)}::uuid, ${sqlString(r[natKeyCol])})`)
    .join(",\n    ")
  const tempTable = `remap_${table}`

  const lines = [
    `create temp table ${tempTable} (old_id uuid, new_id uuid) on commit drop;`,
    `insert into ${tempTable} (old_id, new_id)`,
    `select local.id, prod.new_id`,
    `from public.${table} local`,
    `join (values`,
    `    ${values}`,
    `  ) as prod(new_id, nat_key) on prod.nat_key = local.${natKeyCol}`,
    `where ${[matchWhere, "local.id <> prod.new_id"].filter(Boolean).join(" and ")};`,
    "",
    `set session_replication_role = replica;`,
    "",
  ]

  for (const { table: refTable, column } of referencingColumns) {
    lines.push(
      `update public.${refTable} r set ${column} = m.new_id`,
      `from ${tempTable} m where r.${column} = m.old_id;`,
      ""
    )
  }

  lines.push(
    `update public.${table} local set id = m.new_id`,
    `from ${tempTable} m where local.id = m.old_id;`,
    "",
    `set session_replication_role = default;`,
    ""
  )

  return lines.filter((l) => l !== null).join("\n") + "\n"
}

/** Singleton row (voucher_template): update the one existing row in place. */
function singletonUpdateBlock(table, row) {
  if (!row) return ""
  const cols = Object.keys(row).filter((c) => c !== "id")
  return [
    `alter table public.${table} disable trigger user;`,
    `update public.${table} t set`,
    cols.map((c) => `  ${c} = s.${c}`).join(",\n"),
    `from json_populate_recordset(null::public.${table}, ${toJsonLiteral([row])}::json) s`,
    `where true;`,
    `alter table public.${table} enable trigger user;`,
    "",
  ].join("\n")
}

let out = `-- ============================================================
-- Luxus Sales System — Production Config Overlay (GENERATED)
--
-- Regenerate with:
--   pnpm db:pull:prod-config   (dumps prod tables to tmp-db-sync/prod-config/)
--   pnpm db:gen:prod-config    (writes this file from those dumps)
-- Generated: ${new Date().toISOString()}
--
-- Applied AFTER supabase/seed.sql on every \`pnpm db:reset\`
-- (supabase/config.toml [db.seed].sql_paths). Upserts current production
-- configuration (suppliers, catalogue, settings, templates, payment
-- methods, signature brands) on top of the demo dataset so local looks
-- like production. Never deletes rows, so the demo bookings/quotes/
-- invoices seeded by seed.sql keep working.
--
-- LOCAL-ONLY: disables user triggers per statement. Do not run this file
-- against a hosted database.
-- ============================================================

begin;

`

out += "-- ID RECONCILIATION: remap countries/locations already seeded locally\n"
out += "-- (under an old snapshot's id) onto production's current id for that name.\n"
out += idRemapBlock({
  table: "countries",
  rows: load("countries"),
  referencingColumns: [{ table: "country_aliases", column: "country_id" }],
})
out += idRemapBlock({
  table: "locations",
  rows: load("locations").filter((r) => r.parent_location_id === null),
  matchWhere: "local.parent_location_id is null",
  referencingColumns: [
    { table: "locations", column: "parent_location_id" },
    { table: "suppliers", column: "location_id" },
    { table: "suppliers", column: "location_area_id" },
    { table: "routes", column: "origin_location_id" },
    { table: "routes", column: "destination_location_id" },
    { table: "supplier_station_addresses", column: "location_id" },
    { table: "hotel_offers", column: "location_id" },
  ],
})

out += "-- COUNTRIES & ALIASES\n"
out += upsertBlock("countries", load("countries"), ["id"])
// Conflict target is the case-insensitive unique index on alias, not id:
// seed.sql's own snapshot may already have a row for the same alias text
// under a different id (leaf table, nothing else FKs to it, so remapping
// the id — rather than just updating in place — isn't needed here).
out += upsertBlock("country_aliases", load("country_aliases"), ["alias"], {
  conflictTarget: "(lower(alias))",
})

out += "-- LOCATIONS (self-referencing via parent_location_id — parent rows first)\n"
out += upsertBlock(
  "locations",
  topoSortSelfRef(load("locations"), "id", "parent_location_id"),
  ["id"]
)

out += "-- RATE TYPES (seed.sql itself conflicts on `code`, referencing rate_types.id\n"
out += "-- elsewhere only via `select id from rate_types where code = ...` — so its\n"
out += "-- baseline rows may already exist locally under a different id than prod)\n"
out += idRemapBlock({
  table: "rate_types",
  rows: load("rate_types"),
  natKeyCol: "code",
  referencingColumns: [
    { table: "suppliers", column: "base_rate_type_id" },
    { table: "suppliers", column: "quote_rate_type_id" },
    { table: "rate_cards", column: "rate_type_id" },
    { table: "supplier_rate_adjustments", column: "rate_type_id" },
    { table: "booking_services", column: "rate_type_id" },
  ],
})
out += upsertBlock("rate_types", load("rate_types"), ["id"])

out += "-- SUPPLIERS (self-referencing via parent_supplier_id — parent rows first)\n"
out += upsertBlock(
  "suppliers",
  topoSortSelfRef(load("suppliers"), "id", "parent_supplier_id"),
  ["id"]
)

out += "-- SUPPLIER EMAILS & LABELS\n"
// Leaf table (supplier_emails.label is free text, not FK'd to this table),
// so a name-collision from seed.sql's own baseline rows just needs a
// natural-key conflict target — no id remap required.
out += upsertBlock("supplier_email_labels", load("supplier_email_labels"), ["name"], {
  conflictTarget: "(lower(name))",
})
out += upsertBlock("supplier_emails", load("supplier_emails"), ["id"])

out += "-- SUPPLIER PRICING\n"
out += upsertBlock("supplier_pricing_options", load("supplier_pricing_options"), ["id"])
out += upsertBlock("supplier_seasonal_periods", load("supplier_seasonal_periods"), ["id"])
out += upsertBlock("supplier_seasonal_prices", load("supplier_seasonal_prices"), ["id"])
out += upsertBlock("supplier_rate_adjustments", load("supplier_rate_adjustments"), ["id"])
out += upsertBlock("supplier_station_addresses", load("supplier_station_addresses"), ["id"])

out += "-- SUITE TYPES & VARIANT VOCABULARY\n"
out += upsertBlock("suite_types", load("suite_types"), ["id"])
out += upsertBlock("bedroom_types", load("bedroom_types"), ["id"])
out += upsertBlock("bedroom_layouts", load("bedroom_layouts"), ["id"])
out += upsertBlock("bathroom_types", load("bathroom_types"), ["id"])
out += insertOnlyBlock("suite_type_bedroom_types", load("suite_type_bedroom_types"))
out += insertOnlyBlock("suite_type_bedroom_layouts", load("suite_type_bedroom_layouts"))
out += insertOnlyBlock("suite_type_bathroom_types", load("suite_type_bathroom_types"))

{
  // created_by holds a production auth.users id that doesn't exist locally.
  // Not FK-constrained, so it's harmless to carry over, but null it for
  // cleanliness — nothing local should look like it was confirmed by a
  // specific (nonexistent) local user.
  const rows = load("suite_vocab_aliases").map((r) => ({ ...r, created_by: null }))
  out += "-- SUITE VOCAB ALIASES (created_by nulled — prod user id doesn't exist locally)\n"
  out += upsertBlock("suite_vocab_aliases", rows, ["id"])
}

out += "-- ROUTES & RATE CARDS\n"
out += upsertBlock("routes", load("routes"), ["id"])
out += upsertBlock("vehicle_rental_route_details", load("vehicle_rental_route_details"), ["route_id"])
out += upsertBlock("rate_cards", load("rate_cards"), ["id"])

out += "-- HOTEL OFFERS & OUTCOME REASONS\n"
out += upsertBlock("hotel_offers", load("hotel_offers"), ["id"])
out += upsertBlock("outcome_reasons", load("outcome_reasons"), ["id"])

out += "-- APP SETTINGS\n"
out += upsertBlock("app_settings", load("app_settings"), ["key"])

out += "-- EMAIL TEMPLATES (conflict on `key`: the unify-email-templates migration\n"
out += "-- pre-inserts system keys with locally-generated ids)\n"
out += upsertBlock("templates", load("templates"), ["key"], { skipUpdateCols: ["id"] })

out += "-- VOUCHER TEMPLATE (singleton — update in place, keep local id)\n"
out += singletonUpdateBlock("voucher_template", load("voucher_template")[0])

out += "-- PAYMENT METHODS & SIGNATURE BRANDS\n"
// 20260820200000_payment_methods.sql auto-creates one 'Primary', is_default
// = true row on every migration run (fresh random id, backfilled from the
// old flat app_settings banking keys). Remap it onto prod's 'Primary' row
// first, or inserting prod's copy trips the single-default partial index.
out += idRemapBlock({
  table: "payment_methods",
  rows: load("payment_methods"),
  referencingColumns: [{ table: "invoices", column: "payment_method_id" }],
})
out += upsertBlock("payment_methods", load("payment_methods"), ["id"])
// 20260727100000_signature_brands.sql auto-creates 'sa-rail' / 'luxus-travel'
// / 'arnelia-house' rows (fresh ids) on every migration run. Leaf table
// (nothing FKs to signature_brands.id), so a plain natural-key conflict on
// slug is enough — no id remap needed.
out += upsertBlock("signature_brands", load("signature_brands"), ["slug"], {
  conflictTarget: "(slug)",
})

out += "commit;\n"

mkdirSync(path.dirname(outPath), { recursive: true })
writeFileSync(outPath, out)
console.log(`Written ${out.length} bytes to ${path.relative(repoRoot, outPath)}`)
