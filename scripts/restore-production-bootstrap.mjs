import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createClient } from "@supabase/supabase-js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")
const REQUIRED_OPT_IN = "I_UNDERSTAND_THIS_WRITES_TO_PRODUCTION"

const countries = [
  ["South Africa", "ZA", "ZAF"],
  ["United Kingdom", "GB", "GBR"],
  ["United States", "US", "USA"],
  ["Germany", "DE", "DEU"],
  ["France", "FR", "FRA"],
  ["Italy", "IT", "ITA"],
  ["Australia", "AU", "AUS"],
  ["Canada", "CA", "CAN"],
  ["Netherlands", "NL", "NLD"],
  ["Sweden", "SE", "SWE"],
  ["Switzerland", "CH", "CHE"],
  ["UAE", "AE", "ARE"],
  ["India", "IN", "IND"],
  ["Japan", "JP", "JPN"],
  ["Brazil", "BR", "BRA"],
  ["New Zealand", "NZ", "NZL"],
  ["Spain", "ES", "ESP"],
  ["Portugal", "PT", "PRT"],
  ["Austria", "AT", "AUT"],
  ["Belgium", "BE", "BEL"],
  ["Denmark", "DK", "DNK"],
  ["Norway", "NO", "NOR"],
  ["Singapore", "SG", "SGP"],
  ["China", "CN", "CHN"],
  ["Other", null, null],
]

const aliasesByCountry = {
  "South Africa": ["South Africa", "RSA", "SA", "ZA", "ZAF", "Republic of South Africa", "S Africa", "Southafrica"],
  "United Kingdom": ["United Kingdom", "UK", "GB", "GBR", "Great Britain", "Britain", "England"],
  "United States": ["United States", "USA", "US", "United States of America", "America", "U S A"],
  Germany: ["Germany", "Deutschland", "DE", "DEU"],
  France: ["France", "FR", "FRA"],
  Italy: ["Italy", "IT", "ITA"],
  Australia: ["Australia", "AU", "AUS"],
  Canada: ["Canada", "CA", "CAN"],
  Netherlands: ["Netherlands", "Holland", "NL", "NLD"],
  Sweden: ["Sweden", "SE", "SWE"],
  Switzerland: ["Switzerland", "CH", "CHE"],
  UAE: ["UAE", "United Arab Emirates", "AE", "ARE", "Abu Dhabi", "Dubai"],
  India: ["India", "IN", "IND"],
  Japan: ["Japan", "JP", "JPN"],
  Brazil: ["Brazil", "BR", "BRA"],
  "New Zealand": ["New Zealand", "NZ", "NZL"],
  Spain: ["Spain", "ES", "ESP"],
  Portugal: ["Portugal", "PT", "PRT"],
  Austria: ["Austria", "AT", "AUT"],
  Belgium: ["Belgium", "BE", "BEL"],
  Denmark: ["Denmark", "DK", "DNK"],
  Norway: ["Norway", "NO", "NOR"],
  Singapore: ["Singapore", "SG", "SGP"],
  China: ["China", "CN", "CHN", "PRC", "People's Republic of China"],
  Other: ["Other", "Unknown", "N/A", "NA", "None", "Unspecified"],
}

const locations = [
  ["00000000-0000-0000-0000-000000001001", "Pretoria", "South Africa", "ZA-GP"],
  ["00000000-0000-0000-0000-000000001002", "Cape Town", "South Africa", "ZA-WC"],
  ["00000000-0000-0000-0000-000000001003", "Durban", "South Africa", "ZA-KZN"],
  ["00000000-0000-0000-0000-000000001004", "Victoria Falls", "Zimbabwe", "ZW-MW"],
  ["00000000-0000-0000-0000-000000001005", "Swakopmund", "Namibia", "NA-ER"],
  ["00000000-0000-0000-0000-000000001006", "Dar es Salaam", "Tanzania", "TZ-02"],
]

const settings = [
  ["business_name", "Luxus Travel and Tours"],
  ["default_deposit_percentage", "25"],
  ["session_timeout_minutes", "30"],
]

const staffProfiles = [
  ["carmen@luxustravel.co.za", "Carmen", "de Jager", "admin"],
  ["dirk@luxustravel.co.za", "Dirk", "Rossouw", "manager"],
  ["leonie@luxustravel.co.za", "Leonie", "Botha", "consultant"],
  ["monade@luxustravel.co.za", "Monade", "van Eeden", "consultant"],
  ["douwlien@luxustravel.co.za", "Douwlien", "Louw", "readonly"],
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
  const actualHost = new URL(supabaseUrl).host
  if (actualHost !== expectedHost) {
    throw new Error(
      `Refusing to restore production bootstrap data against ${actualHost}. Expected ${expectedHost} from SUPABASE_PROD_PROJECT_REF.`
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
    error.status ? `status=${error.status}` : null,
    error.statusText ? `statusText=${error.statusText}` : null,
  ].filter(Boolean)

  if (details.length > 0) {
    return details.join("; ")
  }

  return JSON.stringify(error)
}

function throwIfError(error, message) {
  if (!error) return
  throw new Error(`${message}: ${formatSupabaseError(error)}`)
}

async function countRows(supabase, table) {
  const { count, error } = await supabase.from(table).select("*", {
    count: "exact",
    head: true,
  })
  throwIfError(error, `Failed to count ${table}`)
  return count ?? 0
}

async function ensureSchemaExists(supabase) {
  for (const table of ["countries", "country_aliases", "locations", "profiles", "app_settings"]) {
    await countRows(supabase, table)
  }
}

async function upsertCountries(supabase) {
  const rows = countries.map(([name, iso_alpha2, iso_alpha3]) => ({
    name,
    iso_alpha2,
    iso_alpha3,
  }))

  const { error } = await supabase.from("countries").upsert(rows, { onConflict: "name" })
  throwIfError(error, "Failed to upsert countries")
  console.log(`Upserted ${rows.length} countries.`)
}

async function insertMissingAliases(supabase) {
  const countryNames = countries.map(([name]) => name)
  const { data: countryRows, error: countriesError } = await supabase
    .from("countries")
    .select("id, name")
    .in("name", countryNames)
  throwIfError(countriesError, "Failed to load countries for aliases")

  const countryIdsByName = new Map(countryRows.map((country) => [country.name, country.id]))
  const { data: existingAliases, error: aliasesError } = await supabase
    .from("country_aliases")
    .select("alias")
  throwIfError(aliasesError, "Failed to load existing country aliases")

  const existing = new Set((existingAliases ?? []).map((row) => row.alias.toLowerCase()))
  const missingAliases = []
  for (const [countryName, aliases] of Object.entries(aliasesByCountry)) {
    const countryId = countryIdsByName.get(countryName)
    if (!countryId) {
      throw new Error(`Missing country after upsert: ${countryName}`)
    }

    for (const alias of aliases) {
      const normalizedAlias = alias.trim().toLowerCase()
      if (!existing.has(normalizedAlias)) {
        missingAliases.push({ country_id: countryId, alias: normalizedAlias })
      }
    }
  }

  if (missingAliases.length === 0) {
    console.log("Country aliases already up to date.")
    return
  }

  const { error } = await supabase.from("country_aliases").insert(missingAliases)
  throwIfError(error, "Failed to insert country aliases")
  console.log(`Inserted ${missingAliases.length} country aliases.`)
}

async function upsertLocations(supabase) {
  const rows = locations.map(([id, name, country, region_code]) => ({
    id,
    name,
    country,
    region_code,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase.from("locations").upsert(rows, { onConflict: "id" })
  throwIfError(error, "Failed to upsert locations")
  console.log(`Upserted ${rows.length} locations.`)
}

async function upsertSettings(supabase) {
  const rows = settings.map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }))
  const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" })
  throwIfError(error, "Failed to upsert app settings")
  console.log(`Upserted ${rows.length} app settings.`)
}

async function ensureBucket(supabase, id, options) {
  const { error: createError } = await supabase.storage.createBucket(id, options)
  if (!createError) {
    console.log(`Created storage bucket: ${id}`)
    return
  }

  if (!/already exists/i.test(createError.message)) {
    throw new Error(`Failed to create storage bucket ${id}: ${createError.message}`)
  }

  const { error: updateError } = await supabase.storage.updateBucket(id, options)
  throwIfError(updateError, `Failed to update storage bucket ${id}`)
  console.log(`Updated storage bucket: ${id}`)
}

async function ensureBuckets(supabase) {
  await ensureBucket(supabase, "voucher-assets", {
    public: true,
    fileSizeLimit: 5242880,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"],
  })
  await ensureBucket(supabase, "vouchers", {
    public: false,
    fileSizeLimit: 10485760,
    allowedMimeTypes: ["application/pdf"],
  })
}

async function listAuthUsersByEmail(supabase) {
  const usersByEmail = new Map()
  let page = 1
  const perPage = 1000

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error

    for (const authUser of data.users) {
      if (authUser.email) {
        usersByEmail.set(authUser.email.toLowerCase(), authUser)
      }
    }

    if (data.users.length < perPage) break
    page += 1
  }

  return usersByEmail
}

async function upsertProfilesForExistingUsers(supabase) {
  const authUsersByEmail = await listAuthUsersByEmail(supabase)
  const rows = []
  const missing = []

  for (const [email, name, surname, clearanceLevel] of staffProfiles) {
    const authUser = authUsersByEmail.get(email)
    if (!authUser) {
      missing.push(email)
      continue
    }

    rows.push({
      user_id: authUser.id,
      email,
      name,
      surname,
      clearance_level: clearanceLevel,
      is_active: true,
    })
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("profiles").upsert(rows, { onConflict: "user_id" })
    throwIfError(error, "Failed to upsert staff profiles")
    console.log(`Upserted ${rows.length} staff profiles.`)
  }

  if (missing.length > 0) {
    console.log(`Missing Auth users, profiles not created yet: ${missing.join(", ")}`)
  }
}

async function printVerification(supabase) {
  const [countryCount, aliasCount, locationCount, settingsCount] = await Promise.all([
    countRows(supabase, "countries"),
    countRows(supabase, "country_aliases"),
    countRows(supabase, "locations"),
    countRows(supabase, "app_settings"),
  ])
  const { count: adminCount, error: adminError } = await supabase
    .from("profiles")
    .select("user_id", { count: "exact", head: true })
    .eq("clearance_level", "admin")
    .eq("is_active", true)
  throwIfError(adminError, "Failed to count active admin profiles")

  console.log("Verification:")
  console.log(`countries: ${countryCount}`)
  console.log(`country_aliases: ${aliasCount}`)
  console.log(`locations: ${locationCount}`)
  console.log(`app_settings: ${settingsCount}`)
  console.log(`active_admin_profiles: ${adminCount ?? 0}`)
}

async function main() {
  loadEnvFile(path.join(repoRoot, ".env.sync.local"))
  loadEnvFile(path.join(repoRoot, ".env.production.local"))
  loadEnvFile(path.join(repoRoot, ".env.local"))

  if (process.env.ALLOW_PRODUCTION_BOOTSTRAP_RESTORE !== REQUIRED_OPT_IN) {
    throw new Error(
      `Production bootstrap restore blocked. Set ALLOW_PRODUCTION_BOOTSTRAP_RESTORE=${REQUIRED_OPT_IN}.`
    )
  }

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  assertProductionTarget(supabaseUrl)

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  await ensureSchemaExists(supabase)
  await upsertCountries(supabase)
  await insertMissingAliases(supabase)
  await upsertLocations(supabase)
  await upsertSettings(supabase)
  await ensureBuckets(supabase)
  await upsertProfilesForExistingUsers(supabase)
  await printVerification(supabase)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
