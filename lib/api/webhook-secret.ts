import { createHash, timingSafeEqual } from "node:crypto"

export function secretsMatch(provided: string, expected: string): boolean {
  const providedHash = createHash("sha256").update(provided).digest()
  const expectedHash = createHash("sha256").update(expected).digest()
  return timingSafeEqual(providedHash, expectedHash)
}

// True only when the env secret is configured AND the request carries a matching
// x-webhook-secret header. A missing env secret always fails closed.
export function isAuthorizedWebhookRequest(request: Request, expectedSecret: string | undefined): boolean {
  const providedSecret = request.headers.get("x-webhook-secret")
  return Boolean(expectedSecret && providedSecret && secretsMatch(providedSecret, expectedSecret))
}
