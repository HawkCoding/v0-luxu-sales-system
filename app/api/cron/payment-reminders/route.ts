import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { runPaymentRemindersWorker } from "@/lib/invoices/payment-reminders-worker"

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")

  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const supabase = await createServiceClient()
    const result = await runPaymentRemindersWorker(supabase)
    return NextResponse.json({ ok: true, result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Payment reminders worker failed" },
      { status: 500 },
    )
  }
}
