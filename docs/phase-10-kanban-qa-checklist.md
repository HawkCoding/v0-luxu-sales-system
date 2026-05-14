# Phase 10 Kanban QA Checklist

Use this checklist against `http://localhost:3000/app/pipeline` with realistic seeded or local data.

## Editable Roles

- Sign in as an admin, manager, or consultant.
- Confirm the board shows draggable cards and the helper text says jobs can be dragged between stages.
- Drag a valid booking from one active stage to the next stage.
- Confirm the card moves, a success toast appears, and the booking detail page shows the new stage.
- Confirm pipeline history and audit history include the stage transition.

## Readonly Mode

- Sign in as a readonly user.
- Confirm the board loads in view-only mode.
- Confirm cards do not show drag handles and cannot be dragged.
- Attempt a direct stage mutation request if available through dev tools; confirm the API returns `403`.

## Blocked Transitions

- Try moving an email-imported enquiry with Needs Review still active into the active board.
- Confirm the transition modal blocks the move and links to the Enquiry tab.
- Try moving a booking with incomplete customer contact fields forward.
- Confirm the transition modal blocks the move and links to the Enquiry tab.
- Try moving a booking to Deposit Paid while `deposit_paid` is false.
- Confirm the payment gate appears and the booking does not move.
- Try moving a booking to Voucher Sent while invoice balance is not zero.
- Confirm the voucher balance gate appears and links to the Payments tab.
- Try moving a booking to Voucher Sent without a departure date or customer email.
- Confirm the voucher readiness gates appear and link to the Enquiry tab.

## Confirmable Transitions

- Move a quote-accepted booking to Deposit Invoice Sent when the deposit invoice artifact is missing.
- Confirm the modal offers the invoice creation confirmation.
- Check the confirmation and complete the move.
- Move a deposit-paid booking to Paid in Full when the final invoice confirmation is required.
- Confirm the modal requires the final-payment confirmation before enabling the move.

## Manager Override

- Sign in as a manager.
- Trigger a blocked transition.
- Confirm the manager override field appears.
- Confirm Force move is disabled until a reason is entered.
- Enter a reason and force the move.
- Confirm audit history records both the stage change and the override reason.

## Keyboard Access

- Tab through board filters, settings, card links, and audit download buttons.
- Confirm focus states are visible.
- Open a blocked transition modal and use keyboard controls to activate Fix, Cancel move, confirmation checkboxes, Confirm and move, and Force move where allowed.
- Confirm Escape and outside click do not accidentally dismiss an active gate modal.
