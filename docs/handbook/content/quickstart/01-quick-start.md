# Quick start

This is the short version: one booking, from the moment an enquiry lands to the moment the
travel voucher is with the client. Each step is one screen, one action and a line or two
about what it changes. Work through it once in order and you will have run a whole booking.

The Consultant Handbook covers everything this guide leaves out.

## 1. Sign in

[[shot:qs-login|The sign-in screen]]

1. Enter your email address and password.
2. Click **Sign in with email**.

If the details are wrong the screen says *"Invalid email or password"* without telling you
which of the two it was. **Forgot password?** sends you a reset link.

## 2. Find your way around

[[shot:qs-dashboard|The dashboard, and the sidebar you will use all day]]

The sidebar on the left is the same on every screen. **Enquiries** is where new work arrives
and carries a badge with the number waiting. **Pipeline** is the board of active bookings,
**Bookings** is the same work as a list, and **Documents** and **Emails Sent** are the record
of what has been generated and what has gone out.

Across the top: a **Search customers...** box, a light/dark toggle, your name and role, and
**Logout**.

The dashboard itself is the landing screen. The tiles count open bookings and the money
stages; **Jobs by Stage** counts every booking by where it has got to, and **Recent Jobs**
lists the five most recent — click any row to open it.

## 3. Pick up an enquiry that is already in the list

[[shot:qs-enquiries-list|The Enquiries queue with one enquiry waiting]]

1. Click **Enquiries** in the sidebar.
2. Read the row: booking number, customer, direction, departure date and guest count.
3. Click **Open Job**.

The chips above the list narrow it — **Needs Review**, **Unassigned**, **My Enquiries** and
so on. **Reject Import** deletes an enquiry that is not real; use it only for junk.

[[shot:qs-enquiry-tab|The booking, open on its Enquiry tab]]

Every booking opens on the same frame. The booking number, the stage badge and the
**Back**, **Next** and **Cancel Booking** buttons sit at the top, then the stage stepper
showing how far the booking has got, then the tabs.

**Requested services** is the panel to read first. It lists what has actually been built on
the booking, what the customer asked for that nothing accounts for yet, and anything that
would stop a quote going out. When it is ready, **Start Quote** is the button that moves you
on.

[[shot:qs-enquiry-details|Journey and trip detail further down the Enquiry tab]]

Scroll past it for the trip itself: direction, departure date, traveller counts, supplier,
hotel and any extra services the customer asked for. **Edit** on **Journey Details** changes
the dates and counts; everything else is changed in Build Booking.

## 4. Start an enquiry from scratch

[[shot:qs-new-enquiry|The New Enquiry dialog, on the Manual Entry tab]]

1. On **Enquiries**, click **New Enquiry**.
2. Either paste the customer's email on **Paste Email** and click **Review & Import**, or
   pick **Manual Entry**, choose how the enquiry reached us, and click **Start Manual
   Enquiry**.

Both routes land on the same review screen. Pasting fills it in for you; manual entry starts
blank.

[[shot:qs-enquiry-draft|Review Imported Draft, with the required-field counter top right]]

Fill in the customer, the trip and the guests. The counter at the top right reads how many
required fields are done, and **Validation Status** at the bottom names the ones still
missing — supplier, route, departure date, adults and suites are the usual five.

Click **Save & Open** to save and go straight to the new booking, or **Save Draft** to save
and stay on the list.

## 5. Build Booking, step 1 — choose the services

[[shot:qs-build-step-1|Build this booking's services, with a train and a hotel added]]

1. Pick a category — Train, Hotel, Transfers, Vehicle Rental, Tours or Airlines.
2. Pick the supplier, then click **Add service**.
3. Repeat for everything the customer is buying, then click **Next**.

Transfers, rentals, tours and flights are never added for you. If the customer asked for
one, add it here.

## 6. Build Booking, step 2 — fill in the detail

[[shot:qs-build-step-2|Configure services — route, date, suite and commission]]

Each service gets its own panel. On the train: set the **Route**, the **Service date**, the
**Suite Type** and how the travellers split across the suites. The trip dates at the top are
worked out from the service dates — you never type them.

**Commission** at the bottom is required. Choose **% Markup**, **Per Person** or **Fixed
Total** and enter a value; enter `0` if none applies. **Next** stays disabled until it is
set.

## 7. Build Booking, step 3 — check and apply

[[shot:qs-build-step-3|Confirm replacement, showing exactly what will be written]]

This step shows every line that is about to be written to the quote, with its quantity, unit
price and total. Nothing is saved until you press the button.

Click **Apply to quote** if the quote is empty, or **Replace & apply** if it already has
lines. If a service could not be priced, a red panel names it and both buttons stay
disabled — go **Back** and finish configuring it.

## 8. Send the quote

[[shot:qs-quote-card|The priced quote on the Quotes tab]]

The **Quotes** tab now carries the priced quote. Check the lines and the total. **Rounding**
adds or subtracts a flat amount, folded into the commission line so the client never sees
the split; **Agent Commission** is a discount that *is* shown to the client.

[[shot:qs-preview-send-quote|Preview & Send Quote — compose on the left, the live email on the right]]

1. Click **Preview & Send** at the top of the tab.
2. Check the subject and the body. Edits here apply to this one email only.
3. Click **Send**.

The quote PDF is attached for you. A toast offers **Undo** for about five seconds — after
that the email is gone.

> [!WARNING]
> Sending the quote moves the booking to **Quote Sent**. Sending is the action that moves
> the stage, not anything you do on the pipeline board.

## 9. The client accepts

[[shot:qs-form-received|The Reservation tab, with the form tick at the top]]

1. Open the **Reservation** tab.
2. Tick **Reservation form received**.
3. The acknowledgement email opens straight away — review it and click **Send**.

The tick and the stage move happen together off that send. Cancel the email and the box
stays unticked and the booking stays at Quote Sent.

[[shot:qs-guest-roster|The guest roster on the Reservation tab]]

Then fill in the guests. Every traveller needs a title, first name, surname and an
**ID / Passport number**, and **Save guests** writes them to the booking.

> [!WARNING]
> Those three fields are a hard gate. Without a name, surname and ID or passport number for
> every traveller, the invoice will not generate.

## 10. Raise the deposit invoice

[[shot:qs-invoice-number|The Invoice number field on the booking header]]

Type the **Invoice number** into the field on the booking header first. You choose the
number yourself — the system does not generate one — and it is both what prints on the
invoice and the bank reference the client pays against. It saves when you click away.

> [!WARNING]
> Without an invoice number the booking cannot reach **Deposit Invoice Sent** and the
> invoice will not generate at all. Fill it in before you start.

[[shot:qs-generate-invoice|The Generate invoice dialog]]

1. Click **Generate Invoice** at the foot of the booking.
2. Leave **Pay in full** off for a deposit split, or switch it on for one invoice covering
   the whole trip. It switches itself on when departure is inside two months.
3. Check the **Deposit percentage** — 25% unless it has been changed — and the amounts
   underneath.
4. Click **Generate**.

[[shot:qs-preview-send-invoice|Preview and send, with the invoice PDF already attached]]

The send dialog opens on its own with the invoice PDF attached. Review the wording and click
**Send with attachment**.

> [!WARNING]
> This send moves the booking to **Deposit Invoice Sent**. The client now has the invoice.

## 11. Record the deposit

[[shot:qs-record-payment|The Record Payment dialog]]

1. Open the **Payments** tab and click **Record Payment**.
2. Set the **Payment Date** to the day the money landed, not today.
3. Enter the **Amount**, the **Method** and the bank **Reference**.
4. Click **Record**.

**Record Payment** stays disabled until the deposit invoice has been sent — there is nothing
to reconcile a payment against before then.

[[shot:qs-payment-confirmation|The Payment received email, with the amended invoice attached]]

Then click **Send payment confirmation**, at the top right of the Payments tab, and send it.
The same invoice is re-attached, re-rendered with the amount received and the balance still
outstanding.

> [!WARNING]
> Recording the payment does not move the stage. **Sending the confirmation does** — from
> Deposit Invoice Sent to **Deposit Paid**. A booking sitting at the wrong stage with money
> in the bank is almost always a confirmation that was never sent.

## 12. The balance, and Paid in Full

[[shot:qs-balance|The Bookings list, showing received against quoted]]

There is no second invoice to raise. This system issues **one invoice per booking** and
amends it in place, so when the balance arrives you do exactly what you did for the deposit:
record the payment, then send the payment confirmation again.

That second confirmation moves the booking from **Deposit Paid** to **Paid in Full**. The
Bookings list shows what has been received against what was quoted, so you can see at a
glance where a booking stands.

## 13. Send the travel voucher

[[shot:qs-voucher-details|The Voucher Details tab, with every leg referenced]]

1. Open the **Voucher Details** tab.
2. Enter the supplier's **Reference number** for every leg, and a **Contact name** where you
   have one.
3. Click **Save** on each leg. The banner at the top confirms when all of them are done.

> [!STOP]
> A leg with no reference number blocks the voucher outright. There is no way around this
> tab.

[[shot:qs-generate-voucher|The Generate travel voucher dialog]]

4. Go to the **Documents** tab and click **Generate Voucher**.
5. Click **Generate PDF** and read any amber warnings above the preview — they name detail
   that is missing but do not stop you sending.

[[shot:qs-send-voucher|Send travel voucher, with the voucher and itinerary attached]]

6. Click **Preview & Send Voucher**, check the email, and click **Send with attachment**.

The client receives the voucher and a client itinerary in the one email. The itinerary is
built for you; there is no separate step.

> [!WARNING]
> Sending the voucher moves the booking to **Voucher Sent** and sets its outcome to **Won**.
> This is the point the system treats the sale as closed — there is no separate "mark as
> won" step.

## 14. Closing the booking

**Closed** is the last stage and you do not move a booking there yourself. The system closes
it automatically seven days after the trip ends, and nothing you have generated or sent
changes when it does.

If a booking never converts, use the red **Cancel Booking** button rather than dragging a
card. It asks for the cancellation reason, and the refund detail where money has already
been taken, in one dialog.

## The pipeline at a glance

[[shot:qs-pipeline-board|The Pipeline board — six columns of active work]]

The board shows the six active stages. Drag a card between columns, or use the **Move to**
select at the foot of a card. Enquiry, Closed and Lost have no column, so those bookings are
found through Enquiries, Bookings or search rather than here.

Moving a booking backwards is never blocked. If something has gone too far, drag it back and
work forward again.

## Cheat sheet

| # | Stage | What puts the booking there |
|---|---|---|
| 1 | **Enquiry** | The enquiry exists. Nothing priced, nothing sent. |
| 2 | **Quote Sent** | You sent the quote from **Preview & Send** on the Quotes tab. |
| 3 | **Quote Accepted** | You ticked **Reservation form received** and sent the acknowledgement. |
| 4 | **Deposit Invoice Sent** | You sent the invoice email. Needs an invoice number, and guest ID or passport numbers, first. |
| 5 | **Deposit Paid** | You recorded the payment *and* sent the payment confirmation. |
| 6 | **Paid in Full** | The balance is recorded and the second payment confirmation has gone out. |
| 7 | **Voucher Sent** | You sent the voucher. Needs a supplier reference on every leg. The outcome becomes **Won**. |
| 8 | **Closed** | Automatic, seven days after the trip ends. |
| — | **Lost** | **Cancel Booking**, with a reason and any refund detail. |

Four things to remember:

- **Sending the email is what moves the stage.** Generating a document does not.
- **The invoice number is yours to type**, and nothing invoice-related works until it is in.
- **One invoice per booking**, amended and re-sent — never a second document.
- **Moving backwards is always allowed.** Nothing is undone by it; only the stage changes.
