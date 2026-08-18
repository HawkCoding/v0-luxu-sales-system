# Pipeline, stage gates and the lost path

This chapter is the reference the rest of the handbook points back to. Every time an
earlier chapter says "this moves the booking on", or "the system will not let you", the
rule it is describing is here.

## The nine stages

A booking sits in exactly one stage at a time. Eight of them are the forward path, in this
order; the ninth, **Lost**, is a side branch off it.

| # | Stage | What it means commercially |
|---|---|---|
| 1 | **Enquiry** | A request exists. Nothing has been priced or sent. |
| 2 | **Quote Sent** | A quote has gone to the client and is waiting on them. |
| 3 | **Quote Accepted** | The client has accepted and returned the signed reservation form. |
| 4 | **Deposit Invoice Sent** | The invoice is out; the money is owed but not in. |
| 5 | **Deposit Paid** | A payment has landed and the booking is confirmed. This is the stage you place supplier bookings from — there is no separate "booking made" stage. |
| 6 | **Paid in Full** | Nothing is outstanding. The voucher becomes available here. |
| 7 | **Voucher Sent** | Travel documents are with the client. The sale is Won. |
| 8 | **Closed** | Finished business. Set automatically seven days after the trip ends. |
| — | **Lost** | Cancelled or never converted. Off the board entirely. |

### Why the board only shows six

The **Status board** on the **Pipeline** page has six columns: Quote Sent, Quote Accepted,
Deposit Invoice Sent, Deposit Paid, Paid in Full, Voucher Sent. It is a board of *active*
work, so the three stages that are not active work are deliberately absent — **Enquiry**
(those live on the Enquiries queue), **Closed** and **Lost** (both finished).

A booking at Enquiry, Closed or Lost is not missing. It simply has no column, so it does
not appear on the board. Find it through search, the **All Items** tab, or the Bookings
list.

[[shot:08-pipeline-board|The Status board with bookings across the six active columns]]

> [!NOTE]
> The board also carries older stage names left over from an earlier version of the
> system. `quoted`, `form_done`, `payment_schedule` and `trip_active` are treated as
> Quote Sent, Quote Accepted, Deposit Invoice Sent and Voucher Sent respectively. You will
> never create one; you may see one on an old booking, and it will behave as its modern
> equivalent.

## Moving a booking

Three ways, all running the same gates against the same rules.

### Dragging on the board

Grab a card by anywhere on it and drop it in another column. If your role is view-only the
card will not lift, and the line above the board reads *"View-only mode"* instead of
*"Drag jobs between stages to update their status"*.

### The Move to select

Each card carries a stage select at its foot. Choose a column name to move that booking
there. This is the keyboard route — cards are not draggable from the keyboard, but the
select is reachable by tabbing, and it runs exactly the same checks.

Because both the board and the select offer any of the six columns, you can jump several
stages in one move. The system does not treat that as a shortcut: it applies **every gate
for every stage you cross**, and every effect of each of them. Skipping columns skips
nothing.

### Back and Next on the booking

[[shot:08-stage-stepper|The stage stepper and the Back and Next buttons on a booking]]

Open a booking and the top of the page shows the stage stepper — a tick per stage
achieved, greyed circles for the rest — with **Back** and **Next** buttons on the right.
These step exactly one stage at a time along the full eight-stage path, including Enquiry
and Closed, which the board cannot reach.

Two things behave differently here:

- **Next** into **Deposit Paid** opens the payment-confirmation send dialog first, then
  moves the booking once the confirmation is sent. It is disabled outright until a payment
  is recorded, with the tooltip *"Record a payment on the Payments tab to continue"*.
- **Next** on a booking flagged **Needs Review** is disabled entirely, with the line
  *"Resolve email review to advance"* beneath the buttons.

> [!WARNING]
> **Next** from **Closed** targets **Lost**, because Lost is the next entry in the
> underlying stage list. It will be stopped by the cancellation gates rather than
> completing, but do not use **Next** on a closed booking expecting nothing to happen.

## Backward moves are never blocked

No gate runs on a backward move. Drop a card from Paid in Full back into Quote Sent and it
goes, immediately, with no modal and no questions.

This is the safety valve. If a booking has been moved too far, move it back and then work
forward again through the gates. Nothing you have done is undone by moving back — the
invoice, the payments and the documents all stay exactly as they are; only the stage
changes.

> [!STOP]
> One exception, and it is a dead end: moving a booking **out of Closed** requires a
> reopen reason, and no screen in the system offers a field for one. The move fails with
> *"Reason required when reopening a closed booking"*. Ask a developer or an administrator
> if a closed booking genuinely has to be reopened.

## The gate table

When a forward move is stopped, the system names exactly what is missing. Every check it
can raise is below. The **Where to fix it** column names the tab on the booking; the modal
gives you a **Go to … tab** button for the ones marked with a tab name.

| Gate message | Fires when | Where to fix it, and what to do |
|---|---|---|
| *Customer record is missing …* | Any forward move, if the customer lacks first name, last name, email, phone or country. The message lists the missing ones. | **Enquiry** tab → **Customer Contact**. Open the customer record and fill in what it names. See Chapter 2. |
| *Imported enquiry needs review before it can advance.* | Any forward move on an email-imported booking still flagged **Needs Review**. | **Enquiry** tab. Check the imported fields against the original email, then clear the review flag. See Chapter 3. |
| *A sent quote is required before moving to Quote Sent.* | Crossing into **Quote Sent** with no quote in `sent` or `accepted` status. | **Quotes** tab. Send a quote — the stage follows from sending it, so you rarely move into this stage by hand. See Chapter 4. |
| *At least one sent or accepted quote is required before quote acceptance.* | Crossing into **Quote Accepted** without also crossing Quote Sent — i.e. a booking already at Quote Sent that never actually had a quote go out. | **Quotes** tab. Send a quote. |
| *The signed reservation form must be received before quote acceptance.* | Crossing into **Quote Accepted** with no reservation form recorded. | **Reservation** tab. Tick **Reservation form received** and send the acknowledgement. See Chapter 5. |
| *An invoice number is required before sending the deposit invoice.* | Crossing into **Deposit Invoice Sent** with the invoice number blank. | The **Invoice number** field in the booking header, not a tab — the modal has no link for this one. It prints on the invoice and doubles as the client's payment reference. See Chapter 6. |
| *A deposit invoice is required before requesting the deposit.* | Crossing into **Deposit Invoice Sent** with no invoice and no invoice PDF. | **Documents** tab → **Generate Invoice**. Or take **Fix and continue** in the modal and let the system create it. |
| *The deposit invoice is ready but hasn't been sent yet.* | The invoice exists but no invoice email has been sent. | **Emails Sent** tab, or the **Send deposit invoice** button in the modal. A manager can also move the booking on with a reason. |
| *A payment must be recorded before the deposit can be marked received.* | Crossing into **Deposit Paid** with no payment on the booking. | **Payments** tab. Record the payment, then send the payment confirmation. See Chapter 6. |
| *An invoice is required before marking the booking paid in full.* | Crossing into **Paid in Full** with no live invoice at all. | **Documents** tab. Generate the booking's invoice. This one is a confirmation, not a block — you can proceed past it. |
| *The payment confirmation hasn't gone out yet.* | Crossing into **Paid in Full** with no payment-confirmation or final-invoice email sent. | **Emails Sent** tab, or the **Send payment confirmation** button in the modal. A manager can also move the booking on with a reason. |
| *Confirm the booking is paid in full.* | Every move into **Paid in Full**. | Nothing to fix — tick the box in the modal. No amount is entered; the system zeroes the balance itself. |
| *A voucher PDF is required before moving to Voucher Sent.* | Crossing into **Voucher Sent** with no voucher PDF. | **Documents** tab → **Generate Voucher**. Or take **Fix and continue**. Note that supplier references must be complete first — see Chapter 7. |
| *The voucher email hasn't been created yet.* | Crossing into **Voucher Sent** with no voucher email drafted or sent. | **Emails Sent** tab, or send the voucher from the generate dialog. See Chapter 7. |
| *A cancellation reason is required before moving a booking to Lost.* | Any move to **Lost**. | Use **Cancel Booking** rather than a stage move — it asks for the reason properly. See below. |
| *Refund status and refund details are required for paid bookings.* | A move to **Lost** from Deposit Paid, Paid in Full, Voucher Sent or Closed. | Use **Cancel Booking**, which shows the refund block. See below. |

> [!NOTE]
> A full-payment invoice — one invoice covering the whole trip, used when a booking is
> made inside 60 days of departure — satisfies the deposit-invoice gates exactly as a
> deposit invoice does. You will not be asked for a second invoice later.

## Reading the modal

[[shot:08-gate-modal|The One more step first modal with a real blocker]]

The dialog is titled **One more step first** for a single item, **A few steps first** for
several, and **Confirm this stage move** when nothing is actually wrong and only
confirmations remain.

Each item carries a badge:

| Badge | Meaning |
|---|---|
| **Needs action** | A genuine blocker. The move will not happen until it is resolved. |
| **Not sent yet** | The document exists; only the email is outstanding. Nothing has gone wrong. |
| **Confirmation** | Not a failure at all. Tick it, or take the offered fix, and continue. |

Below each message is the fix instruction, and to the right, up to three controls:

- **Go to … tab** — closes the modal and opens the relevant tab on the booking. Present
  for every gate with an owning tab; absent for the invoice-number, paid-in-full tick, and
  cancellation gates, which have nowhere to send you.
- **Send deposit invoice** / **Send payment confirmation** — opens that send dialog
  without leaving the modal. Only on the booking screen; the board cannot mount those
  dialogs, so from the board you get the tab link alone.
- **Fix and continue** — see below.

At the foot: **Cancel move** always; **Confirm and move**, enabled only when every
confirmation is ticked and nothing is blocking; and, for managers, **Force move**.

### Fix and continue

[[shot:08-fix-and-continue|A modal offering Fix and continue]]

Two gates can be resolved by the system itself: the missing deposit invoice and the
missing voucher PDF. Both show a **Fix and continue** button. Click it and the line
changes to *"Will fix on confirm"* — nothing has happened yet. The document is created
when you click **Confirm and move**.

> [!WARNING]
> **Fix and continue** on the deposit invoice generates the invoice at the default deposit
> percentage and drafts the deposit-request email. It does not send anything. If this
> booking needs a non-standard deposit, do not use it — generate the invoice yourself from
> the **Documents** tab and set the percentage there.

You will only meet **Fix and continue** when moving from the board. From a booking's
**Next** button the app skips the modal and opens the generate dialog directly instead,
which is the fuller version of the same fix.

## When the modal does not appear

If the *only* thing outstanding is an email that has not gone out yet — the deposit
invoice, the payment confirmation or the voucher — the app does not report a blocked move
at all. It opens that send dialog straight away, already primed with the document.

Dragged on the board, this takes you to the booking screen, because the send dialogs only
exist there. It is not a glitch and you have not lost the stage move: send the email and
the booking advances by itself.

This only happens when the unsent email is the single blocker. Anything else outstanding —
a missing phone number, a missing invoice number — and you get the modal as normal.

## Manager override

[[shot:08-override|The manager override reason box in the modal]]

Managers and administrators see a **Manager override** box at the foot of the modal, with
a reason field and a red **Force move** button. It pushes the booking through regardless
of what is blocking it.

If you are a consultant you will not see it. What you do instead is ask: tell the manager
which booking, which stage you are trying to reach, and which gate is in the way — the
exact wording off the modal. Two gate messages say so outright: *"A manager can also move
this booking on with a reason."*

The reason is mandatory — **Force move** stays disabled until something is typed — and it
is written to the booking's audit trail alongside the stage change, under
`stage_change_override`, with the manager's name. Anyone can read it later on the **Audit
Log** tab. Write a reason that will still make sense in six months.

## What a successful move changes

A move is never only a change of stage. Each stage crossed stamps its own timestamp, and
several do more:

| Stage crossed | What else happens |
|---|---|
| **Quote Sent** | Quote-sent timestamp recorded. |
| **Quote Accepted** | The newest sent quote flips to `accepted`, and the booking's balance is recalculated off its total — so a revised quote's price takes effect immediately. |
| **Deposit Invoice Sent** | The balance is set from the accepted quote if it was not already set. |
| **Deposit Paid** | Deposit marked paid and the booking recorded as confirmed in the audit trail. |
| **Paid in Full** | The balance is zeroed. |
| **Voucher Sent** | Voucher documents marked sent, outcome set to **Won**, and the customer's first and last travel dates refreshed from their completed bookings. |
| **Closed** | Closed timestamp recorded. |

Because a multi-stage jump crosses every stage in between, it triggers every one of those
effects, in order.

> [!NOTE]
> Moving an email-imported booking off **Enquiry** discards the stored original email text.
> If you still need it, copy it out of the **Enquiry** tab before you advance the booking.

## The lost and cancelled branch

### The Outcome pill

Every booking header carries an outcome pill next to the stage badge: **Open**, **Won**,
**Lost** or **Cancelled**. It is a button — click it to open **Set Outcome**.

Outcome and stage are two different things. Outcome is the commercial result; stage is
where the work has got to. The system sets **Won** for you when the voucher goes out.

### Set Outcome

[[shot:08-set-outcome|The Set Outcome dialog with a reason chosen]]

1. Click the outcome pill.
2. Choose **Open**, **Won**, **Lost** or **Cancelled**.
3. For **Lost** or **Cancelled**, choose a **Reason** — the list is maintained in Settings
   and is filtered to reasons that apply to the outcome you picked. It is required.
4. If the reason is **Other**, a **Notes** field appears and must be filled in.
5. Click **Save**.

Set Outcome records the result only. It does not move the booking's stage and it does not
take it off the board.

### Cancel Booking

[[shot:08-refund-capture|Refund capture on the Cancel Booking dialog]]

**Cancel Booking**, the red button beside **Next**, is the proper way to end a booking. It
moves the stage to **Lost** and removes it from the board, and it collects everything the
Lost gates require in one dialog — which is why you should use it rather than dragging a
card at Lost.

The dialog asks for:

- **Reason for cancellation** — required. **Other** requires a description as well.
- **Additional notes** — optional, for any other reason.
- **Refund status** — **Refunded** or **Not refunded**. Only shown, and only required, if
  the booking has reached **Deposit Paid** or beyond, because only then is there money to
  account for.
- On **Refunded**: **Refund amount**, **Refunded at** and **Refund reference**, all three
  required. The amount is pre-filled with the system's suggestion and cannot exceed what
  the client has actually paid — over it, the field reads *"Cannot exceed the … already
  paid."* and the button stays disabled.

Confirm with the red **Cancel Booking** button, and you are returned to the pipeline.

> [!STOP]
> Cancelling is not a soft flag. The booking leaves the board and stops appearing in
> active work. It is reversible only by moving the stage back by hand — which will not
> clear the refund detail you captured.

> [!NOTE]
> The button is hidden on bookings already at **Lost** or **Closed**, and on roles without
> cancellation permission.
