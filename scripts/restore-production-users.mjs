import { randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createClient } from "@supabase/supabase-js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")
const REQUIRED_OPT_IN = "I_UNDERSTAND_THIS_WRITES_TO_PRODUCTION"

const users = [
  {
    email: "carmen@luxustravel.co.za",
    name: "Carmen",
    surname: "de Jager",
    clearanceLevel: "admin",
  },
  {
    email: "dirk@luxustravel.co.za",
    name: "Dirk",
    surname: "Rossouw",
    clearanceLevel: "manager",
  },
  {
    email: "leonie@luxustravel.co.za",
    name: "Leonie",
    surname: "Botha",
    clearanceLevel: "consultant",
  },
  {
    email: "monade@luxustravel.co.za",
    name: "Monade",
    surname: "van Eeden",
    clearanceLevel: "consultant",
  },
  {
    email: "douwlien@luxustravel.co.za",
    name: "Douwlien",
    surname: "Louw",
    clearanceLevel: "readonly",
  },
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
      `Refusing to restore production users against ${actualHost}. Expected ${expectedHost} from SUPABASE_PROD_PROJECT_REF.`
    )
  }
}

function createTemporaryPassword() {
  return `${randomBytes(18).toString("base64url")}aA1!`
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

async function main() {
  loadEnvFile(path.join(repoRoot, ".env.sync.local"))
  loadEnvFile(path.join(repoRoot, ".env.production.local"))
  loadEnvFile(path.join(repoRoot, ".env.local"))

  if (process.env.ALLOW_PRODUCTION_USER_RESTORE !== REQUIRED_OPT_IN) {
    throw new Error(
      `Production user restore blocked. Set ALLOW_PRODUCTION_USER_RESTORE=${REQUIRED_OPT_IN}.`
    )
  }

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  assertProductionTarget(supabaseUrl)
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const existingUsersByEmail = await listAuthUsersByEmail(supabase)
  const createdCredentials = []

  for (const user of users) {
    const email = user.email.toLowerCase()
    let authUser = existingUsersByEmail.get(email)

    if (!authUser) {
      const password = createTemporaryPassword()
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name: user.name,
          surname: user.surname,
        },
      })
      if (error || !data.user) {
        throw new Error(`Failed to create Auth user ${email}: ${error?.message ?? "missing user"}`)
      }

      authUser = data.user
      createdCredentials.push({ email, password })
      console.log(`Created Auth user: ${email}`)
    } else {
      const { error } = await supabase.auth.admin.updateUserById(authUser.id, {
        user_metadata: {
          name: user.name,
          surname: user.surname,
        },
      })
      if (error) {
        throw new Error(`Failed to update Auth metadata for ${email}: ${error.message}`)
      }
      console.log(`Auth user exists: ${email}`)
    }

    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        user_id: authUser.id,
        email,
        name: user.name,
        surname: user.surname,
        clearance_level: user.clearanceLevel,
        is_active: true,
      },
      { onConflict: "user_id" }
    )

    if (profileError) {
      throw new Error(`Failed to upsert profile for ${email}: ${profileError.message}`)
    }
    console.log(`Upserted profile: ${email} (${user.clearanceLevel})`)
  }

  if (createdCredentials.length > 0) {
    const outputDir = path.join(repoRoot, "tmp-db-sync")
    mkdirSync(outputDir, { recursive: true })
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const outputPath = path.join(outputDir, `production-bootstrap-user-passwords-${timestamp}.txt`)
    const body = [
      "Temporary passwords for newly-created production users.",
      "This file is gitignored under tmp-db-sync/. Rotate or reset these passwords after first login.",
      "",
      ...createdCredentials.map(({ email, password }) => `${email}: ${password}`),
      "",
    ].join("\n")
    writeFileSync(outputPath, body, { encoding: "utf8", flag: "wx" })
    console.log(`Temporary passwords written to ${path.relative(repoRoot, outputPath)}`)
  } else {
    console.log("No new Auth users were created; no temporary password file was written.")
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
