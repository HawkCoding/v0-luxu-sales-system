# Voucher Reference Documents

This folder holds the canonical visual reference documents for SA-Rail travel vouchers.

## Canonical Reference

**`Travel_Vouchers_(1).docx`** — the approved voucher layout provided by the business. Place the
file here. It is not committed to source control because it is a binary document, but this path
is the agreed location.

## Layout Guidelines (derived from reference document)

All generated voucher PDFs must match this reference:

- Formal black-on-white table layout
- **Header block**: SA-Rail logo area, "A division of Luxus Travel & Tours", service tagline,
  voucher number, title (`TRAVEL VOUCHER`), subtitle, and prepayment note
- **Guest information block**: passenger names, number of guests, special requests, consultant name
- **Modular service blocks** (one per service): rail journey, transfer, accommodation,
  flight-ticket note
- **Footer**: "End of Services" marker and page numbering

## Implementation Notes

Keep the voucher PDF implementation modular. Each service type (rail, hotel, transfer, tour,
airline) must render as an independent block so that new providers can be added without
restructuring the layout.

Reference file: `business_decisions.md` § 5 — Voucher Visual Reference Document Location
