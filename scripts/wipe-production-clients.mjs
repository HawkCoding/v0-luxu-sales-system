// Wipes all client/booking data from production: bookings, customers, and
// everything cascaded from them (quotes, invoices, payments, documents,
// vouchers, etc.), plus the tables that hold client data but aren't FK-linked
// to bookings/customers (inbound_email_messages, gravity_forms_submissions,
// audit_logs, audit_log_archives) and the generated PDF files in Storage.
//
// Leaves config/master data untouched: suppliers, packages, routes, rate
// cards, suite types, app_settings, templates, voucher_template, and staff
// accounts (auth.users / public.profiles).
//
// USAGE:
//   pnpm db:wipe-clients                 -> dry run, prints counts + storage
//                                            file list, makes zero writes
//   ALLOW_PRODUCTION_DATA_WIPE=I_UNDERSTAND_THIS_WRITES_TO_PRODUCTION \
//     pnpm db:wipe-clients -- --execute  -> actually deletes
//
// Take a Supabase dashboard backup (Backups -> Create backup) before running
// with --execute. This is irreversible.

import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createClient } from "@supabase/supabase-js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")
const REQUIRED_OPT_IN = "I_UNDERSTAND_THIS_WRITES_TO_PRODUCTION"

const STORAGE_BUCKETS = ["quotes", "invoices", "vouchers", "attachments", "payment-proofs"]

const PREVIEW_TABLES = [
  "bookings",
  "customers",
  "documents",
  "payments",
  "quotes",
  "inbound_email_messages",
  "gravity_forms_submissions",
  "audit_logs",
  "audit_log_archives",
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
    throw new Error(`Missing ${name}. Add it to .env.production.local, .env.local, or the current shell.`)
  }
  return value
}

function assertProductionTarget(supabaseUrl) {
  const productionProjectRef = process.env.SUPABASE_PROD_PROJECT_REF
  if (!productionProjectRef) return

  const expectedHost = `${productionProjectRef}.supabase.co`
  let actualHost
  try {
    actualHost = new URL(supabaseUrl).host
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.")
  }

  if (actualHost !== expectedHost) {
    throw new Error(
      `Refusing to wipe client data against ${actualHost}. Expected ${expectedHost} from SUPABASE_PROD_PROJECT_REF.`
    )
  }
}

function formatSupabaseError(error) {
  if (!error) return "unknown error"

  const details = [
    error.message,
    error.code ? `code=${error.code}` : null,
    error.details ? `details=${error.details}` : null,
    error.hint ? `hint=${error.hint}` : null,
  ].filter(Boolean)

  return details.length > 0 ? details.join("; ") : JSON.stringify(error)
}

function throwIfError(error, message) {
  if (!error) return
  throw new Error(`${message}: ${formatSupabaseError(error)}`)
}

async function countRows(supabase, table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true })
  throwIfError(error, `Failed to count ${table}`)
  return count ?? 0
}

async function printCounts(supabase, label) {
  console.log(`\n${label}:`)
  for (const table of PREVIEW_TABLES) {
    const count = await countRows(supabase, table)
    console.log(`  ${table}: ${count}`)
  }
}

async function listStorageObjects(supabase) {
  const { data, error } = await supabase.from("documents").select("storage_path").not("storage_path", "is", null)
  throwIfError(error, "Failed to list document storage paths")

  const byBucket = new Map()
  for (const row of data ?? []) {
    const storagePath = row.storage_path
    const slashIndex = storagePath.indexOf("/")
    if (slashIndex === -1) continue

    const bucket = storagePath.slice(0, slashIndex)
    const objectName = storagePath.slice(slashIndex + 1)
    if (!byBucket.has(bucket)) byBucket.set(bucket, [])
    byBucket.get(bucket).push(objectName)
  }

  return byBucket
}

function chunk(items, size) {
  const chunks = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

async function deleteAllRows(supabase, table, notNullColumn) {
  const { error, count } = await supabase
    .from(table)
    .delete({ count: "exact" })
    .not(notNullColumn, "is", null)
  throwIfError(error, `Failed to delete rows from ${table}`)
  console.log(`  ${table}: deleted ${count ?? 0} rows`)
}

async function removeStorageObjects(supabase, byBucket) {
  for (const bucket of STORAGE_BUCKETS) {
    const objectNames = byBucket.get(bucket) ?? []
    if (objectNames.length === 0) {
      console.log(`  ${bucket}: no objects to remove`)
      continue
    }

    let removed = 0
    for (const batch of chunk(objectNames, 100)) {
      const { data, error } = await supabase.storage.from(bucket).remove(batch)
      throwIfError(error, `Failed to remove objects from bucket ${bucket}`)
      removed += data?.length ?? 0
    }
    console.log(`  ${bucket}: removed ${removed} objects`)
  }
}

async function main() {
  const execute = process.argv.includes("--execute")

  loadEnvFile(path.join(repoRoot, ".env.production.local"))
  loadEnvFile(path.join(repoRoot, ".env.local"))

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  assertProductionTarget(supabaseUrl)

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  await printCounts(supabase, "Preview (current counts)")
  const storageObjectsByBucket = await listStorageObjects(supabase)

  console.log("\nStorage objects that would be removed:")
  for (const bucket of STORAGE_BUCKETS) {
    console.log(`  ${bucket}: ${storageObjectsByBucket.get(bucket)?.length ?? 0} objects`)
  }

  if (!execute) {
    console.log("\nDry run only — no rows or files were deleted. Pass --execute to actually wipe.")
    return
  }

  if (process.env.ALLOW_PRODUCTION_DATA_WIPE !== REQUIRED_OPT_IN) {
    throw new Error(`Production data wipe blocked. Set ALLOW_PRODUCTION_DATA_WIPE=${REQUIRED_OPT_IN}.`)
  }

  console.log("\nDeleting rows (bookings first, then customers — FK order matters)...")
  await deleteAllRows(supabase, "bookings", "id")
  await deleteAllRows(supabase, "customers", "id")
  await deleteAllRows(supabase, "inbound_email_messages", "id")
  await deleteAllRows(supabase, "gravity_forms_submissions", "id")
  await deleteAllRows(supabase, "audit_logs", "id")
  await deleteAllRows(supabase, "audit_log_archives", "id")
  await deleteAllRows(supabase, "booking_number_sequences", "product_code")

  console.log("\nRemoving storage objects...")
  await removeStorageObjects(supabase, storageObjectsByBucket)

  await printCounts(supabase, "Final counts (should all be 0)")
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
