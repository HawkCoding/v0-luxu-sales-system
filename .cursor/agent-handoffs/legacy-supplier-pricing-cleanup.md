# Handoff: Legacy supplier pricing UI note and dead code

Use this file when continuing work from a prior chat about removing the supplier-detail “legacy pricing tables” note and unused TypeScript.

## Goal

1. Remove the UI note that says legacy `supplier_pricing_options` / seasonal pricing tables remain in the database for later cleanup.
2. Remove dead application code that only existed to map those tables (no API routes currently load them).

## Background

- Pricing for suppliers in the app uses `rate_cards`, packages, routes, and suite types. The old tables `supplier_pricing_options`, `supplier_seasonal_periods`, and `supplier_seasonal_prices` may still exist in Postgres and in generated [`lib/supabase/types.ts`](../../lib/supabase/types.ts); that is schema reflection, not runtime usage.
- `mapSupplierDetail` in [`lib/suppliers.ts`](../../lib/suppliers.ts) does **not** include pricing options or seasonal rows—only unused mappers/types were left over.

## Scope (default)

- **In scope:** UI + [`lib/types.ts`](../../lib/types.ts) + [`lib/suppliers.ts`](../../lib/suppliers.ts).
- **Out of scope unless explicitly requested:** dropping DB tables or editing migrations; regenerating Supabase types after a migration.

## Current status (verify after checkout)

As of the last check, the following still existed and need removal if present:

| Item | Location |
|------|----------|
| Note block | [`components/supplier-detail-view.tsx`](../../components/supplier-detail-view.tsx) — dashed `div` with “Note: legacy supplier pricing…” before `<Separator />` above packages |
| Deprecated interfaces | [`lib/types.ts`](../../lib/types.ts) — `SupplierPricingOption`, `SupplierSeasonalPrice`, `SupplierSeasonalPeriod` |
| Dead mappers + row aliases | [`lib/suppliers.ts`](../../lib/suppliers.ts) — `mapSupplierPricingOption`, `mapSupplierSeasonalPrice`, `mapSupplierSeasonalPeriod` and related `Database[...]` row types |

Run a quick search:

```text
legacy supplier pricing
SupplierPricingOption
mapSupplierSeasonal
```

If all are gone, the handoff is complete.

## Implementation checklist

1. Delete the note `div` in `supplier-detail-view.tsx` (keep the following `<Separator />`).
2. Remove the three deprecated interfaces from `lib/types.ts`.
3. In `lib/suppliers.ts`, remove imports of those types, the three `*Row` aliases for legacy tables, and the three `mapSupplier*` functions.
4. Run `pnpm exec tsc --noEmit` and fix any stray imports.

## Optional follow-up (database)

Only after confirming no production data or external tools need the rows:

1. Add a migration that drops dependent tables in FK order (e.g. `supplier_seasonal_prices` first, then periods/options as required).
2. Regenerate [`lib/supabase/types.ts`](../../lib/supabase/types.ts) from Supabase.

## Related project docs

- Plan snapshot (if present): `.cursor/plans/remove_legacy_pricing_note_*.plan.md`

## For new agents

- Read this file first, then grep the strings above to see what remains.
- Do not commit secrets or `.env` files.
- Prefer minimal diffs: only the files listed unless the user expands scope.
