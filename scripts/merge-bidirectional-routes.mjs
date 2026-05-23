#!/usr/bin/env node
/**
 * Merge inverse route pairs (A->B / B->A) into a single round_trip route per
 * supplier. Re-points rate_cards and package_leg_routes at the survivor, then
 * deletes the duplicate.
 *
 * Dry run by default. Pass --apply to actually mutate.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/merge-bidirectional-routes.mjs [--apply]
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const APPLY = process.argv.includes("--apply")

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function fetchRoutes() {
  const { data, error } = await supabase
    .from("routes")
    .select("id, supplier_id, name, origin_location_id, destination_location_id, direction_mode, created_at")
    .order("created_at", { ascending: true })
  if (error) throw error
  return data ?? []
}

function findPairs(routes) {
  const bySupplier = new Map()
  for (const route of routes) {
    if (!route.origin_location_id || !route.destination_location_id) continue
    if (route.direction_mode !== "one_way") continue
    if (!bySupplier.has(route.supplier_id)) bySupplier.set(route.supplier_id, [])
    bySupplier.get(route.supplier_id).push(route)
  }

  const pairs = []
  const claimed = new Set()
  for (const [, group] of bySupplier) {
    for (const route of group) {
      if (claimed.has(route.id)) continue
      const inverse = group.find(
        (candidate) =>
          candidate.id !== route.id &&
          !claimed.has(candidate.id) &&
          candidate.origin_location_id === route.destination_location_id &&
          candidate.destination_location_id === route.origin_location_id,
      )
      if (inverse) {
        // Survivor = older (already sorted by created_at asc)
        pairs.push({ survivor: route, duplicate: inverse })
        claimed.add(route.id)
        claimed.add(inverse.id)
      }
    }
  }
  return pairs
}

async function repoint(table, fromId, toId, column = "route_id") {
  const { error, count } = await supabase
    .from(table)
    .update({ [column]: toId }, { count: "exact" })
    .eq(column, fromId)
  if (error) throw new Error(`Failed to repoint ${table}.${column}: ${error.message}`)
  return count ?? 0
}

async function main() {
  const routes = await fetchRoutes()
  const pairs = findPairs(routes)

  if (pairs.length === 0) {
    console.log("No inverse pairs found. Nothing to do.")
    return
  }

  console.log(`Found ${pairs.length} inverse route pair(s):`)
  for (const { survivor, duplicate } of pairs) {
    console.log(
      `  KEEP    ${survivor.id}  ${survivor.name}\n  MERGE   ${duplicate.id}  ${duplicate.name}\n`,
    )
  }

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to mutate.")
    return
  }

  for (const { survivor, duplicate } of pairs) {
    const rateCardsMoved = await repoint("rate_cards", duplicate.id, survivor.id)
    let pkgLegsMoved = 0
    try {
      pkgLegsMoved = await repoint("package_leg_routes", duplicate.id, survivor.id)
    } catch (err) {
      console.warn(`(skipping package_leg_routes update for ${duplicate.id}: ${err.message})`)
    }

    const { error: updateError } = await supabase
      .from("routes")
      .update({ direction_mode: "round_trip" })
      .eq("id", survivor.id)
    if (updateError) throw updateError

    const { error: deleteError } = await supabase
      .from("routes")
      .delete()
      .eq("id", duplicate.id)
    if (deleteError) throw deleteError

    console.log(
      `Merged ${duplicate.id} -> ${survivor.id}  (rate_cards: ${rateCardsMoved}, package_leg_routes: ${pkgLegsMoved}, marked round_trip)`,
    )
  }
  console.log("Done.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
