import { NextResponse } from "next/server"
import { getStore, nextId } from "@/lib/store"

export async function POST(req: Request) {
  const body = await req.json()
  const store = getStore()

  const payment = {
    id: nextId("p"),
    jobId: body.jobId,
    amount: body.amount,
    receivedAt: body.receivedAt || new Date().toISOString(),
    method: body.method,
    reference: body.reference,
    notes: body.notes || "",
  }
  store.payments.push(payment)

  store.auditLogs.push({
    id: nextId("a"),
    actor: body.actor || "consultant",
    entityType: "Payment",
    entityId: payment.id,
    action: "payment_recorded",
    afterJson: JSON.stringify(payment),
    createdAt: new Date().toISOString(),
  })

  return NextResponse.json(payment)
}
