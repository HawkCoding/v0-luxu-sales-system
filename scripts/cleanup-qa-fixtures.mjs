// Removes the @luxusqa.test fixture customers (and their historical-import
// bookings) that the system-QA passes leave behind, so later QA prompts can
// assert list counts, pagination and dashboard totals against a sane baseline.
//
// Keeps the QA anchor customer and its linked partner — prompts 08-15 depend on
// them — and refuses to touch any booking that has real work attached (quotes,
// invoices, payments), which the historical-import rows never do.
//
// LOCAL ONLY: refuses to run against anything but 127.0.0.1 / localhost.
//
// USAGE:
//   pnpm db:cleanup:qa                 -> dry run, prints what it would delete
//   pnpm db:cleanup:qa -- --execute    -> actually deletes

import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createClient } from "@supabase/supabase-js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")

const QA_EMAIL_PATTERN = "%@luxusqa.test"
/**
 * QA anchor customer + its linked partner. Prompts 06-15 read these, and their
 * emails match the fixture pattern, so they must be excluded by id.
 * Re-created 2026-08-12 after a local db reset; the first pair is the original
 * anchor from qa/reports/system-qa/2026-08-12-05-customers.md.
 */
const KEEP_CUSTOMER_IDS = [
  "120ebecd-db15-44d6-87fd-dca88e104f8f",
  "91b32a6c-412b-4257-8d18-1cf3b8561c57",
  "9d9f0521-7bff-471f-9db4-77358b8fadd9",
  "d92f13a6-4030-4630-8dad-d358766fa9e6",
]
const DELETE_BATCH_SIZE = 100
const PAGE_SIZE = 1000

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

function requireEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}. Add it to .env.local or the current shell.`)
  return value
}

function assertLocalTarget(supabaseUrl) {
  let host
  try {
    host = new URL(supabaseUrl).hostname
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.")
  }

  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Refusing to delete QA fixtures against ${host}. This script is local-only.`)
  }
}

function formatSupabaseError(error) {
  if (!error) return "unknown error"
  return [error.message, error.code ? `code=${error.code}` : null, error.details, error.hint]
    .filter(Boolean)
    .join("; ")
}

function throwIfError(error, message) {
  if (!error) return
  throw new Error(`${message}: ${formatSupabaseError(error)}`)
}

function chunk(items, size) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

async function countRows(supabase, table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true })
  throwIfError(error, `Failed to count ${table}`)
  return count ?? 0
}

/** PostgREST caps a select at 1000 rows, and a QA pass leaves more than that. */
async function fetchAllPages(query, pageSize = PAGE_SIZE) {
  const rows = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await query().range(offset, offset + pageSize - 1)
    throwIfError(error, "Failed to page through rows")
    rows.push(...(data ?? []))
    if ((data ?? []).length < pageSize) return rows
  }
}

async function fetchQaCustomers(supabase) {
  const rows = await fetchAllPages(() =>
    supabase.from("customers").select("id, email").ilike("email", QA_EMAIL_PATTERN).order("id"),
  )

  return rows.filter((customer) => !KEEP_CUSTOMER_IDS.includes(customer.id))
}

async function fetchBookings(supabase, customerIds) {
  const bookings = []
  for (const batch of chunk(customerIds, DELETE_BATCH_SIZE)) {
    const rows = await fetchAllPages(() =>
      supabase.from("bookings").select("id, customer_id").in("customer_id", batch).order("id"),
    )
    bookings.push(...rows)
  }
  return bookings
}

/** Anything with real downstream work attached is not a throwaway import row. */
async function findProtectedBookingIds(supabase, bookingIds) {
  const protectedIds = new Set()

  for (const [table, column] of [
    ["quotes", "booking_id"],
    ["invoices", "booking_id"],
    ["payments", "booking_id"],
  ]) {
    for (const batch of chunk(bookingIds, DELETE_BATCH_SIZE)) {
      const rows = await fetchAllPages(() =>
        supabase.from(table).select(column).in(column, batch).order(column),
      )
      for (const row of rows) protectedIds.add(row[column])
    }
  }

  return protectedIds
}

async function deleteByIds(supabase, table, ids, label) {
  let deleted = 0
  for (const batch of chunk(ids, DELETE_BATCH_SIZE)) {
    const { error } = await supabase.from(table).delete().in("id", batch)
    throwIfError(error, `Failed to delete ${label}`)
    deleted += batch.length
  }
  return deleted
}

async function main() {
  const execute = process.argv.includes("--execute")

  loadEnvFile(path.join(repoRoot, ".env.local"))
  loadEnvFile(path.join(repoRoot, ".env"))

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  assertLocalTarget(supabaseUrl)

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const customersBefore = await countRows(supabase, "customers")
  const bookingsBefore = await countRows(supabase, "bookings")

  const qaCustomers = await fetchQaCustomers(supabase)
  const allBookings = qaCustomers.length > 0
    ? await fetchBookings(supabase, qaCustomers.map((customer) => customer.id))
    : []
  const protectedBookingIds =
    allBookings.length > 0
      ? await findProtectedBookingIds(supabase, allBookings.map((booking) => booking.id))
      : new Set()

  // A customer with any real work attached is kept whole — booking and all —
  // rather than half-deleted.
  const keptCustomerIds = new Set(
    allBookings.filter((booking) => protectedBookingIds.has(booking.id)).map((booking) => booking.customer_id),
  )
  const customerIds = qaCustomers
    .map((customer) => customer.id)
    .filter((id) => !keptCustomerIds.has(id))
  const bookingIds = allBookings
    .filter((booking) => !keptCustomerIds.has(booking.customer_id))
    .map((booking) => booking.id)

  console.log(`Target: ${supabaseUrl}`)
  console.log(`\nBefore: customers ${customersBefore}, bookings ${bookingsBefore}`)
  console.log(`QA fixture customers matching ${QA_EMAIL_PATTERN}: ${qaCustomers.length}`)
  console.log(`  (keeping ${KEEP_CUSTOMER_IDS.length} anchor customers: ${KEEP_CUSTOMER_IDS.join(", ")})`)

  if (keptCustomerIds.size > 0) {
    console.log(
      `\nKeeping ${keptCustomerIds.size} fixture customer(s) whose bookings have quotes, invoices or payments attached:`,
    )
    for (const id of keptCustomerIds) console.log(`  ${id}`)
  }

  console.log(`\nWould delete: ${customerIds.length} customers, ${bookingIds.length} bookings`)

  if (!execute) {
    console.log("\nDry run — nothing was deleted. Re-run with `-- --execute` to apply.")
    return
  }

  const deletedBookings = await deleteByIds(supabase, "bookings", bookingIds, "QA fixture bookings")
  const deletedCustomers = await deleteByIds(supabase, "customers", customerIds, "QA fixture customers")

  const customersAfter = await countRows(supabase, "customers")
  const bookingsAfter = await countRows(supabase, "bookings")

  console.log(`\nDeleted ${deletedBookings} bookings and ${deletedCustomers} customers.`)
  console.log(`After: customers ${customersAfter}, bookings ${bookingsAfter}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
