import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const versionFilePath = resolve(process.cwd(), "lib/version.ts")
const versionFileContent = readFileSync(versionFilePath, "utf8")

const match = versionFileContent.match(/APP_VERSION\s*=\s*"(\d+)\.(\d{2})"/)
if (!match) {
  throw new Error("Could not find APP_VERSION in lib/version.ts")
}

const major = Number(match[1])
const minor = Number(match[2])

if (!Number.isInteger(major) || !Number.isInteger(minor) || minor < 0 || minor > 99) {
  throw new Error(`Invalid APP_VERSION format: ${match[0]}`)
}

const nextMinor = minor + 1
const nextMajor = nextMinor > 99 ? major + 1 : major
const normalizedMinor = nextMinor > 99 ? 0 : nextMinor
const nextVersion = `${nextMajor}.${String(normalizedMinor).padStart(2, "0")}`

const nextContent = versionFileContent.replace(
  /APP_VERSION\s*=\s*"\d+\.\d{2}"/,
  `APP_VERSION = "${nextVersion}"`,
)

writeFileSync(versionFilePath, nextContent, "utf8")
console.log(`APP_VERSION bumped to ${nextVersion}`)
