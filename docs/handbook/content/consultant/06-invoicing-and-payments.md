# Invoicing and payments

## One invoice, amended in place

This system issues **one invoice per booking**. It is generated once, sent once, and from
then on **amended in place** — re-rendered with fresh figures and re-sent under the same
invoice number whenever something changes.

There is no second document to raise when the balance falls due. Nothing on the booking
produces one, and looking for a button that does will cost you an afternoon. What happens
instead is this:

| What changes | What you do |
|---|---|
| The deposit is received | Record the payment, send the payment confirmation. The same invoice is re-attached with the received amount and outstanding balance updated. |
| The balance is received | Record the payment, send the payment confirmation again. Same invoice, outstanding now zero. |
| The quote is revised after invoicing | **Amend & Resend Invoice**. Same invoice, new total, payments already received still on it. |

The client therefore holds one invoice number for the life of the booking, and each email
they receive carries the current version of it. The figures on it — subtotal, deposit,
final amount, amount received, outstanding — are rebuilt from the booking's live balance
every time it is rendered.

## The invoice number

[[shot:06-invoice-number|The Invoice number field on the booking header]]

The **Invoice number** field sits on the booking header, under the customer name and
consultant. You type it in yourself; the system does not generate it.

It matters more than its position suggests:

- It is the number printed on the invoice PDF and quoted in every invoice email.
- It is the **bank payment reference** the client is asked to use.
- Once captured, it replaces the booking number as the reference shown on pipeline cards
  and in list views, because that is the number the office recognises a booking by.

Type it and press Enter, or click **Save**, or simply click away — the field saves on
blur. The change is written to the booking's audit log.

> [!WARNING]
> The invoice number is a hard gate. Without it the booking cannot move to **Deposit
> Invoice Sent** — *"An invoice number is required before sending the deposit invoice."* —
> and generating the invoice fails outright with *"Enter the invoice number on the job
> before generating this invoice."* Fill it in before you start.

## Generating the invoice

**Generate Invoice** sits at the foot of the booking, below the tabs, on the right. It
appears once the booking reaches **Quote Accepted** and stays there until the invoice has
actually been sent.

[[shot:06-generate-invoice|The Generate Invoice dialog]]

1. Click **Generate Invoice**.
2. Decide between a deposit split and full payment with the **Pay in full** switch.
3. Set the **Deposit percentage**, or the **Due date** if paying in full.
4. Check the customer, the quote total and the amount underneath.
5. Click **Generate**.

Generating creates a draft invoice and renders its PDF. Nothing has gone to the client at
this point — the next dialog does that.

### Pay in full

**Pay in full** raises one invoice for the whole amount instead of a deposit and a
balance.

It **defaults to on when departure is inside 2 months**, and the switch says why:
*"Departure is within 2 months — full payment is due, no deposit split."* That is the sales
team's payment terms, not a system limitation — a booking that close to travel does not
get a deposit split. You can still switch it off, but you are overriding the terms when
you do.

Outside 2 months the switch starts off and reads *"One invoice for the full amount instead
of a deposit + final split."*

### Deposit percentage

Shown only when **Pay in full** is off. It pre-fills from the house default set in
Settings — 25% unless an administrator has changed it — and you can override it on this
booking without changing the default. The amount at the bottom of the dialog updates as
you type.

### Due dates

| Invoice | Due date |
|---|---|
| Deposit | Three days from generation. Not editable — it is the standard 72-hour deposit term. |
| Pay in full | Two days from generation, shown in an editable **Due date** field. Change it before generating. |

The **final payment** date is a separate thing and is not asked for here: it is always 2
calendar months before departure, same day-of-month, and the invoice PDF prints it on the
money ladder. Where departure is already inside that window, the PDF prints *Now*.

> [!NOTE]
> Every traveller needs a name, surname and ID/passport number on the **Reservation** tab
> before an invoice can be generated. Missing any of them stops the generate step with
> *"Guest details (name, surname, ID/passport) are required for every traveller before a
> deposit invoice can be generated."*

## Preview and send

[[shot:06-preview-send-invoice|Preview and send, with the invoice PDF attached]]

The **Preview and send** dialog opens on its own once the invoice generates. The invoice
PDF is **already attached** — you do not attach it, and it is listed as a chip under the
subject line so you can see it is there.

- **Subject** and **To** are pre-filled and editable.
- The **Preview** tab shows the email exactly as the client will receive it, branded
  wrapper and all.
- The **Edit** tab lets you reword the body. *"Edits apply to this email only. Change the
  default wording on the Templates page."*
- **Signature** chooses which brand's signature is used.
- **Attach files** lists documents an administrator has loaded into the email attachment
  library. It only appears when there is something in the library for this kind of email.

Click **Send with attachment**. The dialog closes immediately and the send fires a few
seconds later — a toast offers **Undo** in that window, and clicking it means the email
never goes.

> [!WARNING]
> Sending this email moves the booking to **Deposit Invoice Sent**. The send is what moves
> the stage — not the generate step, and not anything you do on the pipeline board. Once
> it is sent, the client has the invoice.

## Changing your mind before it goes out

A generated invoice that has never been sent is a draft, and the booking says so: an amber
**Deposit invoice not sent yet** panel appears under the tabs, naming the invoice.

The button changes with it, to **Preview & Send Deposit Invoice** (or **Preview & Send
Invoice** for a pay-in-full booking). It reopens the draft's preview rather than asking
you for a percentage again — the amount was decided when the draft was created.

To change the amount instead, open that dialog and click **Change amount**. This **voids
the draft** and returns you to the percentage form so you can generate a fresh one. The
voided draft stays on record as a void invoice.

> [!NOTE]
> **Change amount** only works on a draft. Once an invoice has been sent, the client has
> it, and the way to change the figure is a quote revision followed by **Amend & Resend
> Invoice** — see below.

## Amend and Resend

When a quote is revised after the invoice has gone out, the invoice is priced off a quote
that no longer applies. The booking notices, and the button at the foot of the page becomes
**Amend & Resend Invoice**.

The dialog is titled **Amend and resend invoice** and explains itself:

> The quote for *&lt;invoice number&gt;* has been revised. Re-issue the same invoice at the
> new total — any payment already received stays on record and is shown on the PDF.

Click **Amend & Preview**, then send from the usual preview dialog.

What the client sees is **the same invoice number**, re-issued, with the new total, the
amount they have already paid, and the new outstanding balance. Not a credit note, not a
second invoice — the same document, corrected. Say so when you send it, because a client
who filed the first version will otherwise think they have been billed twice.

## Recording a payment

Payments are recorded on the booking's own **Payments** tab.

[[shot:06-record-payment|The Record Payment dialog]]

1. Open the **Payments** tab and click **Record Payment**.
2. Set the **Payment Date** — the date the money actually landed, not today.
3. Enter the **Amount**. The dialog labels it with the booking's currency; an invoice is
   always raised in the currency of the quote it bills, and a payment is always made in
   the currency of its invoice.
4. Choose the **Method** — **EFT**, **Credit Card** or **Credit Adjustment**.
5. Enter the **Reference** — the bank reference off the proof of payment.
6. Add **Notes** if the payment needs explaining.
7. Click **Record**.

The amount must be positive. Refunds are not recorded here; they are handled through the
cancellation flow.

> [!NOTE]
> **Record Payment** is disabled until the deposit invoice has been sent. Hovering it says
> *"Available after sending the deposit invoice"*. This is deliberate — a payment recorded
> against a booking with no invoice out has nothing to reconcile against.
>
> Coming the other way, a booking cannot move to **Deposit Paid** with no payment on it;
> the **Next** button carries the tooltip *"Record a payment on the Payments tab to
> continue"* and takes you to the tab when clicked.

## Sending the payment confirmation

[[shot:06-payment-confirmation|The payment confirmation preview]]

**Send payment confirmation** sits at the top right of the **Payments** tab and appears
once at least one payment has been recorded. It composes the *Payment received* email and
attaches the booking's invoice, re-rendered with the updated status block and money
ladder.

> [!WARNING]
> This is the mechanism, not a courtesy. Sending the payment confirmation is what moves
> the booking on:
>
> - from **Deposit Invoice Sent** to **Deposit Paid**
> - from **Deposit Paid** to **Paid in Full**
>
> Recording the payment does not move the stage. Sending the confirmation does. A booking
> sitting at the wrong stage with the money in the bank is almost always a confirmation
> that was never sent.

The stage gates say the same thing from the other side: moving to **Deposit Paid** needs a
recorded payment, and moving to **Paid in Full** is blocked with *"The payment
confirmation hasn't gone out yet."*

## Chasing an unpaid invoice

Every invoice sitting at status *sent* gets its own **Send reminder — &lt;invoice
number&gt;** button in the strip below the tabs. The number on the button is the one you
typed on the booking header; where that has been left blank it falls back to a system
handle ending in `-INV`, which is a sign the field still needs filling in.

It opens the same preview dialog, titled **Send payment reminder**, with the invoice PDF
attached. The PDF is rebuilt from the booking's current balance first, so a reminder
issued after a part-payment shows the reduced outstanding amount rather than the original
figure. The email carries the number of days the invoice is overdue.

Each reminder you send is recorded against the invoice, so the booking keeps a history of
what was chased and when.

## Where the balance shows

[[shot:06-balance|The Bookings list showing paid against quoted]]

| Where | What it shows |
|---|---|
| **Payments** tab | **Total Received** above the payment list — green for money in, red for a negative balance. |
| **Bookings** list | On the right of every row, the amount received and, under it, *of* the quoted total. The **All Statuses** filter above the list narrows it to **Deposit Paid** or **Full Paid**. |
| **Pipeline** board | A coloured dot on every card, with a legend above the columns. |

The badge beside the booking number on the Bookings list is the **stage**, not the payment
position — only its shading responds to how much has been paid. Read the money off the
right-hand figures.

The pipeline dot reads:

| Dot | Meaning |
|---|---|
| Red | No payment |
| Purple | Partial payment — something received, but less than the deposit |
| Yellow | Deposit paid — at least the deposit percentage received |
| Green | Fully paid |
| Blue | Credit or refund — the booking is in credit |

The threshold between purple and yellow is the house default deposit percentage, not
whatever percentage was used on that particular invoice.

> [!STOP]
> There is a global payments screen, reached from the **Deposits Paid** and **Full
> Payment** cards on the Dashboard — it is not in the sidebar. Treat it as read-only. Its
> **Add Payment** and **Import Payments** buttons are **not wired up**: Add Payment shows
> a success message and saves nothing, and Import Payments does nothing at all. Record
> every payment on the booking's own **Payments** tab.
