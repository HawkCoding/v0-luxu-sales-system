import { createServiceClient } from "@/lib/supabase/server"
import type { Json } from "@/lib/supabase/types"

export interface ErrorLogInput {
  severity: "Critical" | "Warning" | "Info"
  source: string
  message: string
  details?: Record<string, unknown> | null
  /** Diagnostic rows (e.g. slow-request traces) are born resolved so they don't inflate the unresolved badge. */
  resolved?: boolean
}

export async function logError(input: ErrorLogInput): Promise<void> {
  try {
    const supabase = createServiceClient()
    await supabase.from("error_logs").insert({
      severity: input.severity,
      source: input.source,
      message: input.message,
      details: (input.details ?? null) as Json | null,
      ...(input.resolved ? { resolved: true, resolved_at: new Date().toISOString() } : {}),
    })
  } catch (err) {
    console.error("[error-log] write failed", err, input)
  }
}
