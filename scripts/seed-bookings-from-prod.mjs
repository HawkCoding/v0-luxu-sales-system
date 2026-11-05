#!/usr/bin/env node
/**
 * Replaces the LOCAL showcase bookings with anonymised copies of the real
 * production bookings, so local dev and QA work against services, suppliers,
 * suites and prices that actually exist.
 *
 * - Production is only ever READ (service-role key from .env.production.local).
 * - Writes go to the local Supabase container only (assertLocalStack).
 * - Customers / travellers get fake names, emails, phones; ID numbers, birth
 *   dates, addresses, notes, e-mail bodies and attachments are not copied.
 * - Real names are also scrubbed from free text on the copied rows.
 *
 * Run after `pnpm db:reset` (and `pnpm db:sync:prod-config` if the catalogue
 * has changed): `pnpm db:seed:prod-bookings`
 */
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { applyLocalSqlFile, assertLocalStack, loadEnvFile } from "./lib/local-psql.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")
const PAGE = 1000

// FK-ordered. `via` = child table keyed through another table instead of booking_id.
const TABLES = [
  { name: "customers" },
  { name: "bookings" },
  { name: "booking_pax_groups" },
  { name: "booking_suites" },
  { name: "travellers" },
  { name: "itineraries" },
  { name: "booking_services" },
  { name: "booking_service_units", via: { table: "booking_services", fk: "service_id" } },
  { name: "booking_transport_requests" },
  { name: "booking_supplier_schedules" },
  { name: "booking_reservation_details" },
  { name: "booking_flight_details" },
  { name: "booking_vehicle_rental_details" },
  { name: "quotes" },
  { name: "quote_line_items", via: { table: "quotes", fk: "quote_id" } },
  { name: "quote_follow_ups", via: { table: "quotes", fk: "quote_id" } },
  { name: "invoices" },
  { name: "payments" },
  { name: "payment_reminders", via: { table: "invoices", fk: "invoice_id" } },
  { name: "vouchers" },
  { name: "voucher_service_blocks", via: { table: "vouchers", fk: "voucher_id" } },
  { name: "pipeline_history" },
]

// Columns that point at documents / storage we deliberately do not copy.
const NULLED = new Set(["pdf_document_id", "document_id", "email_import_source_message_id"])
// Columns holding raw client e-mail text.
const BLANKED_BOOKING = [
  "raw_text",
  "extracted_json",
  "email_import_raw_preview",
  "email_import_subject",
  "email_import_mailbox",
  "email_import_warnings",
  "email_import_missing_fields",
  "email_import_duplicate_of_booking_id",
]

const FIRST = [
  "Alice", "Brandon", "Chloe", "Daniel", "Emma", "Frederick", "Grace", "Henry", "Isabel", "Jonathan",
  "Katherine", "Liam", "Megan", "Nathan", "Olivia", "Patrick", "Quinn", "Rachel", "Samuel", "Tessa",
  "Victor", "Willow", "Xavier", "Yvonne", "Zachary", "Amelia", "Benjamin", "Charlotte", "Dominic", "Eleanor",
  "Felix", "Georgia", "Harrison", "Imogen", "Jasper", "Kirsten", "Lawrence", "Matilda", "Nigel", "Penelope",
]
const LAST = [
  "Ashford", "Bellamy", "Carrington", "Dalton", "Ellison", "Fairweather", "Granger", "Hartley", "Ingram", "Jameson",
  "Kingsley", "Langford", "Montgomery", "Newbury", "Oakley", "Pemberton", "Quincy", "Redmond", "Sherwood", "Thornton",
  "Upton", "Vaughan", "Whitaker", "Yardley", "Abernathy", "Blackwood", "Calloway", "Davenport", "Everhart", "Fitzgerald",
  "Garrick", "Holloway", "Irwin", "Jennings", "Kensington", "Lockwood", "Marlowe", "Northcott", "Osborne", "Prescott",
]

function loadProdEnv() {
  const file = path.join(repoRoot, ".env.production.local")
  if (!existsSync(file)) throw new Error(".env.production.local not found (needed for the read-only production pull)")
  const env = {}
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!m) continue
    env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "")
  }
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Production URL / service key missing from .env.production.local")
  }
  return env
}

async function fetchAll(env, table, select = "*") {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?select=${select}`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Range: `${from}-${from + PAGE - 1}`,
      },
    })
    if (res.status === 404 || res.status === 400) return null // table absent in prod
    if (!res.ok) throw new Error(`prod ${table}: HTTP ${res.status} ${await res.text()}`)
    const page = await res.json()
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return rows
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

function sqlLiteral(s) {
  let tag = "j"
  while (s.includes(`$${tag}$`)) tag += "x"
  return `$${tag}$${s}$${tag}$`
}

async function main() {
  loadEnvFile(path.join(repoRoot, ".env.local"))
  assertLocalStack("db:seed:prod-bookings")
  const env = loadProdEnv()
  console.log(`[seed-prod-bookings] reading (read-only) from ${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname}`)

  // ---- pull ----
  const data = {}
  for (const t of TABLES) {
    const rows = await fetchAll(env, t.name)
    if (rows === null) {
      console.log(`  ${t.name}: not in production, skipped`)
      continue
    }
    data[t.name] = rows
  }
  const prodProfiles = (await fetchAll(env, "profiles", "user_id,email")) ?? []

  // ---- user mapping: prod user -> local dev user (by email, else carmen) ----
  const localUsers = {
    "carmen@luxustravel.co.za": "00000000-0000-0000-0000-0000000000a1",
    "leonie@luxustravel.co.za": "00000000-0000-0000-0000-0000000000a2",
    "dirk@luxustravel.co.za": "00000000-0000-0000-0000-0000000000a3",
    "monade@luxustravel.co.za": "00000000-0000-0000-0000-0000000000a4",
    "douwlien@luxustravel.co.za": "00000000-0000-0000-0000-0000000000a5",
  }
  const fallbackUser = localUsers["carmen@luxustravel.co.za"]
  const userMap = new Map(
    prodProfiles.map((p) => [p.user_id, localUsers[String(p.email).toLowerCase()] ?? fallbackUser])
  )
  const userColumns = new Set([
    "owner_user_id", "assigned_salesperson_id", "outcome_set_by", "services_confirmed_by",
    "email_import_review_resolved_by", "created_by", "captured_by", "moved_by_user_id",
    "fare_override_set_by", "manual_room_price_set_by", "manual_tour_price_set_by", "price_override_set_by",
  ])

  // ---- anonymise ----
  const customers = data.customers
  const travellers = data.travellers ?? []
  const fakeFor = new Map() // real customer id -> {first,last,email,phone}
  customers.forEach((c, i) => {
    const first = FIRST[i % FIRST.length]
    const last = LAST[(i * 7 + Math.floor(i / FIRST.length)) % LAST.length]
    fakeFor.set(c.id, {
      first,
      last,
      email: `${first}.${last}.${i + 1}@example.com`.toLowerCase(),
      phone: `+2782${String(5550000 + i).padStart(7, "0")}`,
    })
  })

  // names to scrub per booking: [{re, to}]
  const scrubByBooking = new Map()
  const customerBooking = new Map()
  for (const b of data.bookings) customerBooking.set(b.id, b.customer_id)
  const addScrub = (bookingId, real, fake) => {
    if (!real || real.trim().length < 3) return
    const list = scrubByBooking.get(bookingId) ?? []
    list.push({ re: new RegExp(`\\b${escapeRegex(real.trim())}\\b`, "gi"), to: fake })
    scrubByBooking.set(bookingId, list)
  }

  const travellerFake = new Map()
  let tIdx = 0
  for (const b of data.bookings) {
    const cust = customers.find((c) => c.id === b.customer_id)
    const f = fakeFor.get(b.customer_id)
    if (cust && f) {
      addScrub(b.id, `${cust.first_name} ${cust.last_name}`, `${f.first} ${f.last}`)
      addScrub(b.id, cust.last_name, f.last)
      addScrub(b.id, cust.first_name, f.first)
      if (cust.email) addScrub(b.id, cust.email, f.email)
    }
  }
  for (const t of travellers) {
    const cust = customers.find((c) => c.id === customerBooking.get(t.booking_id))
    const isCustomer =
      cust &&
      String(cust.first_name).toLowerCase() === String(t.first_name).toLowerCase() &&
      String(cust.last_name).toLowerCase() === String(t.last_name).toLowerCase()
    const fake = isCustomer
      ? { first: fakeFor.get(cust.id).first, last: fakeFor.get(cust.id).last }
      : { first: FIRST[(tIdx * 3 + 11) % FIRST.length], last: fakeFor.get(cust?.id)?.last ?? LAST[tIdx % LAST.length] }
    tIdx++
    travellerFake.set(t.id, fake)
    addScrub(t.booking_id, `${t.first_name} ${t.last_name}`, `${fake.first} ${fake.last}`)
    addScrub(t.booking_id, t.first_name, fake.first)
    addScrub(t.booking_id, t.last_name, fake.last)
  }

  const scrubText = (bookingId, value) => {
    const rules = scrubByBooking.get(bookingId)
    if (!rules) return value
    let s = JSON.stringify(value)
    for (const r of rules) s = s.replace(r.re, r.to)
    return JSON.parse(s)
  }

  // line items / follow-ups etc. need booking id -> look up via parent
  const quoteBooking = new Map((data.quotes ?? []).map((q) => [q.id, q.booking_id]))
  const invoiceBooking = new Map((data.invoices ?? []).map((i) => [i.id, i.booking_id]))
  const serviceBooking = new Map((data.booking_services ?? []).map((s) => [s.id, s.booking_id]))
  const voucherBooking = new Map((data.vouchers ?? []).map((v) => [v.id, v.booking_id]))
  const bookingIdOf = (table, row) => {
    if (row.booking_id) return row.booking_id
    if (table === "quote_line_items" || table === "quote_follow_ups") return quoteBooking.get(row.quote_id)
    if (table === "payment_reminders") return invoiceBooking.get(row.invoice_id)
    if (table === "booking_service_units") return serviceBooking.get(row.service_id)
    if (table === "voucher_service_blocks") return voucherBooking.get(row.voucher_id)
    return undefined
  }

  const out = {}
  for (const [name, rows] of Object.entries(data)) {
    out[name] = rows.map((row) => {
      let r = { ...row }
      for (const col of Object.keys(r)) {
        if (NULLED.has(col)) r[col] = null
        if (userColumns.has(col) && r[col]) r[col] = userMap.get(r[col]) ?? fallbackUser
      }
      if (name === "customers") {
        const f = fakeFor.get(r.id)
        Object.assign(r, {
          first_name: f.first, last_name: f.last, email: f.email, phone: f.phone,
          company_name: null, address_line1: null, address_line2: null, city: null, postal_code: null,
          vat_number: null, fax: null, id_passport: null, date_of_birth: null, notes: null,
          preferences: null,
          club_memberships: Array.isArray(r.club_memberships) ? [] : r.club_memberships,
        })
        return r
      }
      if (name === "travellers") {
        const f = travellerFake.get(r.id)
        Object.assign(r, {
          first_name: f.first, last_name: f.last, id_passport: null, date_of_birth: null,
          club_memberships: Array.isArray(r.club_memberships) ? [] : r.club_memberships,
        })
      }
      if (name === "bookings") {
        for (const col of BLANKED_BOOKING) if (col in r) r[col] = Array.isArray(r[col]) ? [] : null
      }
      return scrubText(bookingIdOf(name, row) ?? (name === "bookings" ? row.id : undefined), r)
    })
  }

  // Generated columns (e.g. quotes.outstanding_amount) cannot be inserted.
  const generated = new Map()
  const genRes = spawnSync(
    "docker",
    ["exec", "-i", process.env.SUPABASE_DB_CONTAINER ?? `supabase_db_${process.env.SUPABASE_PROJECT_ID ?? "luxus-sales-system"}`,
      "psql", "-U", "postgres", "-d", "postgres", "-At", "-F", "|", "-c",
      "select table_name, column_name from information_schema.columns where table_schema='public' and (is_generated='ALWAYS' or identity_generation='ALWAYS')"],
    { encoding: "utf8" }
  )
  if (genRes.status !== 0) throw new Error(`could not read generated columns: ${genRes.stderr}`)
  for (const line of (genRes.stdout ?? "").split(/\r?\n/)) {
    const [table, column] = line.split("|")
    if (!table || !column) continue
    generated.set(table, [...(generated.get(table) ?? []), column])
  }
  for (const [name, rows] of Object.entries(out)) {
    const drop = generated.get(name)
    if (!drop) continue
    for (const r of rows) for (const col of drop) delete r[col]
  }

  // ---- generate SQL ----
  const lines = [
    "-- generated by scripts/seed-bookings-from-prod.mjs (anonymised copy of production bookings)",
    "begin;",
    // Deletes run with triggers on so FK cascades clear every child table.
    "delete from public.pipeline_history;",
    "delete from public.bookings;",
    "delete from public.customers;",
    "delete from public.booking_number_sequences;",
    // Inserts skip app triggers (stage/number rules) so rows land exactly as in prod.
    "set local session_replication_role = replica;",
  ]
  for (const t of TABLES) {
    const rows = out[t.name]
    if (!rows?.length) continue
    const cols = Object.keys(rows[0]).map((c) => `"${c}"`).join(", ")
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = JSON.stringify(rows.slice(i, i + 200))
      lines.push(
        `insert into public.${t.name} (${cols}) select ${cols} from json_populate_recordset(null::public.${t.name}, ${sqlLiteral(chunk)}::json);`
      )
    }
  }
  lines.push(`
insert into public.booking_number_sequences (product_code, year, last_number)
select parsed.product_code,
  parsed.year,
  max(parsed.sequence_number)
from (
  select raw.product_code,
    case when length(raw.year_text) = 2 then 2000 + raw.year_text::integer else raw.year_text::integer end as year,
    raw.sequence_number
  from (
    select substring(booking_number from '^([A-Z]+)-') as product_code,
      substring(booking_number from '^[A-Z]+-([0-9]+)-') as year_text,
      substring(booking_number from '^[A-Z]+-[0-9]+-([0-9]+)$')::integer as sequence_number
    from public.bookings
    where booking_number ~ '^LTT-([0-9]{2}|[0-9]{4})-[0-9]{4}$'
  ) raw
) parsed
group by parsed.product_code, parsed.year;`)
  lines.push("commit;")

  const tmpDir = path.join(repoRoot, "tmp-db-sync")
  mkdirSync(tmpDir, { recursive: true })
  const sqlFile = path.join(tmpDir, "seed-bookings-from-prod.sql")
  writeFileSync(sqlFile, lines.join("\n"), "utf8")

  applyLocalSqlFile(sqlFile, { label: "seed-prod-bookings" })
  for (const t of TABLES) if (out[t.name]) console.log(`  ${t.name}: ${out[t.name].length}`)
  console.log("[seed-prod-bookings] done.")
}

main().catch((error) => {
  console.error("[seed-prod-bookings] failed:", error instanceof Error ? error.message : error)
  process.exit(1)
})
