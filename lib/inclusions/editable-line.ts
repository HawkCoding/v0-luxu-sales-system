// The client-side editable shape of one supplier_inclusion_lines row. Shared between the section
// editor (components/supplier/inclusion-line-editor.tsx), the grouping helpers
// (lib/inclusions/sections.ts) and the supplier form's shared array (SupplierFormState.inclusionLines
// in components/supplier-detail-view.tsx) -- pulled out of the editor component so sections.ts can
// depend on the type without importing a "use client" component.

/** One row of a supplier's tagged inclusion/exclusion list. `id` is the persisted row id, or a
 * fresh uuid for an unsaved row. Every row carries its own resolved journey/rate tags --
 * lib/inclusions/filter-lines.ts does not inherit an item's tag from a preceding heading. */
export interface EditableInclusionLine {
  id: string
  list: "inclusions" | "exclusions"
  kind: "heading" | "item"
  text: string
  journeyTag: "short" | "long" | null
  rateTag: "international" | "resident" | null
}
