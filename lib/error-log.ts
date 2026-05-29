import { createServiceClient } from "@/lib/supabase/server"
import type { Json } from "@/lib/supabase/types"

export interface ErrorLogInput {
  severity: "Critical" | "Warning" | "Info"
  source: string
  message: string
  details?: Record<string, unknown> | null
}

export async function logError(input: ErrorLogInput): Promise<void> {
  try {
    const supabase = createServiceClient()
    await supabase.from("error_logs").insert({
      severity: input.severity,
      source: input.source,
      message: input.message,
      details: (input.details ?? null) as Json | null,
    })
  } catch (err) {
    console.error("[error-log] write failed", err, input)
  }
}
