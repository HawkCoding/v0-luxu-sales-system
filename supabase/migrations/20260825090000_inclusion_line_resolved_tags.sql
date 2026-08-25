-- Resolves each inclusion/exclusion item row's effective journey/rate tag by inheriting
-- from its nearest preceding heading on axes where the item itself has no tag, then
-- stamps that resolved value directly onto the row. This is the DB-side, one-time
-- version of the inheritance filterInclusionLines() used to apply at render time
-- (lib/inclusions/filter-lines.ts): inheritance now happens once here instead of on
-- every render, because the new section-based supplier editor
-- (lib/inclusions/sections.ts) groups rows by their own tags and expects every row to
-- already carry its final value -- a null tag from here on means "applies to any
-- journey/rate", not "look at the heading above me".
--
-- No column or row is added or removed, so this doesn't change what a supplier looks
-- like on read; it only changes what an already-tagged item resolves to once the
-- inheritance step is gone. Idempotent: the WHERE clause below only touches an item
-- whose stored tag is still null and would actually change, so a second run updates
-- zero rows (headings, the only input to the lookup, are never touched here).

WITH nearest_heading AS (
  SELECT
    item.id AS item_id,
    heading.journey_tag AS heading_journey_tag,
    heading.rate_tag AS heading_rate_tag
  FROM public.supplier_inclusion_lines item
  LEFT JOIN LATERAL (
    SELECT h.journey_tag, h.rate_tag
    FROM public.supplier_inclusion_lines h
    WHERE h.supplier_id = item.supplier_id
      AND h.list = item.list
      AND h.kind = 'heading'
      AND h.sort_order < item.sort_order
    ORDER BY h.sort_order DESC
    LIMIT 1
  ) heading ON true
  WHERE item.kind = 'item'
)
UPDATE public.supplier_inclusion_lines line
SET journey_tag = COALESCE(line.journey_tag, nearest_heading.heading_journey_tag),
    rate_tag = COALESCE(line.rate_tag, nearest_heading.heading_rate_tag)
FROM nearest_heading
WHERE line.id = nearest_heading.item_id
  AND (
    line.journey_tag IS NULL AND nearest_heading.heading_journey_tag IS NOT NULL
    OR line.rate_tag IS NULL AND nearest_heading.heading_rate_tag IS NOT NULL
  );
