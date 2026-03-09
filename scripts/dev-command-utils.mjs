import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const projectRoot = path.resolve(__dirname, "..")
export const isWindows = process.platform === "win32"

function quoteWindowsArg(value) {
  if (!value) return '""'
  if (!/[\s"]/u.test(value)) return value
  return `"${value.replace(/"/g, '\\"')}"`
}

export function getCommandInvocation(command, args) {
  if (!isWindows) {
    return { file: command, args }
  }

  const commandLine = [command, ...args].map(quoteWindowsArg).join(" ")
  return {
    file: "cmd.exe",
    args: ["/d", "/s", "/c", commandLine],
  }
}

export function runSync(command, args, options = {}) {
  const invocation = getCommandInvocation(command, args)
  return execFileSync(invocation.file, invocation.args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    ...options,
  })
}

export function runFileSync(file, args, options = {}) {
  return execFileSync(file, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    ...options,
  })
}
