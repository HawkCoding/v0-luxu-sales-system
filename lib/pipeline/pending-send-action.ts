import type { GateFailure } from "@/lib/pipeline/validate-transition"

/**
 * A gate failure that just means "the document exists, it hasn't been
 * emailed yet" — nothing actually failed, so the stage move should route
 * straight into the relevant preview-and-send dialog instead of showing a
 * blocked-move message.
 */
export type PendingSendAction = "deposit_invoice" | "payment_confirmation" | "voucher"

const PENDING_SEND_GATE_ACTIONS: Record<string, PendingSendAction> = {
  invoice_correspondence: "deposit_invoice",
  final_invoice_correspondence: "payment_confirmation",
  voucher_correspondence: "voucher",
}

/**
 * Returns the send action to run instead of showing the blocked-move modal,
 * or null if the modal should still be shown.
 *
 * Only fires when the pending-send gate is the *sole* blocking failure —
 * any other hard blocker (missing customer fields, missing invoice number,
 * unresolved email import, etc.) still needs the modal, since silently
 * opening a send dialog that can't itself satisfy those gates would be
 * worse than the current message. Co-occurring `confirm`-severity failures
 * (manual ticks) don't disqualify — the send path satisfies the stage
 * regardless.
 */
export function resolvePendingSendAction(failures: GateFailure[]): PendingSendAction | null {
  const blockingFailures = failures.filter((failure) => failure.severity === "block")
  if (blockingFailures.length !== 1) return null

  return PENDING_SEND_GATE_ACTIONS[blockingFailures[0].gateId] ?? null
}
