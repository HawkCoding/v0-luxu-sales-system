# Enquiries and starting a booking

Every booking starts as an enquiry. This chapter covers getting one into the system,
reviewing what came in, and reaching the point where a draft quote exists — nothing priced
yet. Building the quote itself is Chapter 4.

## Where enquiries come from

An enquiry reaches the system three ways: a consultant captures it by hand, it arrives by
email and is parsed automatically, or a customer submits the website enquiry form. The
mechanics of the email and web-form pipelines — mailboxes, parsing rules, Gravity Forms
mapping — belong to the Automation and Reporting guide. This chapter covers what a
consultant does once an enquiry is in front of them, however it got there.

## The Enquiries queue

[[shot:03-enquiry-queue|The queue with filter chips visible]]

Open **Enquiries** in the sidebar. Each row shows the booking number, consultant badge if
claimed, source badge, purpose, customer name and email, direction, departure date, and
guest count.

Filter chips narrow the list:

- **Needs Review** — email-imported enquiries the parser could not fully resolve.
- **Complete** — enquiries with nothing outstanding.
- **Unassigned** — no consultant has claimed the booking yet.
- **My Enquiries** — claimed by you.
- **Possible Duplicates** — flagged as matching an existing booking.

The **Search enquiries...** box matches customer name, email, booking number or direction.
The **Source** dropdown filters to one origin: Web Form, Paste Import, Advertisement, Walk
In, Referral, Social Media, Phone Call, Email, or Travel Agent.

## Creating an enquiry by hand

[[shot:03-new-enquiry|The New Enquiry dialog]]

Click **New Enquiry**. The dialog opens on two tabs:

- **Paste Email** — paste the raw email or enquiry text into the box and click
  **Review & Import**. The system extracts customer and trip details automatically, then
  opens the same review screen described below.
- **Manual Entry** — choose **How did this enquiry reach us?** (Phone call, Walk-in,
  Referral, Advertisement, Social media, or Travel agent) and click **Start Manual
  Enquiry**. Every section starts blank.

Either path lands on **Review Imported Draft**, where you fill in or correct:

- **Customer Details** — Title, Country, First name, Surname, Email, Phone, Province /
  Region. First name, surname, email or phone, and country are required.
- **Trip Details** — Supplier, Route / Direction, Departure Date, Package Option, Hotel
  Option, Flight Booking, Flight Departure Date. Supplier, route and departure date are
  required.
- **Guests & Accommodation** — Adults, Children & infants, Child ages, Number of Suites,
  and a Suite Type (plus bedroom type, bedroom layout and bathroom type where the supplier
  offers them) for each suite. Adults and suite count are required; a suite type is
  reported as missing but does not block the save — it blocks building the quote instead.
- **Notes & Original Text** — free-text notes, plus the original pasted text for reference.

A **Learned** badge on a field means it was filled from a phrase this system has seen
before; a **Check** badge means it was parsed with low confidence. Editing a field clears
its badge. Click **Save Draft** to save and stay on the list, or **Save & Open** to save and
go straight to the new booking's Quotes tab with Build Booking open.

## The booking number

Every booking gets a number in the form `LTT-YYYY-NNNN` — the year it was created and a
sequential number within that year. It is assigned the moment the booking is created and
never changes for the life of the booking, even if the year rolls over or the trip itself
moves to a different year.

## Email-imported enquiries

[[shot:03-needs-review|An imported enquiry flagged for review]]

An enquiry parsed from an inbound email that the parser could not fully resolve is flagged
**Needs Review**. The banner on the enquiry lists exactly what is wrong — a missing field
(no first name, no departure date, no suite count) or a resolution failure (the named train
operator or route doesn't match an active supplier record) or a possible duplicate of an
existing booking. Each reason comes with a fix hint pointing at what to correct.

Once you've checked the parsed fields against the original email and corrected anything
wrong, click **Mark reviewed** to clear the flag. If the import is a bad parse entirely —
garbage text, or clearly not a real enquiry — click **Reject Import** to delete it.

> [!WARNING]
> An unreviewed import blocks every forward stage move. A booking flagged Needs Review
> cannot advance past Enquiry until someone clicks **Mark reviewed**, no matter how complete
> its other fields are.

## Claiming work

An unassigned booking shows **Take** on the booking header — click it to assign the booking
to yourself. Once you own it, the same spot shows **Release** to hand it back to
unassigned. A manager or admin sees **Reassign** instead, letting them move a booking to a
different consultant directly.

## The Enquiry tab, section by section

[[shot:03-enquiry-tab|A populated Enquiry tab]]

Open a booking and select the **Enquiry** tab.

- **Customer Contact** — read-only: First Name, Surname, Email, Phone, Country. Any blank
  field is called out with a warning, since a booking cannot move past Enquiry until all
  five are filled in. Fix them by opening the customer record, not from this card.
- **Journey Details** — Direction, Departure Date, Adults, Children, Child ages, No. of
  Suites. Click **Edit** to change any of these; if the current adult or child count no
  longer matches what was originally requested, a callout says so and points at the Build
  Booking dialog for confirming the suite split still matches.
- **Trip Details** — Purpose, Supplier, Suite Types, Child Ages. Not editable here. A
  supplier or hotel option shown with a warning triangle is the customer's raw wording,
  not yet matched to a database record.
- **Hotel & Additional Services** — Package, Hotel Booking, Hotel, Hotel Timing, Extend
  Stay, Extra Nights, Additional Services, Service Details, Promo Code. Only the fields
  that have a value are shown; the whole card is hidden if none do.

## Requested services

[[shot:03-requested-services|The Requested services readiness panel]]

The **Requested services** panel sits above Email Source / Original Text and is the bridge
between the enquiry and the quote. It is read-only — every change happens in Build Booking —
and has three parts:

- **Booked as** — one row per service actually built on this booking (train, hotel,
  transfers, and so on), with its date, nights, and suite/room count. A row badged
  **Auto-filled** was created automatically from the enquiry and has not yet been reviewed
  by a consultant; a row badged **Not included in quote** exists but is unticked in Build
  Booking. Nothing here is editable — click through to Build Booking to change any of it.
- **Asked for, not built** — things the customer's enquiry mentioned that nothing on the
  booking accounts for yet: a suite count higher than what was built, a suite phrase that
  couldn't be matched to a real suite type, a requested hotel stay with no hotel leg, extra
  nights beyond what the hotel is booked for, or additional services (transfers, rentals,
  tours) with nothing built for them. **Transfers, vehicle rentals, tours and flights are
  never built automatically** — every one of them is a manual add in Build Booking, step 1.
- **Before the quote can go out** — hard blockers: no services built at all, an unresolved
  needs-review flag, a missing customer field, a service with no date, a train leg with no
  route, or a suite/room with no suite type chosen.

The panel's state badge tracks where the booking is: **Not built yet** (nothing exists),
**Auto-filled — needs review** (services exist but a consultant hasn't confirmed them), or
**Confirmed** (a consultant hit Confirm services in Build Booking). The button beside it —
**Start Quote**, **Review services**, or **Open Build Booking** depending on the state — is
the one way to act on anything the panel shows.

> [!NOTE]
> The needs-review banner that used to appear only on email-imported enquiries now shows
> here for every source — a pasted or hand-typed enquiry flagged for review is no longer
> invisible on the job page.

## Original email text

On an enquiry imported from a pasted or emailed draft, the **Original Text** card on the
Enquiry tab shows the source text exactly as received, so you can check any parsed field
against what the customer actually wrote. It only appears when the booking has raw text
attached.

## Start Quote

When the enquiry is ready — no outstanding review flag, customer contact complete — the
**Ready to quote** card appears above the Enquiry tab's other content. Click **Start Quote**.
This creates a draft quote and jumps you straight to the booking's **Quotes** tab with
Build Booking already open, ready to start pricing.

Continue in Chapter 4 for building and sending the quote.
