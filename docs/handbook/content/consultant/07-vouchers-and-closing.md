# Vouchers, documents and closing

## Voucher Details first

[[shot:07-voucher-details|The Voucher Details tab with references filled in]]

Every leg on the booking — every train segment, hotel stay, transfer or flight — needs a
**supplier reference number** before a voucher can be generated. This is the field a
consultant hits first, and it lives on its own tab: **Voucher Details**.

Open the booking and select **Voucher Details**. Each leg gets its own card:

- **Reference number** — the supplier's own booking reference. Required.
- **Contact name** — who to ask for at the supplier, e.g. *"Carla"*.
- **Special note for this leg** — anything the guest needs to know that isn't already
  shown elsewhere. It prints on the voucher, under that supplier's details. *"Check in at
  Irene Country Lodge 2 hours before departure"* is the kind of thing that belongs here.

Type into a leg's fields and click **Save** — each leg saves independently. A banner at
the top of the tab counts how many legs are still missing a reference, or confirms all
legs have one.

[[shot:07-missing-reference|Voucher generation blocked by a missing reference]]

> [!STOP]
> A leg with no reference number blocks voucher generation outright: *"Supplier reference
> numbers are missing for: &lt;leg names&gt;."* There is no way around this tab — fill in
> every leg before trying **Generate Voucher**.

## When the voucher becomes available

The **Generate Travel Voucher** card, on the **Documents** tab, only appears once the
booking reaches **Paid in Full**. A voucher is the client's proof of a paid, confirmed
booking — the system will not let you create one for a trip that is still owed money.

If the card is not there, check the booking's stage before checking anything else.

## Generating the voucher

Click **Generate Voucher** to open the dialog.

[[shot:07-generate-voucher|The Generate voucher dialog with the PDF preview]]

1. Click **Generate PDF**. The dialog renders a preview of the voucher inline.
2. Read any amber readiness warnings above the preview — see below.
3. If you correct something on the booking (a leg's contact name, a missing time, a
   supplier's address), reopen the dialog and click **Regenerate PDF** to rebuild the
   preview with the fix.

Readiness warnings do not block generation — they call out details that are missing but
not mandatory, so nothing here stops you from sending. Each one names the affected
leg(s) and where to fix it:

| Warning | Meaning |
|---|---|
| No named contact for … | No **Contact name** set on the Voucher Details tab for that leg |
| No street address for … | The supplier record has no street address (a train is judged on its boarding point instead) |
| No city set for … | The supplier record has no city |
| No time set for … | A train or hotel leg has no start or end time |
| No guest breakdown for … | A train or hotel leg has no adult/child/infant split captured on its suite units |
| No departure time, arrival time or arrival date for … | A flight is missing part of its schedule |
| Missing cabin, airport codes or baggage allowance for … | A flight is missing its printed detail (cabin, airport codes, or baggage) |

## The itinerary

The voucher email always carries two attachments: the travel voucher itself, and a client
itinerary. There is no separate step to build the itinerary — it is generated
automatically the first time it is needed, and reused after that unless the booking's
trip details change enough to require a fresh one.

The client receives both in the one email.

## Sending the voucher

Click **Preview & Send Voucher**, in the same dialog. If the PDF hasn't been generated
yet this click generates it first, then opens the preview.

[[shot:07-send-voucher|Preview and send with voucher plus itinerary attached]]

The **Send travel voucher** preview works the same as every other send dialog in the
system — editable subject and body, a **Preview** and **Edit** tab, a signature choice —
with both the voucher PDF and the itinerary PDF attached.

> [!WARNING]
> Sending the voucher moves the booking to **Voucher Sent** and sets its outcome to
> **Won**. This is the point the system considers the sale closed, not just paid — there
> is no separate "mark as won" step.

> [!WARNING]
> If travel times changed after the voucher was generated, regenerate it before sending.
> Cross-reference Chapter 5.

## The worksheet

[[shot:07-documents-tab|The Documents tab listing generated PDFs]]

**Generate Worksheet**, at the top of the **Documents** tab, produces the booking
worksheet — the internal place-of-record for pax, invoices, payments, suppliers and
gross profit on this booking.

> [!STOP]
> The worksheet is internal only. It is never emailed to a client, and nothing in this
> system offers to send it as one — download it, don't attach it.

## The Documents tab and the Documents library

The **Documents** tab on a booking lists every PDF generated for it — worksheets,
quotes, invoices, vouchers, itineraries — with a generation timestamp on each.

The global **Documents** page, in the sidebar, lists every generated PDF across every
booking. Use it when you know what you're after but not which booking it's on.

[[shot:07-documents-library|The global Documents page with the type filter]]

Search by booking number or customer name, or narrow the list with the filters: document
**type** (Quote PDF, Voucher PDF, Invoice PDF), **supplier**, **consultant**, and a
generated-date range. Click **Download** on any row, or click the row itself to jump to
that booking.

## Attachments

The **Attachments** tab is separate from Documents. Documents are PDFs the system
generates; attachments are files a consultant uploads by hand — a proof of payment, a
signed form, anything else worth keeping against the booking.

To add one: choose a file, pick a **Kind** (Other, Proof of payment, Summary PDF, Invoice
PDF, Quote PDF, Voucher PDF), and click **Upload**. PDF, JPG, PNG, WebP, DOCX or XLSX,
10 MB by default.

Each uploaded file can be downloaded or deleted from the same tab — deleting requires
permission, and is not offered to every role.

## Closing the booking

**Closed** is the last stage. You do not need to move a booking there yourself: the
system closes it automatically seven days after the trip ends. There is no button for it
on the booking.

Nothing about generating or sending documents changes once a booking reaches **Closed** —
the voucher, invoice and worksheet already sent stay exactly as they were sent, and the
Documents and Attachments tabs stay exactly as populated as before. Closed simply marks
the booking as finished business.
