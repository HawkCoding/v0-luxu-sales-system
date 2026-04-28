import fs from "node:fs"
import net from "node:net"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

import {
  getCommandInvocation,
  isWindows,
  projectRoot,
  runFileSync,
} from "./dev-command-utils.mjs"

const __filename = fileURLToPath(import.meta.url)
const scriptPath = path.resolve(__filename)
const nextLockPath = path.join(projectRoot, ".next", "dev", "lock")
const appPort = 3000
const appPorts = [appPort]
const scriptMarkers = [
  scriptPath.toLowerCase(),
  path.join("scripts", "start-next-dev.mjs").toLowerCase(),
  path.join("scripts", "dev-local.mjs").toLowerCase(),
  "start-next-dev.mjs",
  "dev-local.mjs",
  "next dev",
]

function parseJsonOutput(output) {
  const trimmed = output.trim()

  if (!trimmed) return []

  const parsed = JSON.parse(trimmed)
  return Array.isArray(parsed) ? parsed : [parsed]
}

function listOtherLauncherProcesses() {
  if (!isWindows) return []

  const command = [
    "$processes = Get-CimInstance Win32_Process",
    "| Where-Object { $_.CommandLine }",
    "| Select-Object ProcessId, Name, CommandLine",
    "| ConvertTo-Json -Compress",
  ].join(" ")

  try {
    const output = runFileSync("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      command,
    ])
    const currentPid = process.pid

    return parseJsonOutput(output).filter((entry) => {
      const processName = String(entry.Name ?? "").toLowerCase()
      const commandLine = String(entry.CommandLine ?? "").toLowerCase()
      const processId = Number(entry.ProcessId)

      return (
        Number.isFinite(processId) &&
        processId !== currentPid &&
        ["node.exe", "cmd.exe", "pnpm.exe"].includes(processName) &&
        scriptMarkers.some((marker) => commandLine.includes(marker))
      )
    })
  } catch {
    return []
  }
}

function getProcessDetailsByPid(pid) {
  try {
    const output = runFileSync("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}") | Select-Object ProcessId, Name, CommandLine | ConvertTo-Json -Compress`,
    ])

    return parseJsonOutput(output)[0] ?? null
  } catch {
    return null
  }
}

function listListeningAppProcesses() {
  if (!isWindows) return []

  let output = ""

  try {
    output = runFileSync("netstat", ["-ano", "-p", "TCP"])
  } catch {
    return []
  }

  const pidsByPort = new Map()

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line.includes("LISTENING")) continue

    const parts = line.split(/\s+/)
    if (parts.length < 5 || parts[0] !== "TCP") continue

    const localAddress = parts[1]
    const state = parts[3]
    const pid = Number(parts[4])
    const portText = localAddress.slice(localAddress.lastIndexOf(":") + 1)
    const port = Number(portText)

    if (state !== "LISTENING" || !appPorts.includes(port) || !Number.isFinite(pid)) {
      continue
    }

    pidsByPort.set(pid, port)
  }

  return Array.from(pidsByPort.entries())
    .map(([pid, port]) => {
      const details = getProcessDetailsByPid(pid)
      if (!details) return null

      return {
        ...details,
        LocalPort: port,
      }
    })
    .filter((entry) => {
      const processName = String(entry?.Name ?? "").toLowerCase()
      return ["node.exe", "cmd.exe", "pnpm.exe"].includes(processName)
    })
}

function formatOtherLauncherMessage(otherLaunchers) {
  const processList = otherLaunchers
    .map((entry) =>
      entry.LocalPort
        ? `${entry.Name} PID ${entry.ProcessId} on port ${entry.LocalPort}`
        : `${entry.Name} PID ${entry.ProcessId}`
    )
    .join(", ")

  return [
    "Another local Next.js dev session is still running for this workspace.",
    `Stop the existing dev session first (${processList}) and then retry.`,
  ].join(" ")
}

function listExistingDevProcesses() {
  const otherProcesses = [...listOtherLauncherProcesses(), ...listListeningAppProcesses()]
  return Array.from(
    new Map(otherProcesses.map((entry) => [entry.ProcessId, entry])).values()
  )
}

function ensureNoExistingDevSession() {
  const existingProcesses = listExistingDevProcesses()

  if (existingProcesses.length > 0) {
    throw new Error(formatOtherLauncherMessage(existingProcesses))
  }
}

function removeStaleNextLock() {
  if (!fs.existsSync(nextLockPath)) return

  ensureNoExistingDevSession()

  try {
    fs.rmSync(nextLockPath)
    console.log("Removed stale Next.js dev lock at `.next/dev/lock`.")
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Found \`.next/dev/lock\` but could not remove it automatically. ${message}`
    )
  }
}

function canListenOnAppPort() {
  return new Promise((resolve) => {
    const server = net.createServer()

    server.once("error", () => {
      resolve(false)
    })

    server.once("listening", () => {
      server.close(() => resolve(true))
    })

    server.listen(appPort, "127.0.0.1")
  })
}

async function ensureAppPortAvailable() {
  const available = await canListenOnAppPort()

  if (!available) {
    throw new Error(
      `Port ${appPort} is already in use. Use the existing app at http://localhost:${appPort}; do not start a second dev server on another port.`
    )
  }
}

function startNextDev(env) {
  ensureNoExistingDevSession()
  removeStaleNextLock()

  const invocation = getCommandInvocation("pnpm", [
    "exec",
    "next",
    "dev",
    "--port",
    String(appPort),
  ])
  const child = spawn(invocation.file, invocation.args, {
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
    console.error("Failed to start Next.js dev server:", error)
    process.exit(1)
  })
}

try {
  await ensureAppPortAvailable()
  startNextDev(process.env)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
}
