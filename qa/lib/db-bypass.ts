import { createQaSupabase } from "./db"
import type { Database } from "../../lib/supabase/types"

export async function forceAdvanceStage(
  bookingId: string,
  toStage: string,
  reason: string,
): Promise<void> {
  const supabase = createQaSupabase()
  const updates: Database["public"]["Tables"]["bookings"]["Update"] = {
    stage: toStage as Database["public"]["Enums"]["pipeline_stage"],
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from("bookings")
    .update(updates)
    .eq("id", bookingId)

  if (error) {
    throw new Error(`Failed to force booking stage for ${reason}: ${error.message}`)
  }
}
