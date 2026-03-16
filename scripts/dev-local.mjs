import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"

import {
  projectRoot,
  runSync,
} from "./dev-command-utils.mjs"

const REQUIRED_SUPABASE_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
]

function parseEnvFile(fileContents) {
  const parsed = {}

  for (const rawLine of fileContents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const match = rawLine.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match) continue

    const [, key, value] = match
    let normalized = value.trim()

    if (
      (normalized.startsWith('"') && normalized.endsWith('"')) ||
      (normalized.startsWith("'") && normalized.endsWith("'"))
    ) {
      normalized = normalized.slice(1, -1)
    }

    parsed[key] = normalized
  }

  return parsed
}

function loadLocalEnv() {
  const envPath = path.join(projectRoot, ".env.local")
  if (!fs.existsSync(envPath)) return {}
  return parseEnvFile(fs.readFileSync(envPath, "utf8"))
}

function parseSupabaseStatus(output) {
  const statusEnv = {}

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    const assignment = line.startsWith("export ")
      ? line.slice("export ".length)
      : line
    const separatorIndex = assignment.indexOf("=")
    if (separatorIndex === -1) continue

    const key = assignment.slice(0, separatorIndex).trim()
    let value = assignment.slice(separatorIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    switch (key) {
      case "API_URL":
        statusEnv.NEXT_PUBLIC_SUPABASE_URL = value
        break
      case "ANON_KEY":
        statusEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY = value
        break
      case "SERVICE_ROLE_KEY":
        statusEnv.SUPABASE_SERVICE_ROLE_KEY = value
        break
      default:
        break
    }
  }

  for (const requiredKey of REQUIRED_SUPABASE_VARS) {
    if (!statusEnv[requiredKey]) {
      throw new Error(
        `Missing ${requiredKey} from \`supabase status -o env\`. Make sure the local Supabase stack started successfully.`
      )
    }
  }

  return statusEnv
}

function startLocalSupabase() {
  console.log("Starting local Supabase stack...")
  try {
    runSync("npx", ["supabase", "start"])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      [
        "Failed to start the local Supabase stack.",
        "Check that Docker Desktop is running and that ports 54321-54324 are free.",
        message,
      ].join(" ")
    )
  }

  console.log("Reading local Supabase connection details...")
  return parseSupabaseStatus(runSync("npx", ["supabase", "status", "-o", "env"]))
}

function startNextDev(env) {
  const child = spawn(process.execPath, ["scripts/start-next-dev.mjs"], {
    cwd: projectRoot,
    env,
    stdio: "inherit",
  })

  const forwardSignal = (signal) => {
    if (child.exitCode === null && !child.killed) {
      child.kill(signal)
    }
  }

  process.on("SIGINT", () => forwardSignal("SIGINT"))
  process.on("SIGTERM", () => forwardSignal("SIGTERM"))

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }

    process.exit(code ?? 0)
  })

  child.on("error", (error) => {
    console.error("Failed to start the shared Next.js dev launcher:", error)
    process.exit(1)
  })
}

try {
  const localSupabaseEnv = startLocalSupabase()
  const localFileEnv = loadLocalEnv()
  const mergedEnv = {
    ...process.env,
    ...localFileEnv,
    ...localSupabaseEnv,
  }

  console.log("Launching Next.js with local Supabase credentials...")
  startNextDev(mergedEnv)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
