import { getSupplierVocabulary } from "@/lib/types"
import type { SupplierKind } from "@/lib/types"

/**
 * Pre/post button wording for every anchored date picker (hotel stay dates, transfer pickup,
 * flight departure).
 *
 * F-P1-4: bare "Pre"/"Post" read as anchored to the booking's primary leg, but a leg anchors to
 * whatever dated leg the resolver actually picked -- a hotel add-on sitting between the train and
 * a transfer silently becomes the anchor. Naming that leg in the option itself, once it is known,
 * means the consultant sees what it resolved to before saving, not after reading a small caption.
 *
 * F-P2-7: with no anchor resolved yet there is no name to show, so the wording falls back to the
 * primary product's own vocabulary (Journey/Stay/Tour/...) rather than a hardcoded "train" -- a
 * hotel anchored to a tour reads "Pre-tour". `anchorKind` falls back to "train_operator" when
 * nothing has resolved at all; the picker still needs labels to render.
 */
export function anchorPresetLabels(
  legLabel: string | null | undefined,
  anchorKind: SupplierKind | null | undefined,
): { pre: string; post: string } {
  if (legLabel) {
    return { pre: `Before ${legLabel}`, post: `After ${legLabel}` }
  }
  const noun = getSupplierVocabulary(anchorKind ?? "train_operator").primaryProduct.bookingNoun.toLowerCase()
  return { pre: `Pre-${noun}`, post: `Post-${noun}` }
}
