"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { CheckCircle, Clock, XCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface LineItem {
  description: string
  supplierDescription?: string | null
  qty: number
  unitPrice: number
  total: number
}

interface QuoteData {
  quoteNumber: string
  bookingNumber: string
  customerName: string | null
  validUntil: string | null
  subtotal: number
  vat: number
  total: number
  lineItems: LineItem[]
}

type PageState =
  | { kind: "loading" }
  | { kind: "ready"; quote: QuoteData }
  | { kind: "invalid"; message: string }
  | { kind: "accepting"; quote: QuoteData }
  | { kind: "accepted"; quoteNumber: string; bookingRef: string }
  | { kind: "error"; message: string }

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(value: string | null): string {
  if (!value) return "To be confirmed"
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`))
}

export default function AcceptQuotePage() {
  const params = useParams()
  const token = typeof params.token === "string" ? params.token : ""
  const [state, setState] = useState<PageState>({ kind: "loading" })

  useEffect(() => {
    if (!token) {
      setState({ kind: "invalid", message: "Invalid link" })
      return
    }

    fetch(`/api/quotes/accept-public/${token}`)
      .then(async (res) => {
        const body = await res.json()
        if (res.status === 410) {
          setState({ kind: "invalid", message: "This link has already been used or has expired." })
        } else if (!res.ok) {
          setState({ kind: "invalid", message: body.error ?? "This link is not valid." })
        } else {
          setState({ kind: "ready", quote: body as QuoteData })
        }
      })
      .catch(() => {
        setState({ kind: "invalid", message: "Unable to load quote. Please try again." })
      })
  }, [token])

  async function handleAccept() {
    if (state.kind !== "ready") return
    const currentQuote = state.quote
    setState({ kind: "accepting", quote: currentQuote })
    try {
      const res = await fetch(`/api/quotes/accept-public/${token}`, { method: "POST" })
      const body = await res.json()
      if (!res.ok) {
        setState({ kind: "error", message: body.error ?? "Failed to accept quote." })
        return
      }
      setState({ kind: "accepted", quoteNumber: body.quoteNumber, bookingRef: body.bookingRef })
    } catch {
      setState({ kind: "error", message: "An unexpected error occurred. Please try again." })
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <p className="text-stone-500 text-sm tracking-widest uppercase">Luxus Travel & Tours</p>
          <h1 className="text-2xl font-semibold text-stone-900 mt-1">Luxury Rail Journeys</h1>
        </div>

        {state.kind === "loading" && (
          <div className="bg-white rounded-lg border border-stone-200 p-12 text-center">
            <Loader2 className="mx-auto mb-3 text-stone-400 animate-spin" size={32} />
            <p className="text-stone-500 text-sm">Loading your quote…</p>
          </div>
        )}

        {(state.kind === "invalid" || state.kind === "error") && (
          <div className="bg-white rounded-lg border border-red-200 p-10 text-center">
            <XCircle className="mx-auto mb-3 text-red-400" size={36} />
            <h2 className="text-lg font-semibold text-stone-800 mb-2">Link unavailable</h2>
            <p className="text-stone-500 text-sm">{state.message}</p>
            <p className="text-stone-400 text-xs mt-4">
              Contact your travel consultant if you need assistance.
            </p>
          </div>
        )}

        {state.kind === "accepted" && (
          <div className="bg-white rounded-lg border border-green-200 p-10 text-center">
            <CheckCircle className="mx-auto mb-3 text-green-500" size={36} />
            <h2 className="text-lg font-semibold text-stone-800 mb-2">Quote accepted</h2>
            <p className="text-stone-600 text-sm mb-1">
              Thank you for accepting quote{" "}
              <span className="font-medium">{state.quoteNumber}</span>.
            </p>
            <p className="text-stone-500 text-sm">
              Reference: <span className="font-medium">{state.bookingRef}</span>
            </p>
            <p className="text-stone-400 text-xs mt-4">
              Your consultant will be in touch shortly with deposit invoice details.
            </p>
          </div>
        )}

        {(state.kind === "ready" || state.kind === "accepting") && (
          <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
            <div className="bg-stone-800 px-6 py-5 flex items-center justify-between">
              <div>
                <p className="text-stone-400 text-xs uppercase tracking-wider mb-0.5">Quotation</p>
                <p className="text-white font-semibold text-lg">{state.quote.quoteNumber}</p>
              </div>
              <div className="text-right">
                <p className="text-stone-400 text-xs uppercase tracking-wider mb-0.5">Reference</p>
                <p className="text-white text-sm font-medium">{state.quote.bookingNumber}</p>
              </div>
            </div>

            <div className="px-6 pt-5 pb-4 border-b border-stone-100">
              <div className="flex items-start justify-between">
                <div>
                  {state.quote.customerName ? (
                    <p className="text-stone-800 font-medium">{state.quote.customerName}</p>
                  ) : null}
                  <p className="text-stone-500 text-sm">Dear valued traveller</p>
                </div>
                <div className="text-right flex items-center gap-1.5 text-sm text-stone-500">
                  <Clock size={14} />
                  <span>Valid until {formatDate(state.quote.validUntil)}</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200">
                    <th className="text-left text-xs text-stone-400 uppercase tracking-wider pb-2 font-medium">
                      Description
                    </th>
                    <th className="text-right text-xs text-stone-400 uppercase tracking-wider pb-2 font-medium w-12">
                      Qty
                    </th>
                    <th className="text-right text-xs text-stone-400 uppercase tracking-wider pb-2 font-medium w-28">
                      Unit price
                    </th>
                    <th className="text-right text-xs text-stone-400 uppercase tracking-wider pb-2 font-medium w-28">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {state.quote.lineItems.map((item, index) => (
                    <tr key={index} className="border-b border-stone-100">
                      <td className="py-3 pr-4 text-stone-700">
                        <span className="block">{item.description}</span>
                        {item.supplierDescription ? (
                          <span className="block text-xs text-stone-400 italic mt-0.5">
                            {item.supplierDescription}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 text-right text-stone-600">{item.qty}</td>
                      <td className="py-3 text-right text-stone-600">
                        {item.unitPrice === 0 ? "Included" : formatMoney(item.unitPrice)}
                      </td>
                      <td className="py-3 text-right text-stone-600">
                        {item.total === 0 ? "—" : formatMoney(item.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-4 pt-4 border-t border-stone-200 flex flex-col items-end gap-1 text-sm">
                <div className="flex gap-16">
                  <span className="text-stone-500">Subtotal</span>
                  <span className="text-stone-700 w-28 text-right">{formatMoney(state.quote.subtotal)}</span>
                </div>
                <div className="flex gap-16">
                  <span className="text-stone-500">VAT (15%)</span>
                  <span className="text-stone-700 w-28 text-right">{formatMoney(state.quote.vat)}</span>
                </div>
                <div className="flex gap-16 mt-2 pt-2 border-t border-stone-200">
                  <span className="font-semibold text-stone-900 text-base">Total</span>
                  <span className="font-semibold text-stone-900 text-base w-28 text-right">
                    {formatMoney(state.quote.total)}
                  </span>
                </div>
              </div>
            </div>

            <div className="px-6 py-5 bg-stone-50 border-t border-stone-200">
              <p className="text-xs text-stone-500 mb-4">
                By accepting this quotation you confirm that you agree to the services and pricing
                listed above. Your consultant will contact you with a deposit invoice to confirm the
                booking.
              </p>
              <Button
                className="w-full"
                onClick={handleAccept}
                disabled={state.kind === "accepting"}
              >
                {state.kind === "accepting" ? (
                  <>
                    <Loader2 className="mr-2 animate-spin" size={16} />
                    Accepting…
                  </>
                ) : (
                  "Accept this quotation"
                )}
              </Button>
            </div>
          </div>
        )}

        <p className="text-center text-stone-400 text-xs mt-6">
          Luxus Travel & Tours — Luxury Rail Journeys
        </p>
      </div>
    </div>
  )
}
