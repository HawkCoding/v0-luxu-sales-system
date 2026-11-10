"use client"

import type { QuoteLineItem } from "@/lib/types"
import { formatMoney } from "@/lib/money"
import { calculateQuoteTotals, resolveLineTotal } from "@/lib/quotes/pricing-engine"
import { allocatePaxGroups, formatPaxGroupLine } from "@/lib/quotes/pax-group-pricing"
import type { PaxGroupView } from "@/lib/packages/pax-group-toggles"

interface PaxGroupPriceTableProps {
  /** Every line the quote will hold (the preview plus kept extras). */
  lines: QuoteLineItem[]
  groups: PaxGroupView[]
  /** "Suite", "Room", "Cabin". */
  noun: string
  currency: string
  /** rate_types.short_label by id, for the "(SA)" tags. */
  rateLabels: ReadonlyMap<string, string | null>
  /** A service is still unpriced: sentences show, figures read "—". */
  unpriced: boolean
  /** The selected services each group is not on, by group id. */
  notOnByGroup: ReadonlyMap<string, string[]>
}

function NotPriced() {
  return <span aria-label="Not priced">—</span>
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * Step 3's "Price per suite": the line each suite prints on the quote and invoice in place of
 * "Total per adult", with its subtotal, adding up to the whole booking (before discount and
 * commission). Unpriced services show "—", never R0,00.
 */
export function PaxGroupPriceTable({
  lines,
  groups,
  noun,
  currency,
  rateLabels,
  unpriced,
  notOnByGroup,
}: PaxGroupPriceTableProps) {
  const money = (amount: number) => formatMoney(amount, currency)
  const pricedLines = lines.map((line) => ({ ...line, total: resolveLineTotal(line) }))
  const target = calculateQuoteTotals(pricedLines).subtotal
  const allocation = unpriced
    ? null
    : allocatePaxGroups({
        lines: pricedLines.map((line) => ({ total: line.total, pricing_snapshot: line.pricingSnapshot ?? null })),
        target,
        rateLabels,
      })

  if (!unpriced && !allocation) {
    return (
      <p className="text-xs text-muted-foreground">
        Per-{noun.toLowerCase()} prices aren&apos;t available for these lines, so the quote shows Total per adult and
        child as before.
      </p>
    )
  }

  const rows = allocation
    ? allocation.lines.map((line) => ({
        groupId: line.groupId,
        position: line.position,
        sentence: formatPaxGroupLine(line, money),
        subtotal: line.subtotal as number | null,
      }))
    : groups.map((group) => ({
        groupId: group.id,
        position: group.position,
        sentence: `${group.label} - not priced yet`,
        subtotal: null as number | null,
      }))
  const adults = allocation?.adults ?? groups.reduce((sum, group) => sum + group.pax.adultCount, 0)
  const children = allocation?.children ?? groups.reduce((sum, group) => sum + group.pax.childCount, 0)
  const party = [count(adults, "Adult", "Adults"), children > 0 ? count(children, "Child", "Children") : null]
    .filter(Boolean)
    .join(" & ")

  return (
    <section className="space-y-2" aria-labelledby="pax-group-price-heading">
      <h3 id="pax-group-price-heading" className="text-sm font-medium">
        Price per {noun.toLowerCase()}
      </h3>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <caption className="sr-only">Price per {noun.toLowerCase()}</caption>
          {rows.map((row) => {
            const notOn = notOnByGroup.get(row.groupId) ?? []
            return (
              <tbody key={row.groupId} className="border-b">
                {/* One row per suite: the sentence the client reads already names the suite and
                    its guests. */}
                <tr>
                  <th scope="row" className="px-3 py-2 text-left text-sm font-normal whitespace-normal">
                    {row.sentence}
                  </th>
                  <td className="px-3 py-2 text-right align-top font-medium tabular-nums whitespace-nowrap">
                    {row.subtotal === null ? <NotPriced /> : money(row.subtotal)}
                  </td>
                </tr>
                {notOn.length > 0 ? (
                  <tr>
                    <td colSpan={2} className="px-3 pb-2 text-xs text-muted-foreground">
                      Not on: {notOn.join(", ")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            )
          })}
          <tfoot className="border-t font-medium">
            <tr>
              <th scope="row" className="px-3 py-2 text-left font-medium">
                Total for {party}
              </th>
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                {unpriced || !allocation ? <NotPriced /> : money(allocation.total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        These lines print on the quote and invoice exactly as shown. Figures include our commission and are before any agent commission or discount.
        {unpriced ? ` ${noun} prices show once every service is priced.` : ""}
      </p>
    </section>
  )
}
