/**
 * Messages shown on /login for a `?error=` query parameter.
 *
 * Kept out of the page component so the mapping is unit-testable and so the
 * sign-out route can validate the reasons it is allowed to redirect with.
 */

export const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  "account-link-mismatch":
    "This email is already linked to another account. Contact your administrator.",
  "account-inactive": "Your account has been deactivated. Contact your administrator.",
  unauthorized: "Your account is not set up for this app. Contact your administrator.",
  "session-expired": "You were signed out after a period of inactivity. Sign in again to continue.",
  "auth-failed": "Sign in failed. Please try again.",
}

export const DEFAULT_LOGIN_ERROR_MESSAGE = LOGIN_ERROR_MESSAGES["auth-failed"]

export function getLoginErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null
  return LOGIN_ERROR_MESSAGES[code] ?? DEFAULT_LOGIN_ERROR_MESSAGE
}
