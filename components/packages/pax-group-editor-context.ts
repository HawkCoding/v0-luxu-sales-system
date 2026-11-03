import type { PaxGroupProblem, PaxGroupView } from "@/lib/packages/pax-group-toggles"

/**
 * What a leg editor needs to render its pax-group additions (the card heading row, the "For"
 * control, the per-suite filter, Suite name, Duplicate/Remove). Passed only in group mode -- a leg
 * editor without it renders exactly what it rendered before pax groups existed.
 */
export interface PaxGroupEditorContext {
  /** The booking's groups in position order. */
  groups: PaxGroupView[]
  /** The suite whose tab is active; null = "All suites". */
  activeGroupId: string | null
  /** The booking's primary leg, whose units ARE the groups. */
  primaryLegId: string | null
  /** The primary product's unit noun, capitalised: "Suite", "Room", "Cabin". */
  noun: string
  /** What needs attention on each group (lib/packages/pax-group-toggles.ts groupProblems). */
  problems: ReadonlyMap<string, PaxGroupProblem | null>
  onLabelChange: (groupId: string, label: string | null) => void
  onDuplicateGroup: (groupId: string) => void
  /** Asks to remove a group; the dialog confirms first. */
  onRemoveGroup: (groupId: string) => void
  /** "Remove from Suite 2" on a non-primary leg in the per-suite view. */
  onRemoveFromLeg: (legId: string, groupId: string) => void
}

/** Element id of a leg's "Remove from {Suite} {n}" button, so focus can return to it. */
export function removeFromGroupButtonId(legId: string): string {
  return `remove-from-group-${legId}`
}

/** Element id of a folded leg's "Add back" button. */
export function addBackButtonId(legId: string): string {
  return `add-back-${legId}`
}

/** Element id of a group's tab trigger. */
export function groupTabId(groupId: string | null): string {
  return `pax-group-tab-${groupId ?? "all"}`
}

/** Element id of the shared panel every group tab controls. */
export const PAX_GROUP_PANEL_ID = "pax-group-panel"
