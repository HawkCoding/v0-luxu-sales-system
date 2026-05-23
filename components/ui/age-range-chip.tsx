import { formatBucketRange, type AgeBuckets } from "@/lib/pricing/age-buckets"

type AgeKind = "adult" | "child" | "infant"

interface AgeRangeChipProps {
  kind: AgeKind
  buckets: AgeBuckets
  className?: string
}

export function AgeRangeChip({ kind, buckets, className }: AgeRangeChipProps) {
  const ranges = formatBucketRange(buckets)
  const label = ranges[kind]
  return (
    <span
      className={`ml-1.5 inline-flex items-center rounded-sm bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground ${className ?? ""}`}
      aria-label={`${kind} age range ${label}`}
    >
      {label}
    </span>
  )
}
