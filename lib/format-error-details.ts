/** The server's routes now build a plain-English message naming the failed field (or quote/
 *  booking line) themselves -- see lib/api/describe-zod-issue.ts -- so most 400s no longer need
 *  this. It's kept only for the couple of routes that still return a bare, generic message (e.g.
 *  jsonZodError's own default), where appending the raw field names is still better than nothing. */
const GENERIC_MESSAGES = new Set(["Invalid request payload", "Invalid request body"])

export function appendFieldDetails(message: string, payload: unknown): string {
  if (!GENERIC_MESSAGES.has(message)) return message
  if (!payload || typeof payload !== "object" || !("details" in payload)) return message
  const details = (payload as { details?: unknown }).details
  if (!details || typeof details !== "object") return message

  const fields = Object.entries(details as Record<string, unknown>)
    .filter(([, errors]) => Array.isArray(errors) && errors.length > 0)
    .map(([field]) => field)

  return fields.length > 0 ? `${message} (${fields.join(", ")})` : message
}
