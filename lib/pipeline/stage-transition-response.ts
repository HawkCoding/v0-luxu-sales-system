import type { GateFailure } from "@/lib/pipeline/validate-transition"

export interface StageTransitionFailurePayload {
  failures: GateFailure[]
  isManager: boolean
}

function isGateFailure(value: unknown): value is GateFailure {
  if (!value || typeof value !== "object") return false

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.gateId === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.fixHint === "string" &&
    (candidate.severity === "block" || candidate.severity === "confirm")
  )
}

export function parseStageTransitionFailurePayload(payload: unknown): StageTransitionFailurePayload | null {
  if (!payload || typeof payload !== "object") return null

  const candidate = payload as Record<string, unknown>
  if (!Array.isArray(candidate.failures) || !candidate.failures.every(isGateFailure)) return null

  return {
    failures: candidate.failures,
    isManager: Boolean(candidate.isManager),
  }
}

export function getApiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback

  const candidate = payload as Record<string, unknown>
  return typeof candidate.error === "string" && candidate.error.trim() ? candidate.error : fallback
}
