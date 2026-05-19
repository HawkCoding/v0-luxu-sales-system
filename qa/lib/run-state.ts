import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

export interface QaRunState {
  supplier?: {
    id: string
    slug: string
  }
  package?: {
    id: string
    slug: string
  }
  customer?: {
    id: string
  }
}

const RUN_STATE_PATH = resolve(process.cwd(), "qa", ".run-state.json")

export function readRunState(): QaRunState {
  if (!existsSync(RUN_STATE_PATH)) {
    return {}
  }

  return JSON.parse(readFileSync(RUN_STATE_PATH, "utf8")) as QaRunState
}

export function writeRunState(nextState: QaRunState): void {
  writeFileSync(RUN_STATE_PATH, `${JSON.stringify(nextState, null, 2)}\n`, "utf8")
}
