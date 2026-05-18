import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, Json } from "@/lib/supabase/types"

type AuditLogInsert = Database["public"]["Tables"]["audit_logs"]["Insert"]

export interface AuditWriteInput {
  actor: string
  actorUserId?: string | null
  entityType: string
  entityId: string
  action: string
  before?: Json | null
  after?: Json | null
  meta?: Json | null
}

export async function writeAuditLog(
  supabase: SupabaseClient<Database>,
  input: AuditWriteInput,
): Promise<{ error: unknown }> {
  const payload: AuditLogInsert = {
    actor: input.actor,
    actor_user_id: input.actorUserId ?? null,
    entity_type: input.entityType,
    entity_id: input.entityId,
    action: input.action,
    before_json: input.before ?? null,
    after_json: input.after ?? null,
    meta_json: input.meta ?? null,
  }

  const { error } = await supabase.from("audit_logs").insert(payload)
  return { error }
}

export function settingAuditMeta(settingKey: string): Record<string, Json> {
  return { setting_key: settingKey }
}
