# Quoting

This chapter takes a booking from an empty draft quote to a priced quote in the customer's
inbox, and then to a revised version after they ask for a change. Everything happens on the
booking's **Quotes** tab.

> [!WARNING]
> An accepted quote cannot be edited. Once a quote is accepted it is the record of what the
> customer bought — the voucher, the itinerary and the invoice all render from it — so the
> system refuses every edit to it with *"An accepted quote cannot be edited. Use Revise to
> create a new version."* The only way to change a sold booking's numbers is **Revise**, which
> is covered at the end of this chapter and rewinds the booking. Get the quote right before it
> is accepted.

[[shot:04-quotes-tab|The Quotes tab with a priced quote]]

## Quote versions and statuses

A booking can carry several quotes. Each is numbered off the booking number with a version
suffix — `LTT-2026-0001-Q1`, then `-Q2` and so on — but the cards on screen are titled
**Quote 1**, **Quote 2**, in the order they were raised. Hover the title to see the full
number.

The badge next to the title is the quote's status:

| Badge | Means |
|---|---|
| **Provisional** | A working quote. Fully editable, can be priced, sent or cancelled. |
| **Provisional (Incomplete)** | The same, but at least one service could not be priced. |
| **Sent** | Emailed to the customer. Still editable and still re-buildable. |
| **Accepted** | The customer accepted it. Locked — only **Revise** touches it. |
| **Expired** | Past its shelf life. Not editable; **Revise** it to start a new version. |
| **Superseded** | Replaced by a revision. Kept as a record; nothing can change it. |
| **Cancelled** | Abandoned. Kept as a record; nothing can change it. |

A separate red **Missing pricing** badge appears beside the status whenever any line on the
quote is still unpriced.

> [!NOTE]
> Quote numbers and quote dates are deliberately hidden from everything the customer sees.
> They do not appear on the quote PDF or in the quote email, and the emailed PDF is named
> after the booking number, not the quote number. Quote the booking number to a customer, not
> the quote number.

## Creating a quote

There are two ways in, and both land in the same place:

- From the **Enquiry** tab, click **Start Quote** on the **Ready to quote** card.
- From the **Quotes** tab, click **Create New Quote**.

Either creates an empty draft quote and opens the Build Booking dialog straight away, so
there is no second click before you start pricing.

> [!NOTE]
> Quotes are stamped with a validity date behind the scenes — the quote date plus the
> organisation's default of 14 days — but nothing displays it, nothing warns on it and
> nothing expires because of it. There is no **Valid until** field to fill in and no validity
> setting to configure. Treat quote validity as an internal record only.

## Build Booking, step 1 — choose services

[[shot:04-build-step-1|Build Booking, choosing services]]

The dialog opens on **Build this booking's services**. To come back to it later, click **Edit
Quote** on the quote card — it is the same three-step dialog, pre-filled with what was saved
last time.

Add every service the customer is buying — the train, the hotel nights, transfers, a vehicle
rental, a flight, a tour.

1. Pick a supplier category from the first dropdown: Train, Hotel, Transfers, Vehicle Rental,
   Tours or Airlines.
2. Pick the supplier from the second dropdown. It only lists active suppliers of the category
   you chose.
3. Click **Add service**. The service appears in the list below with its category badge.
4. Repeat for every service.
5. Reorder with the up and down arrows on each row — the order here is the order the services
   are configured, priced and printed in.
6. Click **Remove** on a row to drop a service.
7. Click **Next**.

Re-opening Build Booking on a booking that has already been built pre-fills this list from
what was saved last time, so you are editing the existing service list rather than starting
over.

> [!TIP]
> If a supplier you need is not in the dropdown, it is either inactive or filed under a
> different category. Suppliers are maintained by a manager or administrator.

## Build Booking, step 2 — configure services

[[shot:04-build-step-2|Build Booking, configuring services]]

This is where the booking is actually specified. The header shows the trip date range, which
is derived from the service dates you set below — you never type the trip dates directly.

Each service gets its own editor panel. Untick **Include in quote & voucher** to leave a
service out of both. The train journey is the exception: it reads **Always included** and
cannot be unticked, because a booking without its train would produce a voucher missing the
journey the customer paid for.

### Train, tour and flight services

- **Route** — the journey. Where a route can run in both directions, the flip button beside
  it reverses it, and the resolved direction is shown underneath.
- **Service date** — the departure date. At least one dated service is required; the trip
  dates are worked out from them.
- **Rate type** — leave it on **Supplier default** to let pricing walk the supplier's quoted
  rate, then its base rate, then the system default. Choosing one explicitly makes it a hard
  requirement: if no rate card matches that rate type, pricing fails rather than quietly
  substituting another rate.
- **Suites** — one block per suite. Set the suite type, and the bed configuration, bedroom
  layout and bathroom type where the supplier offers them. **Add suite** adds another;
  the bin icon removes one.
- **Adults / Children / Infants** — the passenger split per suite, for trains, tours and
  airlines. The running total above the suites reads `2/2 adults, 1/1 children, 0/0 infants`
  against the booking's own counts and turns red when they disagree.
- **Special requests / allergies** — free text carried through to the supplier.

A tour operator prices the tour type rather than the route, so on a tour service you choose
the type first and the itinerary list is then filtered to the ones belonging to it.

An airline service adds a **Flight details** block: flight number, **From** and **To**
airport codes, departure date and time, arrival date and time, and hand and checked luggage
allowances in kilograms. The arrival date follows the departure date until you change it, and
a flight that lands the next day says so. A flight that arrives before it departs is refused.

### Hotel stays

A hotel panel replaces the route with a **Meal plan**, adds **Nights**, and dates the stay
against the train rather than by hand:

- **Pre-train** — the nights immediately before the train departs.
- **Post-train** — from the day the train arrives.
- **Custom date** — pick the check-in yourself.

With **Pre-train** or **Post-train** selected, the check-in and check-out dates are shown and
re-derived every time the train's departure date or the night count changes. If the train's
route has no journey length recorded, a post-train stay would check the guest in on the
departure day; the panel says so and asks for a custom date instead.

Rooms work like suites, minus the passenger split.

### Transfers and vehicle rentals

- **Transfer route template** / **Rental route template** — a quick-fill only. Picking one
  pre-fills empty pickup and drop-off fields and never overwrites anything you have typed.
  Documents always show what is in the fields, not the template.
- One block per trip: pickup point, drop-off (or return) point, pickup date and time, vehicle
  category, passengers, luggage, flight number, and notes. A rental also takes a return date
  and time, which is required.
- **Add transfer** / **Add vehicle** adds another trip on the same supplier.

Pricing comes from the vehicle category's rate card, not the route template.

### Price overrides and complimentary rooms

Every hotel room and every transfer or rental shows the rate card price it would charge, with
an **Override price** link beside it. Click it, type the amount the supplier actually quoted,
and that figure goes on the quote instead. The panel then shows the stay or hire total, what
it is replacing, and — where the currencies differ — the converted figure.

An override applies to this booking alone and is never saved back as a rate. **Revert**
clears it and returns the line to rate-card pricing.

A hotel room also has **Mark complimentary**, which is an override typed as zero. The
customer's quote and voucher show the room as complimentary rather than as a zero amount, and
it is exempt from the missing-pricing check.

> [!NOTE]
> A room or trip with no rate card covering it is not a blocker — it is a reason to type a
> price. The panel says which is the case: no vehicle category selected, no route template, no
> pickup date, or a genuine gap in the rate cards.

### Supplier admin dates

Every service — including transfers and rentals, where it applies to the whole leg rather
than one trip — has a collapsed **Supplier admin** section: **Booking date**, **Confirmation
date**, **Payment made date**, and **Paid with**. These record when the leg was placed,
confirmed and paid with the supplier. They are internal only — never shown to the customer —
and feed the booking worksheet's service-lines grid. Filling one in on an auto-filled service
also clears its **Auto-filled** chip, the same as editing any other field on the leg.

### Exchange rates

[[shot:04-fx-banner|The exchange-rate banner on Build Booking]]

A quote is always denominated in one currency. When a service prices off a rate card in a
different currency, an exchange-rate strip appears above and below the service panels — one
row per foreign currency, showing `USD → ZAR` and the rate, a refresh button, and the date
the rate was published. If the cached rate could not be refreshed the date is followed by the
word **stale**.

The rate box is editable. Type over it when you have a better number from the bank than the
published close — whatever is in the box is the rate the quote is priced at, so the preview
you see and the lines that get saved cannot disagree.

Two things to know:

- The rates load once when the dialog opens and never change underneath you mid-edit. They
  only move when you press refresh or type over them.
- Editing a rate here affects **this quote only**. It does not write back to the shared rate
  cache and does not reprice anyone else's bookings.

The strip is hidden entirely when every price is already in the quote's currency, which is the
common case.

### Commission

The **Commission** block near the bottom is required. It carries a **Required** badge until
it is set, and **Next** stays disabled while it is empty.

Choose a shape and enter a value:

- **% Markup** — a percentage of the booking.
- **Per Person** — a flat amount for each traveller.
- **Fixed Total** — a flat amount for the whole booking.

The line beneath reads back what it resolves to. Enter `0` if no commission applies — that is
a deliberate answer, and it is what unblocks **Next**.

Commission is pre-filled where it can be: from the existing quote lines when you re-open a
priced quote, otherwise from the house default set in Settings. Either way it stays fully
editable.

### Auto-filled services and Confirm services

Where the booking was built automatically from an enquiry, the services carry an
**Auto-filled** badge and a banner appears: *"Some services below were filled in automatically
from the enquiry. Review them, then confirm — or edit any field to accept it individually."*

Two ways to clear it:

- Edit a field on a service — that service's badge clears immediately.
- Click **Confirm services** to accept all of them at once.

Once confirmed, the banner is replaced by a line recording who confirmed the services and
when.

### When the traveller counts disagree

If the suites on a train, tour or airline service do not add up to the booking's traveller
counts, an amber **Travellers** panel appears and **Next** is blocked. It spells out both
sides: *"suites hold 3 adults, 0 children, 0 infants — booking is 2 adults, 0 children, 0
infants."*

There are two ways out, and which one is right depends on which side is correct:

1. **The suites are correct** — the customer added or dropped travellers. If only the adult
   count differs, the panel offers a one-click **Set booking to N adults** button. Use it.
2. **The booking is correct** — the split across suites is wrong. Click **Edit travellers** to
   open the traveller editor and correct the adult count, child count and child ages, then
   **Save**. Children and infants can only be reconciled this way, because how many children
   count as adults is derived from their ages.

There is also a **Spread evenly** link on the service itself, which re-splits the booking's
totals across its suites. It never runs on its own — it would overwrite a split you had just
typed by hand.

Click **Next** when everything is set. This saves the service selections and transport
details, then prices the quote.

## Build Booking, step 3 — confirm

[[shot:04-build-step-3|Build Booking, confirming the replacement]]

The **Confirm replacement** step shows exactly what will be written to the quote: every line,
its quantity and unit, the unit price and the total, plus the rate type each line priced off.
Nothing is saved until you press the button.

The button reads differently depending on what is already on the quote:

- **Apply to quote** — the quote has no lines yet; these lines are added.
- **Replace & apply** — the quote already has lines; the service lines are replaced. Any lines
  marked **Extra** are kept, and the dialog says how many.

If a service could not be priced, a red panel lists them by name and both buttons stay
disabled. The preview deliberately prices what it can so you can see the rest, but a quote
that silently omits a service will not be saved. Go **Back** and finish configuring it.

If someone else saved this quote while you had the dialog open, an error appears and a **Save
anyway** button is offered alongside. Use it only when you are sure your version is the one
that should win — it overwrites theirs.

## Reading the quote

[[shot:04-quote-lines|Quote line items with pricing badges]]

Back on the **Quotes** tab, each quote is a card: line items, then the rounding field, then
the subtotal and total.

The line-item table shows description, quantity (with its unit underneath — *per person*,
*per night*), unit price and total. Watch for:

- **TBD** in red in the unit-price column — the line is unpriced and needs fixing before this
  quote goes out.
- **Included** — the line is part of a fixed-price package and its price sits on that
  package's total line, not here.
- An **Extra** badge — an ad-hoc line that is not part of the built services. Extra lines
  survive a rebuild.

Some lines carry a small internal note underneath. These are for you, never for the customer,
and they do not appear on the PDF or in the email:

| Note | Means |
|---|---|
| `↳ $17 440,00 @ 17,2500 · 17-08-2026` | What the line cost before conversion, at what rate, and when that rate was published. |
| `⚑ Manual room price — R 3 600,00/night, replacing R 4 000,00 · set by Leonie Kruger on 14-08-2026` | A typed room price, and who typed it. |
| `⚑ Manual transfer price — R 850,00, replacing R 950,00 · set by …` | The same for a transfer or rental. |
| `Complimentary night · set by …` | A room comped by the supplier. |

### Commission and rounding

The quote carries a single line described simply as **Commission**. Beneath the table,
**Rounding** lets you add a flat amount, positive or negative, in the quote's currency — the
usual reason being to round a total to something presentable.

Type the amount and click **Save**, or press Enter. The amount is folded into the existing
Commission line rather than added as a second one, so the customer never sees the split. On
screen you do: the Commission line then shows `R 61 000,00 calculated + R 600,00 added`.

Clearing the field removes the rounding and restores the calculated figure. Raising or
lowering it never compounds — it is always applied against the calculated amount.

On a quote you cannot edit, the rounding field is shown read-only as a **Rounding** row, and
is hidden entirely when it is zero.

## Editing lines by hand

While a quote is **Provisional**, each line has a bin icon that removes it. This is a direct
edit to the quote and does not touch the underlying services — the line comes back the next
time you rebuild.

A quote must keep at least one line. Removing the last one is refused with *"A quote needs at
least one line. Cancel the quote instead."*

The bin icons disappear on a **Sent**, **Accepted**, **Expired**, **Superseded** or
**Cancelled** quote. A sent quote can still be rebuilt through Build Booking — nothing renders
off a quote until it is accepted — but an accepted one cannot be touched at all.

## The quote PDF

Click **PDF** on the quote card. The document is generated, stored against the booking, and
opens in a new tab. It is also listed on the booking's **Documents** tab.

Pressing **PDF** again re-renders the document from the quote as it stands now, so a quote
that has changed since the last download produces a fresh PDF rather than the stale one.

The PDF carries the customer's name, the journey dates, the traveller counts, the itinerary
for the services priced into *this* quote version, and the total. It does not carry the quote
number or the quote date.

> [!TIP]
> You do not have to generate the PDF before sending. **Preview & Send** attaches it
> automatically, generating it first if it does not exist.

## Preview and Send

[[shot:04-preview-send|The two-pane Preview & Send dialog]]

**Preview & Send** sits at the top of the Quotes tab. It always targets the newest quote that
has not been sent yet — so on a booking with several quotes, check the card badges before you
press it. It is disabled, with the tooltip *"Create a quote first"*, when there is no sendable
quote.

The dialog is two panes: **Compose** on the left, a live **Preview** of the actual email on the
right. The chevron buttons on each pane collapse the other one when you want the full width.

On the left:

- **Subject** — pre-filled from the Quote Email template and fully editable.
- **Attach files** — the quote PDF is attached automatically and is not listed here. This is the
  library of extra documents an administrator has uploaded for this train and this kind of
  email; the ones marked as defaults arrive pre-ticked. The whole section is hidden when there
  are none.
- **Signature** — pick which signature is appended. The preview updates as you switch.
- **Email body (this send only)** — the wording, editable in place. The note underneath says it
  plainly: *"Default wording is edited on the Templates page (Quote Email template)."* Anything
  you change here applies to this one email and nothing else. To change the wording for every
  quote email, edit the template instead.

Amber warnings appear above the buttons where the template could not resolve something.

Click **Send**. The dialog closes immediately and a toast appears with an **Undo** button —
nothing is actually sent for about five seconds. Click **Undo** in that window and the email
is never sent and nothing on the booking changes. Let it run and the email goes out.

> [!WARNING]
> Sending a quote moves the booking to **Quote Sent**. It also marks the quote **Sent**, stamps
> the card with the date it was last sent, and files the email on the booking's Emails Sent
> tab. This is a customer-facing action with a pipeline consequence — the Undo window is your
> only chance to take it back.

A booking whose email import is still flagged **Needs Review** cannot send a quote at all. The
attempt is refused with *"Resolve Needs Review before sending this quote"*. Clear the flag on
the Enquiry tab first.

## Revising a quote

[[shot:04-revise|The Revise dialog showing what will reset]]

**Revise** creates a new version of a quote and rewinds the booking so the sales steps run
again against the new numbers. It is the only route to changing a quote the customer has
already accepted, and it is the most destructive routine action in the system.

> [!STOP]
> A revision voids invoices, rewinds the booking's stage, and can reopen an invoice the
> customer has already paid. None of it is undone by cancelling the new quote. Read the list
> the dialog shows you before you confirm it.

The **Revise** button appears on a quote card only when the quote is **Sent**, **Accepted** or
**Expired**. A provisional quote has nothing to revise — edit it directly.

### What the dialog tells you before you commit

Opening the dialog checks the booking first (*"Checking what will reset…"*), then lists exactly
what this revision will do. The list is generated from the booking's real state, so it is not
boilerplate — read it. It always contains:

- **Where the booking goes.** Either *"Booking moves back from &lt;stage&gt; to &lt;stage&gt;"*
  or *"Booking stays at &lt;stage&gt;"*.
- *"Unpaid deposit and final invoices are voided so a new one can be issued at the revised
  total."*
- *"The quote being revised is marked Superseded."*
- *"Guest details, reservation details and supplier references are kept as they are."*

And, where they apply:

- *"Payments already received are kept — the deposit stays marked as paid."*
- *"This booking already reached &lt;stage&gt; — any paid invoice is reopened so the new balance
  can be billed once this revision is accepted."*
- *"You then re-walk three steps: send the revised quote, move the booking to Quote Accepted,
  and issue the amended invoice (you can switch between deposit and full payment again)."*

### How far back the booking is rewound

There are exactly two floors, and which one applies depends on one question: **has any money
been received?**

| Money received | Booking rewinds to | What is cleared |
|---|---|---|
| No payments, no deposit | **Enquiry** | Every stage timestamp from Quote Sent forward, the deposit-paid flag, the manual deposit confirmation, and the invoice balance. |
| Any payment, or the deposit marked paid | **Quote Accepted** | Stage timestamps forward of Quote Accepted. The payments, the deposit-paid flag and the deposit-paid date all stay. |

A booking already at or behind its floor does not move — the dialog says *"Booking stays at
…"* and no timestamps are cleared. In both cases, if the booking's outcome was marked **Won**,
it goes back to **Open**.

The floor never sits above Quote Accepted, and that is deliberate: an invoice cannot be priced
without an accepted quote, so a higher floor would strand the booking with a revised quote
that could never be billed.

### What happens to the invoices

- **Draft and sent invoices are voided.** All of them, regardless of kind.
- **A paid final or full invoice is reopened** — set back to *sent* — so the difference can be
  billed once the revision is accepted. It is not voided; the payment record stands.
- **A paid deposit invoice is left alone.**

The success toast tells you the counts: *"Quote revision created. 1 invoice voided, 1 invoice
reopened."*

### The extra confirmation past Paid in Full

When the booking has already reached **Paid in Full** or beyond, an amber panel appears —
*"This booking is already far along"* — with a tick box you must select before **Revise quote**
becomes available:

> I understand this booking already progressed past Paid in Full and that revising it requires
> manually re-billing the difference once the new quote is accepted.

The system will not calculate or chase that difference for you. Re-billing is a manual job.

### What the new quote contains

The revision is a fresh **Provisional** quote at the next version number — `-Q1` becomes
`-Q2` — carrying a full copy of the old quote's lines, prices, pricing notes and rounding. The
quote it came from is marked **Superseded** and stays on the booking as a record.

Because the copy is complete, a revision is usually a small edit: open Build Booking on the new
quote, change what the customer asked to change, and re-apply.

### Finishing a revision

Once a revision rewinds a booking, the money-side actions disappear from the booking header
until the journey is re-walked — this is expected, not a fault. A blue banner takes their
place: **Quote revised — finish the updated booking**, with the outstanding steps ticked off as
you complete them:

1. Send the revised quote to the customer.
2. Move the booking to Quote Accepted.
3. Issue the amended invoice (deposit or full payment).

Each step carries a button that takes you to it. The banner clears itself once the amended
invoice is issued.

## Changing the quote currency

**Currency** on the quote card re-denominates the whole quote — every line is re-priced into
the currency you choose, and the customer only ever sees the new one.

1. Click **Currency**.
2. Pick the target currency in **To**.
3. Check the **Rate**. It is pre-filled from the published rate and is freely editable — type
   your bank's number if you have a better one. The refresh button re-fetches and drops any
   hand-typed rate.
4. Read the preview: up to six lines before and after, and the new total. The total is marked
   with `≈` because per-line rounding means it is a close approximation; the exact figure is
   recomputed when you save.
5. Click **Re-price in &lt;currency&gt;**.

Only a **Provisional** quote can be converted in place. On a quote that has been sent or
accepted the dialog opens read-only and explains why: the customer is holding a document in
one currency and any invoice raised off it agrees with that document. Changing it underneath
them would make all three disagree.

> [!WARNING]
> To change the currency of a sent or accepted quote you must **Revise** it first, then convert
> the new provisional version. That means accepting everything a revision does to the booking —
> read the Revise section above before you start.

The **Currency** button is hidden on cancelled, superseded and expired quotes.

## Cancelling a quote

**Cancel** marks a quote **Cancelled**. It stays on the booking as a record; nothing about it
can be changed afterwards.

Cancel is available on **Provisional**, **Provisional (Incomplete)** and **Sent** quotes only.
An accepted quote cannot be cancelled — the attempt is refused with *"Only quotes that have not
been accepted can be cancelled"* — and neither can one that is already expired, superseded or
cancelled.

> [!NOTE]
> Cancelling a quote does not move the booking's stage and does not touch any invoice raised
> against it. If the customer has walked away entirely, cancel the booking rather than the
> quote.
