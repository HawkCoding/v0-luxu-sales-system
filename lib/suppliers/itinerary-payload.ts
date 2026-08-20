/** The parts of an editable route that decide whether the save payload should carry it. */
export interface RouteRetentionInput {
  name: string
  suiteTypeId: string | null
  description: string
}

/**
 * A tour operator's itinerary has no name input -- the server derives the name from the tour type
 * it belongs to -- so it is kept whenever it is linked to a type or carries copy. Every other kind
 * still names its own route, where a nameless row is a blank the user added and abandoned.
 *
 * Routes left out of the payload are deleted server-side, so this must never drop a row the user
 * actually filled in.
 */
export function shouldSendRoute(route: RouteRetentionInput, isItineraryKind: boolean): boolean {
  if (!isItineraryKind) return route.name.trim().length > 0
  return (
    Boolean(route.suiteTypeId) ||
    route.name.trim().length > 0 ||
    route.description.trim().length > 0
  )
}
