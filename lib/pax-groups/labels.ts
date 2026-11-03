import type { BookingPaxGroup, PaxGroupMeta, SupplierSuiteType } from "@/lib/types"

/** The primary-service unit a pax group is anchored to, as far as its name is concerned. */
export interface PaxGroupPrimaryUnit {
  /** Exactly [groupId] on a booking in group mode. */
  paxGroupIds: readonly string[]
  suiteTypeId: string | null
  bedroomTypeId: string | null
}

/** Display names for the primary unit's suite type and bedroom type. Null = unknown. */
export interface PaxGroupNameLookup {
  suiteTypeName(id: string): string | null
  bedroomTypeName(id: string): string | null
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ""
  return trimmed.length > 0 ? trimmed : null
}

/**
 * The automatic name of a pax group: "<bedroom type> <suite type> <position>", e.g. "Twin Deluxe
 * Suite 2", or "Deluxe Suite 2" with no bedroom type picked. Falls back to "Suite <position>" when
 * the suite type's name is unknown (a unit with no type yet).
 */
export function autoPaxGroupLabel(
  position: number,
  primaryUnit: Pick<PaxGroupPrimaryUnit, "suiteTypeId" | "bedroomTypeId"> | null | undefined,
  names: PaxGroupNameLookup,
): string {
  const suiteTypeName = primaryUnit?.suiteTypeId ? clean(names.suiteTypeName(primaryUnit.suiteTypeId)) : null
  if (!suiteTypeName) return `Suite ${position}`
  const bedroomTypeName = primaryUnit?.bedroomTypeId ? clean(names.bedroomTypeName(primaryUnit.bedroomTypeId)) : null
  return [bedroomTypeName, suiteTypeName, String(position)]
    .filter((part): part is string => part !== null)
    .join(" ")
}

/** A group's printed name: the consultant's typed label, else the automatic one. */
export function paxGroupLabel(
  group: Pick<BookingPaxGroup, "position" | "label">,
  primaryUnit: Pick<PaxGroupPrimaryUnit, "suiteTypeId" | "bedroomTypeId"> | null | undefined,
  names: PaxGroupNameLookup,
): string {
  return clean(group.label) ?? autoPaxGroupLabel(group.position, primaryUnit, names)
}

/**
 * The booking's pax groups as the pricing engine stamps them (PricingSnapshot.paxGroups), in
 * position order, each named by its typed label or its primary unit (the unit whose paxGroupIds
 * holds the group's id). A group whose primary unit can't be found is still named, "Suite <n>".
 */
export function resolvePaxGroupMetas(
  groups: readonly Pick<BookingPaxGroup, "id" | "position" | "label">[],
  primaryUnits: readonly PaxGroupPrimaryUnit[],
  names: PaxGroupNameLookup,
): PaxGroupMeta[] {
  return groups
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((group) => ({
      id: group.id,
      position: group.position,
      label: paxGroupLabel(
        group,
        primaryUnits.find((unit) => unit.paxGroupIds.includes(group.id)),
        names,
      ),
    }))
}

/**
 * Suite-type and bedroom-type names off a leg's suite types (a PackageDetail leg after
 * applySuiteVariantVocab, whose suite types carry bedroomTypeIds/bedroomTypes side by side).
 */
export function paxGroupNamesFromSuiteTypes(
  suiteTypes: readonly Pick<SupplierSuiteType, "id" | "name" | "bedroomTypeIds" | "bedroomTypes">[],
): PaxGroupNameLookup {
  const suiteTypeNameById = new Map<string, string>()
  const bedroomTypeNameById = new Map<string, string>()
  for (const suiteType of suiteTypes) {
    suiteTypeNameById.set(suiteType.id, suiteType.name)
    const ids = suiteType.bedroomTypeIds ?? []
    const labels = suiteType.bedroomTypes ?? []
    ids.forEach((id, index) => {
      const name = labels[index]
      if (name && !bedroomTypeNameById.has(id)) bedroomTypeNameById.set(id, name)
    })
  }
  return {
    suiteTypeName: (id) => suiteTypeNameById.get(id) ?? null,
    bedroomTypeName: (id) => bedroomTypeNameById.get(id) ?? null,
  }
}
