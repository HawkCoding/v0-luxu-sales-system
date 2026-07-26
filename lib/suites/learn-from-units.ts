import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { normalizeSuitePhrase } from "@/lib/suites/suite-phrase-tokens"
import { recordSuiteAliasCorrections, type SuiteAliasWrite } from "@/lib/suites/suite-alias-store"
import type { SuiteAxis } from "@/lib/suites/suite-vocabulary"

type Client = SupabaseClient<Database>

export interface UnitAxisChoice {
  suiteTypeId: string | null
  bedroomTypeId?: string | null
  bedroomLayoutId?: string | null
  bathroomTypeId?: string | null
}

/** A unit that actually has a suite type chosen — the only kind worth learning from. */
type ChosenUnit = UnitAxisChoice & { suiteTypeId: string }

/**
 * Records aliases from suite choices made on a booking's package selections, keyed on the raw
 * enquiry wording captured in `booking_suites.source_phrase`.
 *
 * Only learns where the choice actually *differs* from what the resolver produced at intake --
 * re-saving an unchanged selection is not a correction and must not overwrite a confirmed alias.
 * A phrase whose resolved suite type already matches is skipped entirely.
 */
export async function learnSuiteAliasesFromUnits(
  supabase: Client,
  bookingId: string,
  units: readonly UnitAxisChoice[],
  actorUserId: string | null,
): Promise<void> {
  const chosen = units.filter((unit): unit is ChosenUnit => Boolean(unit.suiteTypeId))
  if (chosen.length === 0) return

  // The wording only exists on booking_suites. Without it there is nothing to key an alias on.
  const { data: suites } = await supabase
    .from("booking_suites")
    .select("suite_number, suite_type_id, bedroom_type_id, bedroom_layout_id, bathroom_type_id, source_phrase")
    .eq("booking_id", bookingId)
    .order("suite_number", { ascending: true })

  const phrased = (suites ?? []).filter((suite) => Boolean(suite.source_phrase?.trim()))
  if (phrased.length === 0) return

  const { data: suiteTypes } = await supabase
    .from("suite_types")
    .select("id, supplier_id")
    .in("id", chosen.map((unit) => unit.suiteTypeId))

  const supplierBySuiteTypeId = new Map(
    (suiteTypes ?? []).map((suiteType) => [suiteType.id, suiteType.supplier_id]),
  )

  const writes: SuiteAliasWrite[] = []

  // Pair by position: the Nth unit on a leg corresponds to the Nth captured suite.
  for (const [index, unit] of chosen.entries()) {
    const suite = phrased[index]
    if (!suite) continue

    const phrase = normalizeSuitePhrase(suite.source_phrase ?? "")
    const supplierId = supplierBySuiteTypeId.get(unit.suiteTypeId)
    if (!phrase || !supplierId) continue

    const axisPairs: Array<{ axis: SuiteAxis; chosen: string | null; captured: string | null }> = [
      { axis: "suiteType", chosen: unit.suiteTypeId, captured: suite.suite_type_id },
      { axis: "bedroomType", chosen: unit.bedroomTypeId ?? null, captured: suite.bedroom_type_id },
      { axis: "bedroomLayout", chosen: unit.bedroomLayoutId ?? null, captured: suite.bedroom_layout_id },
      { axis: "bathroomType", chosen: unit.bathroomTypeId ?? null, captured: suite.bathroom_type_id },
    ]

    for (const { axis, chosen: chosenId, captured } of axisPairs) {
      // Learn when the consultant supplied a value the intake resolver did not already have
      // right -- i.e. it filled a gap or overrode a wrong guess.
      if (!chosenId || chosenId === captured) continue
      writes.push({ supplierId, phrase, axis, targetId: chosenId })
    }
  }

  if (writes.length > 0) {
    await recordSuiteAliasCorrections(supabase, writes, actorUserId)
  }
}
