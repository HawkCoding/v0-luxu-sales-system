import { existsSync } from "node:fs"
import { resolve } from "node:path"

export function configurePlaywrightRuntime(): void {
  const libPath = resolve(process.cwd(), "qa", ".playwright-libs", "lib")
  if (!existsSync(libPath)) {
    return
  }

  const existing = process.env.LD_LIBRARY_PATH
  process.env.LD_LIBRARY_PATH = existing ? `${libPath}:${existing}` : libPath
}
