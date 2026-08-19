import type { SupabaseClient } from "@supabase/supabase-js"
import { createServiceClient } from "@/lib/supabase/server"
import type { Database } from "@/lib/supabase/types"

/**
 * Email test mode lets the whole pipeline be driven end to end against real
 * data while guaranteeing no message reaches a customer: every recipient is
 * replaced with a controlled test inbox and the subject is prefixed with the
 * address the email would really have gone to.
 *
 * It is deliberately enforced inside `sendEmail` (the single choke point every
 * send passes through) rather than at each call site, so a new send path can
 * never accidentally bypass it.
 */
export const EMAIL_TEST_MODE_SETTING_KEYS = {
  enabled: "email_test_mode_enabled",
  recipient: "email_test_mode_recipient",
} as const

export interface EmailTestModeSettings {
  enabled: boolean
  /** Comma-separated list is supported; empty when nothing is configured. */
  recipients: string[]
}

/** Test mode is on but unusable — refuse to send rather than mail the customer. */
export class EmailTestModeError extends Error {}

export const EMAIL_TEST_MODE_NO_RECIPIENT_ERROR =
  "Email test mode is on but no test inbox is configured. Set a test recipient in Settings, or turn test mode off."

export const EMAIL_TEST_MODE_LOOKUP_ERROR =
  "Email test mode could not be checked, so the email was not sent. Try again in a moment."

type SettingsClient = Pick<SupabaseClient<Database>, "from">

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function parseTestRecipients(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/[,;]/)
    .map((value) => value.trim())
    .filter((value) => EMAIL_PATTERN.test(value))
}

/**
 * Reads the test-mode switch. Fails closed: a lookup error throws rather than
 * returning "disabled", because a transient database problem must never be the
 * reason a live customer receives a demo email.
 */
export async function getEmailTestMode(
  client?: SettingsClient,
): Promise<EmailTestModeSettings> {
  const supabase = client ?? createServiceClient()

  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", [EMAIL_TEST_MODE_SETTING_KEYS.enabled, EMAIL_TEST_MODE_SETTING_KEYS.recipient])

  if (error) {
    throw new EmailTestModeError(EMAIL_TEST_MODE_LOOKUP_ERROR)
  }

  const map = Object.fromEntries((data ?? []).map((row) => [row.key, row.value]))

  return {
    enabled: map[EMAIL_TEST_MODE_SETTING_KEYS.enabled] === "true",
    recipients: parseTestRecipients(map[EMAIL_TEST_MODE_SETTING_KEYS.recipient]),
  }
}

/** `[TEST -> a@b.com] Original subject`, so a redirected email is unmistakable. */
export function buildTestModeSubject(subject: string, intendedRecipients: string[]): string {
  const shown = intendedRecipients.slice(0, 2).join(", ")
  const overflow = intendedRecipients.length - 2
  const target = intendedRecipients.length === 0
    ? "no recipient"
    : overflow > 0
      ? `${shown} +${overflow} more`
      : shown

  return `[TEST -> ${target}] ${subject}`
}

export interface TestModeRedirect {
  recipients: string[]
  subject: string
  intendedRecipients: string[]
}

/**
 * Applies the redirect to one send. Returns `null` when test mode is off, so
 * the caller keeps its normal path untouched.
 *
 * @throws EmailTestModeError when test mode is on without a usable test inbox.
 */
export function applyEmailTestMode(
  settings: EmailTestModeSettings,
  intendedRecipients: string[],
  subject: string,
): TestModeRedirect | null {
  if (!settings.enabled) return null

  if (settings.recipients.length === 0) {
    throw new EmailTestModeError(EMAIL_TEST_MODE_NO_RECIPIENT_ERROR)
  }

  return {
    recipients: settings.recipients,
    subject: buildTestModeSubject(subject, intendedRecipients),
    intendedRecipients,
  }
}
