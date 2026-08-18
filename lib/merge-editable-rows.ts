/**
 * Reconciles a server-refetched list of rows with a list of rows currently being edited locally,
 * without discarding either. Two things can otherwise be lost by a naive `setRows(serverRows)` on
 * every SWR/realtime revalidation:
 *
 * - A row the user is mid-typing into gets silently reset to the server's (older) value.
 * - A row added locally and not yet saved (its id was never on the server) disappears entirely,
 *   because it's simply absent from the fresh server list.
 *
 * `editingIds` marks which rows are currently being edited; anything else always takes the fresh
 * server value. Local-only rows (their id isn't in `serverRows` at all) are always kept regardless
 * of `editingIds`, since dropping an unsaved row is never correct.
 */
export function mergeEditableRows<T extends { id: string }>(
  localRows: T[],
  serverRows: T[],
  editingIds: ReadonlySet<string>,
): T[] {
  const localById = new Map(localRows.map((row) => [row.id, row]))
  const serverIds = new Set(serverRows.map((row) => row.id))

  const merged = serverRows.map((row) => (editingIds.has(row.id) ? (localById.get(row.id) ?? row) : row))
  const localOnly = localRows.filter((row) => !serverIds.has(row.id))

  return [...merged, ...localOnly]
}
