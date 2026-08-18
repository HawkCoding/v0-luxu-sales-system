# Reservation, guests and schedule changes

This chapter covers what happens between the client accepting a quote and the invoice
going out — the **Reservation** tab's guest roster, company and billing detail, special
requests, and the **Transfer Times** tab for correcting a flight or transfer after the
quote has already been sent.

[[shot:05-reservation-tab|The Reservation tab]]

## Reservation form received

> [!WARNING]
> Ticking **Reservation form received** is not a passive checkbox. It composes the
> acknowledgement email and opens the send dialog immediately, and the flag only sets
> once that email actually sends. Cancel the dialog and the box stays unticked.

[[shot:05-form-received|The Reservation form received card]]

1. Tick **Reservation form received** at the top of the tab.
2. The acknowledgement email opens in the **Preview & Send** dialog, pre-filled from the
   Reservation Received template.
3. Review and edit it, then click **Send**.

Sending it moves the booking from **Quote Sent** to **Quote Accepted** — the tick and the
stage move happen together, off the same send. Unticking the box afterwards clears the
flag directly, with no email involved.

A dialog offers to jump straight to the guest roster once the send goes through — click
**Fill in now**, or **Later** to record guest details at your own pace.

Until the form has come back, a note above the guest roster reminds you that the fields
below are pre-filled from the original enquiry and need checking against what the client
actually returned.

## The guest roster

[[shot:05-guest-roster|The guest roster with two guests]]

On the **Guests** card:

1. Click **Add guest** or **Add child** to add a row.
2. Fill in title, first name, surname and ID/passport number — these three are required
   before the roster can be saved.
3. Fill in date of birth (day first — `12/05/1980` or `1980-05-12`) and country of
   residence where known.
4. Tick **Primary guest** on the traveller the booking bills to. Only one guest can be
   primary; ticking a different one moves the flag.
5. **Room with** and **Room type** are free text, shown on the Worksheet PDF only.
6. Click **Save guests**.

**Fill from customer profile** fills blank fields on existing rows from the customer
record — it never overwrites something already typed, so a mis-click cannot wipe data
in. A row filled this way is marked *"Prefilled from customer profile"* until you save.

Where a row still differs from what the enquiry originally carried, a line underneath it
reads **Enquiry: …** with a **Revert to enquiry** button.

> [!STOP]
> Saving an empty guest list deletes every saved guest on the booking — names, ID or
> passport numbers and dates of birth are gone for good. The system confirms this with
> you before it happens, but there is no undo once you accept.

## Applying the guest list to passenger counts

The guest roster and the booking's priced passenger counts (the ones quotes, invoices
and vouchers actually use) are two different things and can disagree. When they do, an
amber **Guest list does not match the passenger counts** panel appears above the roster,
spelling out both sides — for example *"Saved guests: 2 adults. This booking is priced
for 3 adults."*

Click **Apply guest list to passenger counts** to overwrite the booking's counts with
the roster's. This is one-directional and explicit — nothing applies it for you.

> [!NOTE]
> A mismatch only warns. It never blocks a stage move. Reconcile it when it is
> convenient, not because the system is forcing you to.

## Company details, agency details and billing address

Three places carry company and address information, and each feeds a different
document:

- **Billing address**, on the primary guest's row in the Guests card — printed on the
  invoice as the address.
- **Company details** — company name and VAT number, printed on the invoice as
  Company / VAT.
- **Agency details** — agency name and address, used where the booking was placed
  through a travel agency.

Each has its own **Copy from customer profile** button, which is a one-shot fill rather
than a live link — it copies the customer record's values in at the moment you click, and
nothing updates automatically after that. Left blank, the invoice prints a dash; it does
not fall back to the customer profile on its own.

Where a field still differs from what the enquiry carried, the same **Enquiry: …** /
**Revert** pattern from the guest roster applies to agency name and address.

Save each card independently — **Save guests** also saves the billing address alongside
the roster, and **Save company details** / **Save agency details** save their own cards.

## Special requests

On the **Special requests** card:

- **Voucher special requests** prints as SPECIAL REQUESTS on the travel voucher — the
  only document it appears on.
- **Dietary** and **Occasion** print on hotel service blocks.
- **Smoking** and **Meal seating** print on train service blocks.
- **Medical** is internal only. It never prints on any document.

Where the original enquiry recorded additional-services detail, it is shown above the
fields as *"From enquiry: …"* for reference.

## Transfer Times

[[shot:05-transfer-times|The Transfer Times tab]]

Use the **Transfer Times** tab to correct a flight or transfer that has been rescheduled
after the quote was sent — a changed departure time, a new flight number, a different
airport. Editing here does not create a new quote version; the quote the customer already
has stays exactly as sent.

Flights and transfers/vehicle rentals are listed in separate sections, one row per leg.

For a flight:

1. Enter the **Flight number**.
2. Enter the **From** and **To** airport codes.
3. Set the departure date and time, then the arrival date and time. Arrival follows the
   departure date until you change it, and a flight landing the next day says so
   underneath.
4. Click **Save** on that row.

For a transfer or vehicle rental, set the pickup date and time (and, where it takes a
return leg, the return date and time), then **Save**.

**Save** is disabled until the row has an unsaved change, and stays disabled if the
schedule is impossible — arriving before departure, or arriving on the departure day at
or before the departure time.

## The stale-voucher warning

[[shot:05-stale-voucher|The stale-voucher warning]]

> [!STOP]
> If a travel voucher has already been generated for this booking, changing a time here
> makes it wrong. The system does not regenerate the voucher for you — you must do it
> yourself, or the client is holding a document with the old schedule on it.

Once any saved time no longer matches what a generated voucher shows, a banner appears at
the top of the Transfer Times tab:

- If the voucher was only generated, not sent: *"A voucher was generated on &lt;date&gt;
  with the previous times. Regenerate it from the Documents tab."*
- If the voucher was already sent to the client: the same message, in red, naming the
  date it was sent, because a client is now holding the stale document.

Regenerate the voucher from the booking's **Documents** tab and send the new one before
telling the client the change is handled.
