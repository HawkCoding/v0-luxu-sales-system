import { NextResponse } from "next/server"
import { getStore, nextId, nextJobNumber } from "@/lib/store"

export async function POST(req: Request) {
  const body = await req.json()
  const store = getStore()

  // Customer matching
  const normalizedEmail = body.email?.toLowerCase().trim()
  let customer = store.customers.find(c => c.email.toLowerCase() === normalizedEmail)
  if (!customer) {
    customer = store.customers.find(c => c.phone === body.contactNumber)
  }
  const needsReview = !customer && store.customers.some(c =>
    c.phone === body.contactNumber || c.email.toLowerCase() === normalizedEmail
  )

  if (!customer) {
    customer = {
      id: nextId("c"),
      firstName: body.name,
      lastName: body.surname,
      email: body.email,
      phone: body.contactNumber,
      country: body.country,
      createdAt: new Date().toISOString(),
    }
    store.customers.push(customer)
  }

  const jobNum = nextJobNumber()
  const job = {
    id: nextId("j"),
    jobNumber: jobNum,
    ownerUser: "consultant",
    customerId: customer.id,
    purpose: body.purpose,
    source: (body.rawText ? "paste_import" : "web_form") as "web_form" | "paste_import",
    stage: "enquiry" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  store.jobs.push(job)

  const enquiry = {
    id: nextId("e"),
    jobId: job.id,
    source: job.source,
    ...body,
    createdAt: new Date().toISOString(),
  }
  store.enquiries.push(enquiry)

  store.auditLogs.push({
    id: nextId("a"),
    actor: body.rawText ? "consultant" : "system",
    entityType: "Enquiry",
    entityId: enquiry.id,
    action: body.rawText ? "created_from_paste_import" : "created_from_web_form",
    createdAt: new Date().toISOString(),
  })

  return NextResponse.json({ jobNumber: jobNum, jobId: job.id, needsReview })
}
