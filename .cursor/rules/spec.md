Below is a **condensed, developer-ready specification** for the **Luxus Travel Sales & Booking System MVP**. It captures the decisions made during the brainstorming phase and structures them so development can begin immediately.

---

# Luxus Travel Sales & Booking System

## Developer Specification (MVP)

## 1. System Purpose

The system manages the full lifecycle of a luxury train travel booking:

1. Capture enquiry
2. Create job
3. Generate quote
4. Accept quote
5. Issue deposit invoice
6. Record payment
7. Issue final invoice
8. Generate travel voucher

Primary goal: **replace manual spreadsheets and invoices with a structured CRM + booking workflow**.

---

# 2. High-Level Architecture

## Architecture Type

**Modern web application**

Frontend

* React / Next.js
* Tailwind UI

Backend

* Supabase (Postgres + Auth + Storage)

Infrastructure

* Vercel hosting
* Supabase database

```
Client Browser
      │
      ▼
Next.js Frontend
      │
      ▼
Supabase API
 ├─ Postgres Database
 ├─ Auth
 ├─ File Storage
```

---

# 3. User Roles

### Salesperson

Can:

* create jobs
* manage customers
* generate quotes
* generate invoices
* record payments
* generate vouchers

Cannot:

* change pricing tables
* edit system settings

---

### Manager / Admin

Can:

* manage suppliers
* manage pricing tables
* configure follow-ups
* edit system settings
* view reporting
* override booking statuses

---

# 4. Core Data Model

## Customer

```
customers
---------
id (uuid)
first_name
last_name
email
phone
company
address
country
notes
created_at
```

---

## Job (Main Booking Record)

```
jobs
---------
id (uuid)
job_number
customer_id
consultant
status
train
route
departure_date
arrival_date
suite_type
adults
children
days
nights
created_at
```

---

## Job Status

```
New Enquiry
Quote Sent
Quote Accepted
Deposit Invoice Sent
Deposit Paid
Booking Made
Final Invoice Sent
Paid in Full
Voucher Sent
Closed
```

---

## Quote

```
quotes
---------
id
job_id
version
quote_date
valid_until
status
subtotal
deposit_amount
currency
created_at
```

Version example

```
BT-2026-0001-Q1
BT-2026-0001-Q2
```

---

## Quote Items

```
quote_items
---------
id
quote_id
description
pax
rate_pp
total
status
```

Status values:

```
Available
Confirmed
Waitlisted
Request Pending
Not Booked
```

---

## Invoice

```
invoices
---------
id
job_id
invoice_number
type
subtotal
deposit_required
amount_received
balance_due
created_at
```

Invoice types

```
Deposit
Final
```

Example numbering

```
BT-2026-0001-INV1
BT-2026-0001-INV2
```

---

## Payments

```
payments
---------
id
invoice_id
amount
payment_method
reference
payment_date
recorded_by
```

Payment methods

```
EFT
Credit Card
Other
```

---

## Suppliers

```
suppliers
---------
id
name
category
contact_person
email
phone
```

Categories

```
Train
Hotel
```

---

# 5. Quote Generation

## Quote Document Fields

Header

* Luxus Travel logo
* Job number
* Quote number
* Quote date
* Consultant name
* Status = **Provisional**

Guest section

* Guest names
* Email
* Phone
* Address
* Country

Travel section

* Train
* Route
* Departure date
* Arrival date
* Suite type
* Adults
* Children
* Nights

Package table

| Pax | Description | Status | PP Rate | Total |

Pricing

* Subtotal
* Deposit required
* Final balance

Footer

* banking details
* company info

---

# 6. Quote Behaviour

Default validity:

```
14 days
```

Stored as:

```
valid_until = quote_date + 14 days
```

Expired quotes:

* remain editable
* show warning

---

# 7. Quote Acceptance

When client accepts:

System automatically:

```
Job Status → Quote Accepted
Generate Deposit Invoice
Send email to client
```

---

# 8. Deposit Handling

Deposit percentage

```
25%
```

Rule:

```
Booking cannot be confirmed
unless deposit_paid = TRUE
```

---

# 9. Voucher Generation

Voucher becomes available when:

```
invoice_balance = 0
```

Voucher button unlocks.

---

# 10. CRM Features

Customer record tracks:

* first travel date
* last travel date
* preferences
* notes

Future use:

* VIP clients
* repeat client filtering

---

# 11. Follow-Up Automation

Follow-up schedule configurable.

Example default:

```
Day 2
Day 5
Day 10
Day 20
```

Follow-ups stop if:

```
quote accepted
email reply detected
salesperson disables
```

---

# 12. Dashboard

Daily overview for staff.

Widgets:

### New Enquiries

jobs created today

### Quotes Awaiting Reply

```
status = Quote Sent
```

---

### Deposits Outstanding

```
status = Deposit Invoice Sent
```

---

### Upcoming Departures

```
departure_date within 30 days
```

---

### Clients Currently Travelling

```
today BETWEEN departure_date AND arrival_date
```

---

# 13. Error Handling

## Validation

Frontend must validate:

```
required fields
date formats
email formats
```

---

## Backend Safeguards

Prevent:

* invoice without quote
* booking without deposit
* voucher without full payment

---

## Database Constraints

Examples

```
NOT NULL
FOREIGN KEYS
UNIQUE(job_number)
```

---

# 14. File Generation

Documents generated as:

```
PDF
```

Stored in:

```
Supabase Storage
```

Folders

```
quotes/
invoices/
vouchers/
```

---

# 15. Security

Authentication handled by:

```
Supabase Auth
```

Access control:

| Role    | Access      |
| ------- | ----------- |
| Sales   | bookings    |
| Manager | full system |

---

# 16. Audit Logging

Log actions:

```
status changes
payments recorded
quote edits
invoice generation
```

Table

```
audit_logs
---------
user_id
action
entity
timestamp
```

---

# 17. Performance Considerations

Indexes required:

```
jobs.job_number
jobs.customer_id
quotes.job_id
invoices.job_id
```

---

# 18. Testing Plan

## Unit Tests

Test:

* quote calculation
* deposit calculation
* payment balance updates

---

## Integration Tests

Test workflow:

```
Create Job
Create Quote
Accept Quote
Generate Deposit Invoice
Record Payment
Generate Final Invoice
Generate Voucher
```

---

## Edge Case Tests

Examples:

* expired quote accepted
* partial payment
* incorrect currency
* duplicate job number

---

# 19. Deployment Pipeline

Recommended flow

```
Local Dev
   ↓
Preview Environment
   ↓
Production
```

Using:

* GitHub
* Vercel

---

# 20. MVP Scope

Included

* CRM
* quoting
* invoicing
* payment tracking
* voucher generation

Excluded (future)

* supplier availability API
* flight booking
* accounting integration
* advanced reporting

---

# 21. Future Enhancements

Possible upgrades

* supplier pricing engine
* automated train availability
* client portal
* automated document emails
* analytics dashboards
