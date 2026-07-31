import type { CommissionBreakdown } from "@/lib/types"

interface CommissionBadgeProps {
  commission: CommissionBreakdown | null | undefined
  currency?: string
  className?: string
}

function formatValue(commission: CommissionBreakdown, currency: string): string {
  if (commission.type === "percent") return `${commission.value.toFixed(2)}%`
  if (commission.type === "fixed") return `${currency} ${commission.value.toFixed(2)} total`
  return `${currency} ${commission.value.toFixed(2)} / pax`
}

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

export function CommissionBadge({
  commission,
  currency = "ZAR",
  className,
}: CommissionBadgeProps) {
  if (!commission || commission.type === null) return null

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums ${className ?? ""}`}
      aria-label={`Commission ${formatValue(commission, currency)}`}
      title={`Commission amount: ${formatAmount(commission.amount, currency)}`}
    >
      <span>Commission:</span>
      <span className="text-foreground">{formatValue(commission, currency)}</span>
    </span>
  )
}
