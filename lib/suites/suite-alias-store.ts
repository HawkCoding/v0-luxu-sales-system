import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { SuiteAxis } from "@/lib/suites/suite-vocabulary"
import { normalizeSuitePhrase } from "@/lib/suites/suite-phrase-tokens"

type ServiceClient = SupabaseClient<Database>

const AXIS_TO_DB_VALUE: Record<SuiteAxis, Database["public"]["Enums"]["suite_alias_axis"]> = {
  suiteType: "suite_type",
  bedroomType: "bedroom_type",
  bedroomLayout: "bedroom_layout",
  bathroomType: "bathroom_type",
}

const TARGET_COLUMN_BY_AXIS: Record<SuiteAxis, "suite_type_id" | "bedroom_type_id" | "bedroom_layout_id" | "bathroom_type_id"> = {
  suiteType: "suite_type_id",
  bedroomType: "bedroom_type_id",
  bedroomLayout: "bedroom_layout_id",
  bathroomType: "bathroom_type_id",
}

export interface SuiteAliasWrite {
  supplierId: string
  /** Raw wording -- normalized internally before it is stored/matched. */
  phrase: string
  axis: SuiteAxis
  targetId: string
}

/**
 * Records a consultant's correction as a learned alias. Upserts on (supplier_id, axis, phrase):
 * a new phrase starts `provisional`; an existing phrase pointed at a DIFFERENT target has that
 * target replaced and status reset to `provisional` (a re-correction, per decision 5); an
 * existing phrase already pointed at the SAME target is left untouched -- that's a re-confirm
 * via `promoteSuiteAliases`, not a demotion. Never throws -- a failed alias write must not fail
 * the enquiry it came from; callers should treat this as best-effort.
 */
export async function recordSuiteAliasCorrections(
  supabase: ServiceClient,
  writes: readonly SuiteAliasWrite[],
  actorUserId: string | null,
): Promise<void> {
  for (const write of writes) {
    const phrase = normalizeSuitePhrase(write.phrase)
    if (!phrase) continue

    const { data: existing } = await supabase
      .from("suite_vocab_aliases")
      .select("id, status, suite_type_id, bedroom_type_id, bedroom_layout_id, bathroom_type_id")
      .eq("supplier_id", write.supplierId)
      .eq("axis", AXIS_TO_DB_VALUE[write.axis])
      .eq("phrase", phrase)
      .maybeSingle()

    const targetColumn = TARGET_COLUMN_BY_AXIS[write.axis]
    const existingTargetId = existing ? (existing as Record<string, string | null>)[targetColumn] : null

    if (existing && existingTargetId === write.targetId) {
      // Same correction repeated -- not a demotion, leave status as-is.
      continue
    }

    const { error } = await supabase
      .from("suite_vocab_aliases")
      .upsert(
        {
          supplier_id: write.supplierId,
          axis: AXIS_TO_DB_VALUE[write.axis],
          phrase,
          suite_type_id: null,
          bedroom_type_id: null,
          bedroom_layout_id: null,
          bathroom_type_id: null,
          [targetColumn]: write.targetId,
          status: "provisional",
          confirmed_at: null,
          last_seen_at: new Date().toISOString(),
          hit_count: existing ? 1 : 0,
          created_by: actorUserId,
        },
        { onConflict: "supplier_id,axis,phrase" },
      )

    // Still never thrown -- the contract above stands -- but no longer invisible. A rejected write
    // here (RLS, constraint, anything) meant the alias loop learned nothing while every caller and
    // every mocked unit test reported success; the only way that surfaced was a QA run counting
    // rows. Logged so the next silent rejection shows up in the server log instead.
    if (error) {
      console.error("suite-alias-store:record", {
        supplierId: write.supplierId,
        axis: write.axis,
        phrase,
        message: error.message,
      })
    }
  }
}

/**
 * Promotes a phrase's alias for the given axes from `provisional` to `confirmed` -- called when
 * a resolution that came from an unconfirmed alias survives a save unedited. Idempotent: an
 * already-confirmed row just gets its hit_count bumped and last_seen_at touched.
 */
export async function promoteSuiteAliases(
  supabase: ServiceClient,
  supplierId: string,
  phrase: string,
  axes: readonly SuiteAxis[],
): Promise<void> {
  const normalizedPhrase = normalizeSuitePhrase(phrase)
  if (!normalizedPhrase || axes.length === 0) return

  const dbAxes = axes.map((axis) => AXIS_TO_DB_VALUE[axis])

  const { data: rows } = await supabase
    .from("suite_vocab_aliases")
    .select("id, status, hit_count")
    .eq("supplier_id", supplierId)
    .eq("phrase", normalizedPhrase)
    .in("axis", dbAxes)

  for (const row of rows ?? []) {
    const nowIso = new Date().toISOString()
    // Only stamp confirmed_at on the transition -- an already-confirmed alias keeps the date it
    // was first trusted, so the field stays a meaningful "learned since".
    const patch: Record<string, unknown> = {
      status: "confirmed",
      hit_count: (row.hit_count ?? 0) + 1,
      last_seen_at: nowIso,
    }
    if (row.status !== "confirmed") patch.confirmed_at = nowIso

    const { error } = await supabase.from("suite_vocab_aliases").update(patch).eq("id", row.id)
    if (error) {
      console.error("suite-alias-store:promote", { aliasId: row.id, message: error.message })
    }
  }
}
