import { NextResponse } from "next/server"
import { getStore } from "@/lib/store"

export async function GET() {
  const store = getStore()
  const enriched = store.jobs.map(job => {
    const customer = store.customers.find(c => c.id === job.customerId)
    const enquiry = store.enquiries.find(e => e.jobId === job.id)
    const payments = store.payments.filter(p => p.jobId === job.id)
    const quotes = store.quotes.filter(q => q.jobId === job.id)
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
    const quoteTotal = quotes.reduce((s, q) => Math.max(s, q.total), 0) || 1

    let paymentColor = "red"
    if (totalPaid < 0) paymentColor = "blue"
    else if (totalPaid >= quoteTotal && totalPaid > 0) paymentColor = "green"
    else if (totalPaid >= quoteTotal * 0.25) paymentColor = "yellow"
    else if (totalPaid > 0) paymentColor = "purple"

    return {
      ...job,
      customerName: customer ? `${customer.firstName} ${customer.lastName}` : "Unknown",
      direction: enquiry?.direction || "",
      departureDate: enquiry?.departureDate || "",
      paymentColor,
      totalPaid,
      quoteTotal,
    }
  })
  return NextResponse.json(enriched)
}
