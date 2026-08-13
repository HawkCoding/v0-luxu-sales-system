import type { CommissionBreakdown } from "@/lib/types"
import { BASE_CURRENCY, formatMoney } from "@/lib/money"

interface CommissionBadgeProps {
  commission: CommissionBreakdown | null | undefined
  currency?: string
  className?: string
}

function formatValue(commission: CommissionBreakdown, currency: string): string {
  if (commission.type === "percent") return `${commission.value.toFixed(2)}%`
  if (commission.type === "fixed") return `${formatMoney(commission.value, currency)} total`
  return `${formatMoney(commission.value, currency)} / pax`
}

export function CommissionBadge({
  commission,
  currency = BASE_CURRENCY,
  className,
}: CommissionBadgeProps) {
  if (!commission || commission.type === null) return null

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums ${className ?? ""}`}
      aria-label={`Commission ${formatValue(commission, currency)}`}
      title={`Commission amount: ${formatMoney(commission.amount, currency)}`}
    >
      <span>Commission:</span>
      <span className="text-foreground">{formatValue(commission, currency)}</span>
    </span>
  )
}
