import type {
  CommissionBreakdown,
  CommissionKind,
  CommissionSource,
  ResolvedCommission,
} from "@/lib/types"

export interface CommissionInputs {
  supplierDefault?: { type: CommissionKind | null; value: number | null } | null
  routeOverride?: { type: CommissionKind | null; value: number | null } | null
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
  const layers: { entry: { type: CommissionKind | null; value: number | null } | null | undefined; source: CommissionSource }[] = [
    { entry: inputs.lineOverride, source: "line" },
    { entry: inputs.routeOverride, source: "route" },
    { entry: inputs.supplierDefault, source: "supplier" },
  ]

  for (const layer of layers) {
    if (isUsable(layer.entry)) {
      const entry = layer.entry!
      return { type: entry.type, value: entry.value as number, source: layer.source }
    }
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
): CommissionBreakdown | null {
  if (resolved.type === null) return null
  return {
    type: resolved.type,
    value: resolved.value,
    amount: roundMoney(amount),
    source: resolved.source,
  }
}

export interface CommissionContext {
  supplierDefault: { type: CommissionKind | null; value: number | null } | null
  routeOverride: { type: CommissionKind | null; value: number | null } | null
}

export function getCommission(context: CommissionContext): ResolvedCommission {
  return resolveCommission({
    supplierDefault: context.supplierDefault,
    routeOverride: context.routeOverride,
  })
}

export function describeCommissionSource(source: CommissionSource): string {
  switch (source) {
    case "line":
      return "line override"
    case "route":
      return "route override"
    case "supplier":
      return "supplier default"
    default:
      return "no commission"
  }
}
