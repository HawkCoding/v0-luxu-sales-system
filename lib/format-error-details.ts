/** A generic validation error ("Invalid request payload") is useless on its own — the server
 *  attaches which field failed as `details` (Zod's flattened fieldErrors, see
 *  lib/api/responses.ts jsonZodError). Append the field names so the message actually points at
 *  something the user can fix, instead of a client silently dropping `details` on the floor. */
export function appendFieldDetails(message: string, payload: unknown): string {
  if (!payload || typeof payload !== "object" || !("details" in payload)) return message
  const details = (payload as { details?: unknown }).details
  if (!details || typeof details !== "object") return message

  const fields = Object.entries(details as Record<string, unknown>)
    .filter(([, errors]) => Array.isArray(errors) && errors.length > 0)
    .map(([field]) => field)

  return fields.length > 0 ? `${message} (${fields.join(", ")})` : message
}
