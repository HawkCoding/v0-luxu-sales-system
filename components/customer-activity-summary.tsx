"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PipelineStage } from "@/lib/types"

interface CustomerActivityBooking {
  id: string
  stage: PipelineStage
  supplierName: string | null
}

interface CustomerActivitySummaryProps {
  bookings: CustomerActivityBooking[]
}

interface SupplierActivityRow {
  supplierName: string
  enquiries: number
  completed: number
  conversionRate: number
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

export function CustomerActivitySummary({ bookings }: CustomerActivitySummaryProps) {
  const summary = useMemo(() => {
    if (bookings.length === 0) {
      return null
    }

    const totalEnquiries = bookings.length
    const totalCompleted = bookings.filter((booking) => booking.stage === "closed").length
    const totalConversionRate = totalEnquiries > 0 ? (totalCompleted / totalEnquiries) * 100 : 0

    const bySupplier = new Map<string, { enquiries: number; completed: number }>()
    for (const booking of bookings) {
      const supplierName = booking.supplierName?.trim() || "Unknown Supplier"
      const existing = bySupplier.get(supplierName) ?? { enquiries: 0, completed: 0 }

      existing.enquiries += 1
      if (booking.stage === "closed") {
        existing.completed += 1
      }

      bySupplier.set(supplierName, existing)
    }

    const supplierRows: SupplierActivityRow[] = Array.from(bySupplier.entries())
      .map(([supplierName, counts]) => ({
        supplierName,
        enquiries: counts.enquiries,
        completed: counts.completed,
        conversionRate: counts.enquiries > 0 ? (counts.completed / counts.enquiries) * 100 : 0,
      }))
      .sort((a, b) => {
        if (b.enquiries !== a.enquiries) {
          return b.enquiries - a.enquiries
        }
        return a.supplierName.localeCompare(b.supplierName)
      })

    return {
      totalEnquiries,
      totalCompleted,
      totalConversionRate,
      supplierRows,
    }
  }, [bookings])

  if (!summary) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity Overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium leading-relaxed">
          <span className="text-base">{summary.totalEnquiries}</span> enquiries{" "}
          <span className="text-muted-foreground">·</span>{" "}
          <span className="text-base">{summary.totalCompleted}</span> completed{" "}
          <span className="text-muted-foreground">·</span>{" "}
          <span className="text-base">{formatPercent(summary.totalConversionRate)}</span> conversion
        </p>

        <div className="divide-y">
          {summary.supplierRows.map((row) => (
            <div key={row.supplierName} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <p className="min-w-0 text-sm font-medium leading-snug break-words">{row.supplierName}</p>
                <p className="text-xs leading-relaxed text-muted-foreground sm:text-right">
                  {row.enquiries} enquiries · {row.completed} completed · {formatPercent(row.conversionRate)}
                </p>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-muted-foreground/50 transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, row.conversionRate))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
