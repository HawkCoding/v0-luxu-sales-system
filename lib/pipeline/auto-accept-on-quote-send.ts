import type { PipelineStage } from "@/lib/types"
import { isAtOrPastStage } from "./validate-transition"

export interface AutoAcceptOnQuoteSendInput {
  kind: string | null | undefined
  /** The booking's stage once this send's own move (if any) has been applied. */
  stageAfterSend: PipelineStage
  reservationFormReceivedAt: string | null | undefined
  revisionResetAt: string | null | undefined
}

/**
 * A reservation form can come back before the quote goes out — reservation-purpose enquiries often
 * arrive with it already filled in. Ticking it at Enquiry used to be a dead end: the tick only moves
 * the booking to Quote Accepted when it happens at Quote Sent, so the quote send that followed left
 * the booking stuck at Quote Sent with the form ticked (LTT-26-0105, LTT-26-0136).
 *
 * The owner's call: sending the quote completes the acceptance when the form is already in.
 * A tick from before a quote revision is pre-revision history and does not count.
 */
export function shouldAutoAcceptOnQuoteSend(input: AutoAcceptOnQuoteSendInput): boolean {
  if (input.kind !== "quote") return false
  if (!input.reservationFormReceivedAt) return false
  if (input.revisionResetAt && input.reservationFormReceivedAt <= input.revisionResetAt) return false
  return (
    isAtOrPastStage(input.stageAfterSend, "quote_sent") && !isAtOrPastStage(input.stageAfterSend, "accepted")
  )
}
