import type {
  CommissionBreakdown,
  CommissionKind,
  ResolvedCommission,
} from "@/lib/types"

export interface CommissionInputs {
  lineOverride?: { type: CommissionKind | null; value: number | null } | null
}

const NONE: ResolvedCommission = { type: null, value: 0, source: "none" }

function isUsable(entry: { type: CommissionKind | null; value: number | null } | null | undefined) {
  return Boolean(
    entry &&
      entry.type !== null &&
      entry.value !== null &&
      Number.isFinite(entry.value) &&
      (entry.value as number) >= 0,
  )
}

export function resolveCommission(inputs: CommissionInputs): ResolvedCommission {
  if (isUsable(inputs.lineOverride)) {
    const entry = inputs.lineOverride!
    return { type: entry.type, value: entry.value as number, source: "line" }
  }
  return NONE
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export interface ApplyCommissionInput {
  amountAfterMarkup: number
  passengerCount: number
  resolved: ResolvedCommission
}

export function calculateCommissionAmount({
  amountAfterMarkup,
  passengerCount,
  resolved,
}: ApplyCommissionInput): number {
  if (resolved.type === null || resolved.value <= 0) return 0
  if (resolved.type === "percent") {
    return roundMoney(amountAfterMarkup * (resolved.value / 100))
  }
  return roundMoney(resolved.value * Math.max(0, passengerCount))
}

export function buildCommissionBreakdown(
  resolved: ResolvedCommission,
  amount: number,
  passengerCount?: number,
): CommissionBreakdown | null {
  if (resolved.type === null) return null
  return {
    type: resolved.type,
    value: resolved.value,
    amount: roundMoney(amount),
    source: resolved.source,
    ...(passengerCount === undefined ? {} : { passengerCount }),
  }
}
