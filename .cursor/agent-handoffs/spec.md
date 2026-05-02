# Luxus Travel Internal Travel Booking System Specification

## 1. Purpose

Build an internal web-based system for Luxus Travel to replace the current manual email, copy/paste, quotation, invoice, payment, and voucher workflow.

The MVP must start with enquiry ingestion, quoting, booking pipeline management, customer/supplier records, payments, invoices, vouchers, reporting, settings, backups, and error handling.

The system must be built for one company initially, but with a hidden/internal `company_id` structure on core records to make future SaaS migration easier.

---

## 2. Core Objectives

### MVP goals

- Ingest travel enquiry emails from monitored mailboxes.
- Parse structured enquiry email bodies from SA-Rail forms.
- Create new enquiries and job cards automatically.
- Allow consultants to claim and manage jobs.
- Generate quotation PDFs and email summaries.
- Manage the booking pipeline from quotation through voucher and closure.
- Store customer and supplier data.
- Store supplier/service rates.
- Calculate package pricing using rate cards, configured package pricing, and applicable markup/supplement rules.
- Generate invoices and payment schedules.
- Track manual payments and proof of payment uploads.
- Generate modular travel vouchers.
- Provide reports and dashboards.
- Provide configurable settings for business rules.
- Maintain audit logs and error logs.
- Support backups and full restore.

---

## 3. System Scope

### In scope for MVP

- SA-Rail enquiry email ingestion.
- Blue Train and Rovos Rail enquiries.
- Email body parsing.
- Customer records.
- Supplier records.
- Supplier/service rates.
- Quote generation.
- Pipeline board.
- Manual payment capture.
- Invoice generation.
- Voucher generation.
- Basic dashboard and reports.
- Admin, Manager, and Consultant roles.
- Settings module.
- Backup and restore.
- Error logging.

### Out of scope for MVP

- WhatsApp sending.
- Payment gateway integration.
- Automatic bank/payment reconciliation.
- Full SaaS multi-tenant UI.
- Generic free-form email parsing.
- Direct website form webhook integration.
- Flight pricing automation.
- Transfer/tour pricing automation.
- Advanced selective backup restore.
- SLA response-time tracking.
- Dormant status automation.

---

## 4. User Roles

### Admin

Full access.

Permissions:

- Manage users.
- Manage system settings.
- Manage company details.
- Manage integrations.
- Manage suppliers.
- Manage rates.
- Manage templates.
- View all jobs.
- Edit all jobs.
- View all reports.
- View audit logs.
- View and resolve error logs.
- Run backup restore.

### Manager

Operational management access.

Permissions:

- Everything consultants can do.
- View and edit all jobs.
- Manage suppliers.
- Manage supplier rates.
- Manage supplier categories.
- Manage email templates.
- View all reports.
- Reassign jobs.
- View audit logs.
- View and resolve error logs.
- Access settings, except where limited to Admin only.

### Consultant

Salesperson / travel consultant.

Permissions:

- View all jobs.
- Edit all jobs.
- Claim unassigned jobs.
- Release their own claimed jobs.
- Generate quotes.
- Send quotes.
- Generate invoices.
- Capture payments.
- Upload attachments.
- Generate vouchers.
- Send vouchers.
- Add internal notes.
- View audit logs.
- Cannot manage global settings.
- Cannot manage supplier categories.
- Cannot create/edit supplier rates.
- Cannot manage users.

### Read-only

View-only internal access.

Permissions:

- View dashboard.
- View enquiries.
- View pipeline.
- View jobs/bookings.
- View customers.
- View quotes.
- View payments.
- View documents.
- View correspondence.
- View suppliers.
- View packages/products.
- View audit logs.
- Cannot create, edit, delete, send, export, or manage settings/users.

---

## 5. Authentication and Security

### Login method

- Email and password login.
- Admin creates user accounts manually.

### Password policy

Standard password policy:

- Minimum 8 characters.
- Must include at least one number.
- Must include at least one special character.

### Account protection

- No failed-login lockout in MVP.
- No 2FA in MVP.

### Session timeout

Configurable in settings.

Allowed timeout options:

- 15 minutes
- 30 minutes
- 1 hour
- 2 hours

---

## 6. Company / SaaS Readiness

### MVP company model

- System is built for one company only: Luxus Travel.
- However, core records must include hidden/internal `company_id`.

### Core records requiring `company_id`

- Users
- Customers
- Jobs
- Enquiries
- Quotes
- Invoices
- Payments
- Vouchers
- Suppliers
- Supplier products
- Rates
- Templates
- Settings
- Error logs
- Audit logs
- Attachments

### UI

- MVP UI only exposes Luxus Travel.
- No multi-company selector in MVP.

---

## 7. Inbound Enquiry Ingestion

### Ingestion method

MVP uses inbox parsing.

The system monitors configured mailboxes via IMAP using stored username/password or app password.

Sync schedule:

- Run automatic inbound email sync once daily in MVP.
- Manual `Sync now` can be available in Settings for administrators.
- A shorter sync interval, such as every 10 minutes, is a future enhancement and may require upgrading the hosting plan/tier.

### Monitored mailboxes

Initial examples:

- `info@sa-rail.co.za`
- `reservations1@sa-rail.co.za`
- `reservations2@sa-rail.co.za`
- `reservations3@sa-rail.co.za`
- `reservations4@sa-rail.co.za`

This list must be configurable because mailboxes may change.

### Mailbox settings

Each monitored mailbox should store:

- Display name
- Email address
- IMAP host
- IMAP port
- Username
- Password / app password
- SSL/TLS enabled
- Active/inactive flag
- Last successful sync timestamp
- Last error, if any

### Email handling after ingestion

After successful parsing and job creation:

- Mark email as read.
- If the import is complete, move email to folder: `Processed`.
- If the import needs review, move email to folder: `Needs Review`.
- If folders do not exist, system must create them automatically when the mail server supports folder creation.
- If moving the email fails after booking creation, keep the booking, mark the inbound message as filing failed, and expose it for follow-up without creating a duplicate booking.

### Duplicate detection

Use the current IMAP-first duplicate strategy:

1. Exact mailbox fetch duplicate check:
   - Same email account
   - Same `UIDVALIDITY`
   - Same IMAP UID
2. Possible duplicate booking flag:
   - Similar customer email, or
   - Similar customer name/contact details, and
   - Similar recent trip/enquiry context

If the exact mailbox fetch duplicate is detected:

- Do not create a new enquiry/job.
- Log duplicate event internally.
- Do not show as error unless duplicate handling fails.

If a possible duplicate booking is detected:

- Still create the enquiry/job.
- Flag it as a possible duplicate for staff review.
- Link to the suspected duplicate booking where possible.
- Log the warning internally.

---

## 8. Supported Enquiry Variants

### MVP variants

1. Blue Train enquiry
2. Rovos Rail enquiry

### Source

- 99% of enquiries come from SA-Rail website forms.
- Focus on SA-Rail first.

### Email format

- Email body is structured with field labels and values.
- There are known variants depending on selected train/product.
- Parser must support minor field differences between Blue Train and Rovos Rail.

---

## 9. Canonical Enquiry Fields

### Required fields

These are required for a complete booking, but missing fields must not block early workflow actions.

- Purpose of request
- Title
- First name
- Surname
- Contact number
- Email address
- Country
- Train product
- Direction / route
- Departure date
- Number of adults
- Number of suites
- Suite type(s)
- Package option for Blue Train
- Terms and conditions accepted

### Optional fields

- Province
- Number of children
- Complimentary hotel booking type
- Complimentary hotel option
- Flight booking required
- Flight route
- Flight departure date
- Additional travel services required

### Purpose of request values

Allowed values:

- Quote
- Availability
- Reservation

The workflow is the same for all three. The selected purpose appears as a label on the enquiry/job card.

---

## 10. Missing Required Fields

If one or more required fields are missing:

- The job is still created.
- Email-imported jobs are marked as `Needs Review` when required or expected fields are missing, low-confidence, or require staff confirmation.
- Missing fields are highlighted on the enquiry/job card.
- A visible review warning appears on the job card.
- `Needs Review` jobs cannot move beyond the early enquiry/quote preparation workflow until review is resolved.
- Forward pipeline movement also requires core customer contact fields to be complete.

### Hard gate

The system must block:

- Forward movement from `Needs Review` until review is resolved
- Voucher generation
- Voucher sending

Forward movement remains blocked until the required review/customer fields are completed.

Voucher generation and sending remain blocked until all required booking/customer fields are completed and the voucher payment gate is satisfied.

---

## 11. New Enquiries Page

### Purpose

New enquiries must first appear on a separate `New Enquiries` page.

### Behaviour

- Enquiries are not immediately shown on the pipeline.
- A consultant must open the enquiry, take ownership, and click `Start Quote`.
- Once `Start Quote` is clicked, the job moves into the pipeline.

### Job ownership

- Jobs are unassigned by default.
- A consultant clicks `Take Ownership`.
- Once claimed, the job is owned by that consultant.
- Consultants can release a job voluntarily.
- Admin/Manager can force reassignment.

---

## 12. Job Numbering

### Format

Use product prefix + year + product-specific sequence.

Examples:

- `BT-2026-0001`
- `RR-2026-0001`

### Product prefixes

- Blue Train: `BT`
- Rovos Rail: `RR`

### Sequence scope

- Sequence resets per product per year.
- Blue Train and Rovos Rail each have separate counters.

### Creation trigger

Job number is created immediately when the enquiry email is ingested and the job card is created.

Implementation note:

- Current app data may need migration from global `LUX-YYYY-######` booking numbers to this product-specific numbering model.

---

## 13. Pipeline

### Pipeline visibility

The visible pipeline starts only after enquiry processing.

Pre-pipeline:

- New enquiry
- Quote preparation

These are handled internally or on the New Enquiries page.

### Visible pipeline stages

Use the current app pipeline stage model:

1. Quote Sent
2. Quote Accepted
3. Deposit Invoice Sent
4. Deposit Paid
5. Paid in Full
6. Voucher Sent

Additional lifecycle states:

- Enquiry is handled before the visible pipeline.
- Closed is the final completed state.
- Lost is used for cancelled/lost bookings and is outside the active pipeline board.

### Pipeline board

- Consultants see a Kanban-style pipeline board.
- Consultants can view and edit all jobs.
- Pipeline movement must be logged in audit history.

---

## 14. Outcomes and Closing Jobs

### Outcome field

Each job has an `Outcome` field.

Allowed values:

- Open
- Won
- Lost
- Cancelled

Default:

- Open

### Outcome Reason

When a job is marked as Lost or Cancelled, `Outcome Reason` is required.

Reason input:

- Dropdown list.
- Includes `Other`.
- If `Other` is selected, free-text reason is required.
- Admin/Manager can add more dropdown options in Settings.

### Dormant

Do not include `Dormant` as an outcome.

### Inactivity

No automatic lost/dormant suggestion based on inactivity.

---

## 15. Audit Log

### Visibility

All logged-in staff/users can see audit logs.

### Retention

Active audit logs are retained for 24 months.

Older audit logs may be archived rather than deleted.

Audit logs are read-only for all staff. Admin/Manager tooling may include archival/system maintenance actions, but normal users must not edit audit history.

### Logged events

The system must log these major events:

- Ownership taken
- Ownership reassigned
- Pipeline status changed
- Quote generated
- Quote sent to customer
- Customer accepted quote
- Deposit request sent
- Deposit marked accepted/paid
- Booking made
- Supplier invoice/reference captured
- Invoice sent to customer
- Invoice marked paid
- Voucher generated
- Voucher sent
- Attachments uploaded/added

### Not logged as major timeline events

- Enquiry email ingested
- Internal notes added

Field changes must still be stored in the audit log, especially:

- Edited enquiry fields
- Price changes
- Quote edits
- Payment edits
- Supplier/rate edits
- Settings changes

---

## 16. Customer CRM

### Customer matching

When a new enquiry is ingested:

- Match by email address only.
- If email exists, link job to existing customer.
- If email does not exist, create new customer.

### Customer profile fields

Basic fields:

- Title
- First name
- Surname
- Email
- Phone number
- Country
- Province

Optional CRM fields:

- Birthday
- Frequent traveler / VIP flag
- Preferences
- Notes
- First travel date
- Last travel date

### Preferences

Preferences are stored as free-text notes.

Example:

- `Prefers deluxe suites and ocean-view hotels.`

### First and last travel date

These are based on train departure date.

Update rule:

- When a job reaches `Voucher Sent`, it counts as a completed trip.
- If this is the customer’s first completed trip, set `First Travel Date`.
- Every completed trip updates `Last Travel Date`.

### Repeat client flag

When a new enquiry arrives from an existing customer:

- If customer has at least one previous completed trip, automatically mark the job as `Repeat Client`.

---

## 17. Supplier Management

### Supplier structure

Use supplier company records.

A supplier can have multiple products/services underneath it.

Example:

- Supplier: Blue Train
  - Route product: Pretoria → Cape Town
  - Route product: Cape Town → Pretoria

- Supplier: Rovos Rail
  - Route product: Pretoria → Victoria Falls
  - Route product: Pretoria → Durban
  - Route product: Pretoria → Cape Town

- Supplier: Radisson Blu
  - Hotel product / room categories / room options

### Supplier categories

MVP categories:

- Train
- Hotel
- Transfers
- Tours
- Airlines

System should model these as supplier kinds/categories and allow future expansion if needed.

### Who can manage categories

- Admin
- Manager

### Supplier fields

MVP supplier record contains:

- Supplier name
- Category
- Email
- Phone
- Website, optional
- Location, optional
- Notes, optional

---

## 18. Train Products

### Train product model

Each direction is its own route product.

Example:

- Pretoria → Cape Town
- Cape Town → Pretoria

These are separate route products with separate rates.

### Suite types

Suite types are defined per train supplier.

Examples:

Blue Train suite types may differ from Rovos Rail suite types.

### Suite quantity handling

- Enquiry can support up to 10 suites.
- Each suite must be explicitly listed.
- Fields may appear as:
  - Suite Type 1
  - Suite Type 2
  - ...
  - Suite Type 10

### Adult distribution

- Adults are not assigned per suite.
- Store total adults only.

### Children

- Children are stored if present.
- Children require manual quote adjustment by consultant.
- Children are not automatically priced in MVP.

---

## 19. Hotel Products

### Hotel model

Hotel suppliers have room categories and occupancy types.

Room structure:

- Room Category:
  - Standard
  - Deluxe
  - Ocean View
  - etc.

- Occupancy Type:
  - Single
  - Double
  - Family
  - etc.

Rates are stored per combination:

- Hotel
- Room Category
- Occupancy Type
- Meal plan/service option where applicable
- Valid From
- Valid To
- Quoting rate

### Complimentary hotel nights

Default:

- 1 night included.

This is editable per job card.

### Hotel pricing

Hotels use period-based rate cards.

Hotel rates are per room per night.

---

## 20. Supplier Rates and Pricing

### Rate storage

Pricing must be stored in separate rate tables, linked to supplier products/services.

Do not store prices directly on the supplier company table.

### Rate currency

Supplier rates default to ZAR, but the pricing model may support additional configured currencies where required by suppliers/products.

### Rate price type

Store the usable rate card price for quoting.

The app may support both component-based pricing from rate cards and fixed package prices.

Markup and supplement rules can be stored on supplier/package/product records where the product requires them.

### VAT

Prices are stored and shown VAT-inclusive only.

### Rounding

No rounding. Use exact calculated value.

### Markup

Markup or supplement rules are stored per product/supplier/package where applicable.

Examples:

- Blue Train product markup %
- Rovos Rail product markup %
- Specific hotel product markup %
- Package fixed price per person
- Single supplement %
- Child and infant price where explicitly configured

Consultants cannot override markup on individual quotes.

### Seasonal pricing

Use period-based rate cards.

Each rate card has:

- Valid From
- Valid To, optional/open-ended
- Route/service
- Suite/room/vehicle/cabin/tour type as applicable
- Price fields required by the supplier kind

Season labels are optional business labels, not required pricing keys.

### Rate validity

Each rate can have:

- Valid From
- Valid To

Rules:

- Valid To may be open-ended.
- System must prevent overlapping rate records for the same:
  - Route
  - Suite/room/vehicle/cabin/tour type or equivalent pricing option
  - Valid period

### Rate selection

Default selection:

- System selects rate based on departure date matching:
  - Valid From
  - Valid To

Consultant may manually override selected rate.

Any override must be logged.

---

## 21. Package Pricing and Quotation Calculation

### Package model

Quotes show package line items, but the customer sees only one final package total.

Line items may include:

- Train journey
- Complimentary hotel stay
- Selected extras
- Flights, if selected
- Additional services, if selected

### Pricing source of truth

System supports both:

1. Stored package price.
2. Calculated price from components.

At quote generation, consultant chooses which total to use:

- Stored package price
- Calculated component total

The system must record which pricing source was used.

### Component calculation

Calculated total = selected package/rate-card components plus configured markup, supplement, child, infant, and fixed package pricing rules where applicable.

### Children

If children are included, the consultant manually adjusts the quote.

---

## 22. Quote Document

### Format

Quote is sent as:

- Formatted email summary
- Attached PDF document

### Quote title

Document title:

- `PROVISIONAL QUOTATION`

### Quote status label

Always show:

- `STATUS: Provisional`

### Currency

- Default currency is ZAR.
- Quote currency follows the selected package/rate-card currency where non-ZAR pricing is intentionally configured.

### Quote validity

- Configurable in settings.
- Default: 30 days.
- If quote passes validity date, no automatic status change.
- Validity date is informational.

### Quote versioning

- Quotes are versioned.
- Quote numbers use the booking/job number plus a quote version suffix.
- Example: `BT-2026-0001-Q1`, `BT-2026-0001-Q2`.
- Resending after meaningful quote changes creates or advances the quote version.
- Previous quote versions remain available for audit/history.
- All changes are logged in the audit log.

Implementation note:

- Current app code must be updated to use the 30-day default validity period and quote versioning.

### Quote acceptance

Customer may accept by:

- Clicking an `Accept Quote` link/button.
- Replying to email, after which consultant manually marks quote accepted.

### Accept Quote button behaviour

When customer clicks Accept:

- Move job to `Quote Accepted` internally.
- Automatically generate a deposit invoice.
- Notify the assigned consultant.

Note: Even though the visible pipeline begins at `Quote Sent`, internal state should support quote acceptance.

---

## 23. Quote Layout

The quote should be inspired by the current invoice layout.

### Header

- Luxus Travel logo
- Brand line, e.g. Blue Train / Rovos Rail / Kruger Shalati
- Job number
- Quote number
- Quote date
- Consultant name
- Title: `PROVISIONAL QUOTATION`
- Status: `Provisional`

### Guest information

- Guest name(s)
- Company, optional
- Email
- Phone
- Country
- Address, if available

### Travel details

- Train
- Tour / package
- Route
- Departure date
- Arrival date
- Suite type(s)
- Number of adults
- Number of children
- Days/nights
- Departure time
- Arrival time
- Suite quantity

### Package table

Columns:

- Pax
- Travel Package Description
- Status
- PP Rate
- Total

Status options:

- Available
- Confirmed
- Waitlisted
- Request Pending
- Not Booked

### Pricing section

- Subtotal incl. VAT
- Deposit required
- Final balance due
- Amount received
- Outstanding amount

For quotation stage:

- Amount received is normally zero.
- Outstanding amount is full quote amount.

### Payment instructions

Configurable company banking details:

- Account holder
- Bank
- Account number
- Branch code
- SWIFT code, if used

### Footer

- Address
- Contact details
- Website
- Company registration
- VAT number
- Logos/brand marks, configurable

---

## 24. Email Sending

### Sender identity

System supports both options:

- Send from assigned consultant’s email address.
- Send from central company email.

This should be selectable per email/job.

### MVP uncertainty

Outbound consultant-mailbox integration still requires confirmation of actual mailbox provider/server details.

Known information:

- Email addresses use `@luxustravel.co.za`.
- Staff use Outlook desktop.
- It is not yet confirmed whether mailboxes are hosted on Microsoft 365 Exchange Online or another IMAP/SMTP provider.

### Implementation recommendation

Implement email sending adapter abstraction:

- `EmailProviderInterface`
  - `sendEmail()`
  - `connectMailbox()`
  - `refreshAuth()`, if OAuth
  - `testConnection()`

Support initially:

1. SMTP sending using stored credentials.
2. Microsoft Graph OAuth if confirmed Exchange Online.

### System-generated emails

Store only:

- Timeline item
- Subject
- Timestamp
- Recipients

Do not store full email body in timeline for MVP.

### Email templates

Predefined templates managed in settings:

- Quote emails
- Follow-ups
- Deposit requests
- Payment reminders
- Voucher emails

Template editing permissions:

- Admin
- Manager

---

## 25. Follow-Up Emails

### Quote follow-ups

System supports automatic follow-up emails after quote is sent.

Settings:

- Enable/disable auto follow-ups.
- Configure follow-up intervals using tickboxes.
- Multiple follow-ups supported.

### Stop rules

Follow-ups stop when:

- Job moves past Quote Sent / quote is accepted.
- Consultant manually disables follow-ups on that job.

---

## 26. Booking and Reservation Flow

### Main flow

1. Enquiry is ingested.
2. Enquiry appears on New Enquiries page.
3. Consultant claims enquiry.
4. Consultant clicks Start Quote.
5. Consultant prepares quote.
6. Quote is sent.
7. Job enters visible pipeline at `Quote Sent`.
8. Client accepts quote.
9. Job moves to `Quote Accepted`.
10. Deposit invoice is generated and sent.
11. Job moves to `Deposit Invoice Sent`.
12. Deposit is recorded.
13. Job moves to `Deposit Paid`.
14. Final payment is recorded.
15. Job moves to `Paid in Full`.
16. Voucher is generated.
17. Voucher is sent.
18. Job moves to `Voucher Sent`.
19. Job is closed when the booking lifecycle is complete.

---

## 27. Deposit Handling

### Deposit percentage

- Configurable in settings.
- Default: 25%.
- Editable per quote.

### Deposit invoice

Generated automatically when customer accepts quote using the Accept Quote button.

### Deposit due date

Configurable in settings and editable per quote.

Recommended MVP default:

- 14 days before train departure.

### Deposit reminders

- One automatic deposit reminder.
- Default: 1 day before due date.
- Sent only if deposit is not marked as paid.

---

## 28. Final Payment Handling

### Final payment due rule

- Configurable in settings.
- Based on X days before departure.
- Editable per quote/booking.

### Overdue payment handling

If deposit or final payment becomes overdue:

- System flags payment as overdue.
- System sends automatic email reminder to client.

---

## 29. Payment Capture

### MVP method

Payments are captured manually by consultant.

Required fields:

- Amount
- Payment date
- Reference number
- Payment method

Optional:

- Upload proof of payment.

### Payment methods

Dropdown values:

- Bank transfer / EFT
- Credit card
- Other

### Proof of payment

- Consultant can upload proof of payment file.
- File is stored against the job/payment record.
- Upload appears as attachment event in timeline.

---

## 30. Invoice Generation

### Trigger

Invoice is generated manually when consultant clicks `Generate Invoice`.

### Invoice numbering

Use job number + invoice suffix.

Example:

- `BT-2026-0001-INV1`
- `BT-2026-0001-INV2`

### Multiple invoices

Allow multiple invoices per job.

Use cases:

- Deposit invoice.
- Final invoice.
- Additional invoice.

---

## 31. Voucher Generation

### Trigger

Voucher button becomes available only when:

- Invoice Paid = Yes
- Full payment is captured
- Invoice balance is zero
- All required fields are completed

### Voucher number

System generates its own voucher number.

Supplier references appear inside individual service blocks.

### Voucher model

Use modular service blocks.

This is based on the uploaded real voucher document, which includes a branded header, guest information, and repeated supplier-specific service blocks for train, transfer, hotel, and additional services. :contentReference[oaicite:0]{index=0}

### Voucher structure

#### Header

- Company logo
- Company banner / branding strip
- Company division line
- Product branding
- Title: `TRAVEL VOUCHER`
- Voucher number

#### Instruction block

- Please hand to your service provider.
- Pre-payment was made by Luxus Travel & Tours for all services mentioned.
- Guests must settle extras directly with service providers.

#### Guest information

- Guest names
- Number of guests
- Special requests
- Occasion, if applicable
- Consultant name

#### Service blocks

Each service block should have:

- Supplier/service name
- Supplier contact details
- Supplier reference number
- Relevant service details
- Requests
- Notes/instructions

Service block types:

1. Train
2. Hotel
3. Transfer
4. Tour / Expedition
5. Other service

MVP supplier database supports Train, Hotel, Transfers, Tours, and Airlines. Voucher service blocks must support these service types and remain extensible for future supplier kinds.

#### Train service block fields

- Train name
- Supplier contact details
- Supplier reference number
- Supplier contact person/user
- Route
- Departure date and time
- Arrival date and time
- Check-in instructions
- Suite type
- Quantity
- Adults
- Children
- Meal basis
- Requests
- Occasion

#### Hotel service block fields

- Hotel name
- Contact details
- Hotel description
- Supplier reference number
- Number of guests
- Arrival date/time
- Departure date/time
- Room category
- Occupancy type
- Quantity
- Meal basis
- Requests/occasion

#### Transfer/tour service block fields

- Supplier name
- Contact details
- Emergency contact
- Supplier reference number
- Number of guests
- Pickup location/date/time
- Drop-off location
- Vehicle type
- Driver instructions
- Requests

#### Footer

- End of Services
- Optional extra notes, e.g. flights issued separately

---

## 32. Cancellation and Refund Handling

### Cancellation handling

If client cancels after accepting quote:

- System provides `Cancel Booking` action.
- Consultant must select cancellation reason.
- Consultant must confirm final action before booking is closed/lost.
- After confirmation:
  - Job outcome becomes Cancelled or Lost.
  - Reason is recorded.
  - Audit log records the cancellation.

### Cancellation rules

Rules are per product.

Cancellation fee structure:

- Fixed percentage regardless of timing.

Example:

- Blue Train cancellation fee: X%
- Rovos Rail cancellation fee: Y%

Actual percentages are configured per product.

### Refund handling

System calculates refund based on product cancellation percentage.

Consultant confirms and records refund payment.

Refund record fields:

- Refund amount
- Refund date
- Refund method
- Reference number
- Notes
- Processed by

---

## 33. Attachments and Notes

### Attachments

System allows file attachments on a job.

Examples:

- PDFs
- Supplier confirmations
- Proof of payment
- Client documents
- Reservation forms

Attachments uploaded are logged as timeline events.

### Notes

All notes are internal only.

No separate client-facing notes in MVP.

Internal notes are not included in the major-events timeline.

---

## 34. Search

### Search level

Advanced search + filters.

Search by:

- Customer name
- Email
- Job number
- Date range
- Product
- Status
- Salesperson/consultant

---

## 35. Dashboard and Reporting

### Dashboard level

Dashboard + simple reports.

### Reports required

- Total enquiries
- Quotes sent
- Bookings confirmed
- Estimated revenue
- Sales per salesperson
- Conversion rate: enquiry to booking
- Revenue per product
- Product performance: Blue Train / Rovos Rail
- Customer reports
- Supplier reports
- Staff performance

### Reporting date basis

Use metric-specific date mapping:

- Enquiries: enquiry date
- Quotes sent: quote sent date
- Conversion rate: enquiry date to booking confirmed date
- Revenue / sales performance: booking confirmed date
- Future operations: travel departure date

### Report filters

Reports must support:

- Date range
- Salesperson
- Product
- Booking status

### Export

Reports can be exported to:

- Excel/CSV
- PDF

---

## 36. Settings Module

Settings structure is approved.

### 36.1 Company Settings

Manage:

- Company name
- Logo
- Branding/banner
- Company contact details
- Address
- Website
- VAT number
- Company registration number
- Banking details
- Footer logos/brand marks

### 36.2 Email Settings

Manage:

- Email templates
  - Quote
  - Follow-ups
  - Deposit request
  - Payment reminder
  - Voucher email
- Sender options
  - Company email
  - Consultant email
- Inbound monitored mailboxes
- Outbound email connection settings
- Template variables

### 36.3 Quote and Sales Settings

Manage:

- Default quote validity: 30 days
- Quote versioning rules
- Enable/disable automatic follow-ups
- Inbound email sync schedule: daily in MVP
- Follow-up intervals using tickboxes
- Accept Quote link/button settings
- Outcome reasons
- Cancellation reasons

### 36.4 Payment Settings

Manage:

- Default deposit percentage: 25%
- Deposit due rule
- Final payment due rule
- Payment methods
- Overdue reminder settings

### 36.5 Supplier and Pricing Settings

Manage:

- Supplier categories
- Season definitions:
  - Season
  - Off-season
  - Standard
- Product markups, supplements, child/infant pricing, and fixed package pricing where applicable
- Cancellation fee percentage per product

### 36.6 User and Security Settings

Manage:

- Users
- Roles
  - Admin
  - Manager
  - Consultant
  - Read-only
- Password policy
- Session timeout:
  - 15 minutes
  - 30 minutes
  - 1 hour
  - 2 hours

### 36.7 System Settings

Manage:

- Backup and restore
- Error logs
- Audit log retention: active audit logs retained for 24 months
- System health/status

---

## 37. Error Handling

### Error strategy

Errors must be:

- Logged.
- Visible in Settings → Error Log.
- Shown with a badge indicator on Settings when unresolved/new errors exist.

### Severity levels

Use:

- Critical
- Warning
- Info

### Error resolution

Users can mark errors as Resolved.

No resolution note required in MVP.

### Example errors

Critical:

- Mailbox cannot connect.
- Email sync failed.
- Quote PDF generation failed.
- Invoice generation failed.
- Voucher generation failed.
- Backup failed.
- Restore failed.

Warning:

- Required field missing.
- Date could not be parsed.
- Rate not found.
- Duplicate email detected.
- Email moved to processed folder failed.
- Email sent but timeline update failed.

Info:

- Duplicate ignored.
- Follow-up skipped because job progressed.
- Reminder skipped because payment already marked paid.

---

## 38. Backup and Recovery

### Backup frequency

Automatic backup every 24 hours.

### Retention

Keep backups for 14 days.

### Restore

Full system restore only.

Admin/Manager can restore from a selected backup in Settings.

### Restore warning

Before restore, system must warn:

- Entire database will roll back.
- Changes after selected backup will be lost.
- User must confirm before restore.

Selective restore is out of scope for MVP.

---

## 39. Technical Architecture

### Recommended application architecture

Use a standard web application architecture:

- Frontend web app
- Backend API
- Relational database
- Background worker/queue
- File storage
- Email ingestion service
- PDF/document generation service

### Suggested stack

The exact stack can be chosen by the developer, but the system should support:

- Modern frontend framework
- Backend API with role-based access control
- PostgreSQL or equivalent relational database
- Background jobs for:
  - Email sync
  - Follow-ups
  - Payment reminders
  - PDF generation
  - Backups
- Object/file storage for:
  - Attachments
  - PDFs
  - Proofs of payment
  - Generated vouchers

### Environments

Use:

- Development
- Production

No staging environment in MVP.

### Hosting

Cloud hosting.

Examples:

- AWS
- Azure
- DigitalOcean
- Render
- Railway
- Similar cloud provider

---

## 40. Suggested Data Model

This is a high-level relational data model.

### companies

- id
- name
- created_at
- updated_at

### users

- id
- company_id
- name
- surname
- email
- password_hash
- role: admin / manager / consultant
- active
- session_timeout_preference
- created_at
- updated_at

### monitored_mailboxes

- id
- company_id
- email_address
- display_name
- imap_host
- imap_port
- username
- encrypted_password
- use_ssl
- active
- processed_folder_name
- last_sync_at
- last_error
- created_at
- updated_at

### inbound_emails

- id
- company_id
- mailbox_id
- message_id
- subject
- from_email
- received_at
- raw_body
- parse_status
- duplicate_of_id
- created_at

### enquiries

- id
- company_id
- inbound_email_id
- job_id
- purpose
- train_product
- route
- departure_date
- title
- first_name
- surname
- contact_number
- email
- country
- province
- adults
- children
- number_of_suites
- package_option
- hotel_booking_type
- hotel_option
- flight_booking_required
- flight_route
- flight_departure_date
- additional_services_required
- terms_accepted
- missing_required_fields_json
- created_at
- updated_at

### enquiry_suites

- id
- enquiry_id
- suite_number
- suite_type
- created_at

### customers

- id
- company_id
- title
- first_name
- surname
- email
- phone
- country
- province
- birthday
- vip_flag
- preferences
- notes
- first_travel_date
- last_travel_date
- created_at
- updated_at

### jobs

- id
- company_id
- customer_id
- enquiry_id
- job_number
- product_prefix
- year
- sequence_number
- owner_user_id
- pipeline_status
- internal_status
- purpose_label
- outcome
- outcome_reason_id
- outcome_reason_other_text
- repeat_client_flag
- quote_followups_enabled
- created_at
- updated_at

### job_status_history

- id
- job_id
- from_status
- to_status
- changed_by_user_id
- changed_at

### suppliers

- id
- company_id
- name
- category_id
- contact_person
- email
- phone
- created_at
- updated_at

### supplier_categories

- id
- company_id
- name
- active
- created_at
- updated_at

### supplier/service model

Use one supplier/service model across trains, hotels, transfers, tours, and airlines.

### supplier_kinds

Supported initial values:

- train_operator
- hotel_property
- transfers
- tour_operator
- airline

### suite_types / pricing_options

- id
- company_id
- supplier_id
- name
- passenger_capacity, where applicable
- luggage_capacity, where applicable
- description
- active
- created_at
- updated_at

The UI vocabulary changes by supplier kind:

- Train: Suite Type
- Hotel: Room Type
- Transfers: Vehicle Type
- Airline: Cabin
- Tour operator: Tour Type

### routes / services

- id
- company_id
- supplier_id
- name
- origin_location_id, where applicable
- destination_location_id, where applicable
- pickup_point, where applicable
- dropoff_point, where applicable
- transport_service_type, where applicable
- active
- created_at
- updated_at

The UI vocabulary changes by supplier kind:

- Train/Airline: Route
- Hotel: Meal Plan
- Transfers: Service
- Tour operator: Itinerary

### packages

- id
- company_id
- name
- slug
- description
- duration_nights
- currency
- single_supplement_pct
- fixed_price_per_person, optional
- active
- created_at
- updated_at

### package_legs

- id
- company_id
- package_id
- supplier_id
- label
- sort_order
- created_at

### package_leg_routes

- package_leg_id
- route_id
- created_at

### rate_cards

- id
- company_id
- route_id
- suite_type_id / pricing_option_id
- price_per_person or equivalent supplier-kind price
- child_price, optional
- infant_price, optional
- currency
- valid_from
- valid_to
- created_at

### quotes

- id
- company_id
- job_id
- quote_number
- title
- status_label
- pricing_source: stored_package / calculated_components
- subtotal_amount
- deposit_percentage
- deposit_amount
- total_amount
- amount_received
- outstanding_amount
- validity_date
- pdf_file_id
- sent_at
- accepted_at
- created_at
- updated_at

### quote_line_items

- id
- quote_id
- description
- pax
- status
- pp_rate
- total
- display_order

### invoices

- id
- company_id
- job_id
- invoice_number
- invoice_type
- amount
- due_date
- status
- pdf_file_id
- sent_at
- paid_at
- created_at
- updated_at

### payments

- id
- company_id
- job_id
- invoice_id
- amount
- payment_date
- reference_number
- payment_method
- proof_file_id
- captured_by_user_id
- created_at
- updated_at

### refunds

- id
- company_id
- job_id
- amount
- refund_date
- refund_method
- reference_number
- notes
- processed_by_user_id
- created_at

### vouchers

- id
- company_id
- job_id
- voucher_number
- pdf_file_id
- generated_at
- sent_at
- created_by_user_id

### voucher_service_blocks

- id
- voucher_id
- service_type
- supplier_id
- title
- supplier_reference
- contact_details
- service_data_json
- display_order

### attachments

- id
- company_id
- job_id
- file_name
- file_type
- file_url
- uploaded_by_user_id
- created_at

### email_templates

- id
- company_id
- template_type
- name
- subject
- body
- active
- created_at
- updated_at

### audit_logs

- id
- company_id
- user_id
- entity_type
- entity_id
- action
- old_value_json
- new_value_json
- created_at

### error_logs

- id
- company_id
- severity
- source
- message
- details_json
- resolved
- resolved_by_user_id
- resolved_at
- created_at

### settings

- id
- company_id
- key
- value_json
- updated_by_user_id
- updated_at

---

## 41. Background Jobs

Required background workers:

### Email ingestion worker

Runs once daily in MVP.

Note:

- A shorter interval, such as every 10 minutes, is a future enhancement and may require upgrading the hosting plan/tier.

Tasks:

- Connect to active monitored mailboxes.
- Fetch matching read or unread messages from the configured inbox.
- Parse known enquiry formats.
- Create enquiry/job.
- Move complete imports to `Processed`.
- Move imports needing review to `Needs Review`.
- Ignore unmatched emails.
- Log errors.

### Follow-up worker

Runs periodically.

Tasks:

- Find quote follow-ups due.
- Send emails if enabled.
- Stop follow-ups if job progressed or disabled.

### Payment reminder worker

Runs periodically.

Tasks:

- Identify overdue or upcoming deposit/final payments.
- Send reminders based on configured rules.
- Mark payment as overdue where needed.

### Backup worker

Runs every 24 hours.

Tasks:

- Create full database backup.
- Store backup securely.
- Delete backups older than 14 days.

### Error badge calculation

Can be dynamic or cached.

Criteria:

- Badge appears if unresolved errors exist.

---

## 42. Required UI Pages

### Login

- Email
- Password
- Forgot password optional/future

### Dashboard

- Kanban pipeline
- Summary metrics
- Filters

### New Enquiries

- List of parsed enquiries
- Missing field indicators
- Take ownership
- Start Quote

### Job Card

Sections:

- Header with job number, owner, status, outcome
- Customer info
- Enquiry details
- Missing required field warning
- Quote section
- Invoice section
- Payment section
- Voucher section
- Attachments
- Internal notes
- Timeline
- Audit log

### Customers

- Search/list
- Customer profile
- Booking history
- Preferences/notes
- First/last travel date
- VIP flag

### Suppliers

- Supplier list
- Supplier details
- Products/routes
- Suite types
- Hotel rooms
- Rates
- Markup %
- Cancellation fee %

### Reports

- Dashboard metrics
- Sales per salesperson
- Conversion rate
- Revenue per product
- Export Excel/CSV
- Export PDF

### Settings

Sections:

- Company settings
- Email settings
- Quote and sales settings
- Payment settings
- Supplier and pricing settings
- User and security settings
- System settings
- Backup and restore
- Error logs

---

## 43. Testing Plan

## 43.1 Unit Tests

### Parser tests

Test Blue Train email parsing:

- Extract purpose.
- Extract customer details.
- Extract route.
- Extract departure date.
- Extract adults.
- Extract suites.
- Extract suite type.
- Extract hotel.
- Extract package option.
- Extract flight details.
- Extract terms accepted.

Test Rovos Rail email parsing:

- Extract purpose.
- Extract personal contact information.
- Extract route.
- Extract date field variants.
- Extract suite type.
- Extract hotel booking type.
- Extract hotel option.
- Extract additional service response.

Test parser edge cases:

- Missing required field.
- Extra blank lines.
- Unexpected casing.
- Date with asterisk.
- Date in different readable formats.
- Duplicate labels.
- Unknown field.

### Job number tests

- Blue Train counter increments independently.
- Rovos counter increments independently.
- Counter resets by year.
- Job number generated on ingestion.

### Customer matching tests

- Existing email links to customer.
- New email creates customer.
- Same name different email creates new customer.

### Pricing tests

- Correct rate card selected by departure date.
- Fixed package price used when configured.
- Component/rate-card pricing used when no fixed package price is configured.
- Overlapping rates blocked.
- Open-ended Valid To works.
- Markup, supplement, child, and infant pricing applied correctly where configured.
- VAT-inclusive values displayed.
- No rounding applied.

### Quote tests

- Quote PDF generated.
- Quote validity default 30 days.
- Quote versions increment when meaningful quote changes are resent.
- Previous quote versions remain available for audit/history.
- Quote editable after sending.
- Audit log records quote edits.
- Quote acceptance link works.
- Accepting quote generates deposit invoice.

### Payment tests

- Required payment fields enforced.
- Payment method dropdown works.
- Proof of payment upload works.
- Overdue payment flag works.
- Reminder rules work.

### Voucher tests

- Voucher blocked if invoice not fully paid.
- Voucher blocked if required fields missing.
- Voucher number generated.
- Service blocks render correctly.
- Supplier references appear inside service blocks.

### Permission tests

- Consultant cannot edit settings.
- Consultant cannot edit supplier rates.
- Manager can edit rates.
- Admin can manage users.
- Consultant can see and edit all jobs.
- All staff can view audit logs.
- Read-only users can view permitted records but cannot edit, send, export, or manage settings.
- Admin/Manager can reassign jobs.

---

## 43.2 Integration Tests

### Email ingestion

- Connect to IMAP test mailbox.
- Read enquiry email.
- Create enquiry/job.
- Move complete email import to `Processed`.
- Move email import needing review to `Needs Review`.
- Duplicate email does not create duplicate job.
- Folder auto-created when missing.

### Email sending

- Send quote email.
- Send deposit request email.
- Send payment reminder.
- Send voucher email.
- Store timeline item with subject/timestamp/recipients.

### File storage

- Upload attachment.
- Upload proof of payment.
- Generate quote PDF.
- Generate invoice PDF.
- Generate voucher PDF.

### Backup and restore

- Backup created automatically.
- Backup retained for 14 days.
- Restore selected backup.
- Full database rollback confirmed.

### Error logging

- Simulate parser failure.
- Simulate mailbox failure.
- Simulate PDF failure.
- Error appears in Settings.
- Badge appears.
- User marks error resolved.

---

## 43.3 End-to-End Tests

### E2E Scenario 1: Blue Train enquiry to quote

1. Receive Blue Train email.
2. Parse fields.
3. Create customer and job.
4. Consultant claims job.
5. Consultant starts quote.
6. System enters pipeline.
7. Consultant generates quote.
8. Consultant sends quote.
9. Quote appears as sent.

Expected:

- Job number starts with `BT`.
- Quote PDF generated.
- Email timeline created.
- Audit log created.

### E2E Scenario 2: Rovos enquiry to voucher

1. Receive Rovos email.
2. Parse enquiry.
3. Create job number `RR-YYYY-####`.
4. Generate and send quote.
5. Client clicks Accept Quote.
6. Deposit invoice generated.
7. Consultant records payment.
8. Consultant generates invoice.
9. Consultant marks invoice paid.
10. Consultant generates voucher.
11. Consultant sends voucher.
12. Job reaches Voucher Sent.

Expected:

- Customer last travel date updates.
- Repeat client rules work on future enquiry.
- Voucher contains modular service blocks.

### E2E Scenario 3: Cancellation and refund

1. Quote accepted.
2. Consultant cancels booking.
3. Selects cancellation reason.
4. Confirms final cancellation.
5. System calculates fixed cancellation fee.
6. System calculates refund.
7. Consultant records refund.

Expected:

- Outcome set to Cancelled.
- Reason required.
- Refund stored.
- Audit log complete.

---

## 43.4 User Acceptance Testing

Test with actual staff:

### Consultant UAT

- Can find new enquiries.
- Can claim jobs.
- Can start quote.
- Can edit missing fields.
- Can generate quote.
- Can send email.
- Can record payment.
- Can generate voucher.

### Manager UAT

- Can edit templates.
- Can manage suppliers.
- Can manage rates.
- Can view reports.
- Can reassign jobs.
- Can resolve errors.

### Admin UAT

- Can create users.
- Can configure company details.
- Can configure backup/restore.
- Can restore from backup.
- Can manage global settings.

---

## 44. Open Items / Developer Notes

### Outbound email provider confirmation

Before implementing final email-sending integration, confirm on an employee machine:

- Incoming server name
- Outgoing server name
- Whether account works in Outlook Web
- Whether mailbox is Microsoft 365 Exchange Online
- Whether SMTP credentials/app passwords are available

Path on Outlook desktop:

`File → Account Settings → Account Settings → double-click account → Server Settings`

### Deposit due rule

Final confirmed direction:

- Configurable in settings.
- Editable per quote.
- Recommended default: 14 days before departure.

Developer should confirm whether business wants this as:

- X days before departure, or
- X days after quote acceptance.

### Final payment default

The rule is configurable as X days before departure. Default number still needs business confirmation.

### Voucher visual design

The uploaded voucher document should be used as design inspiration, but the system should implement it as modular service blocks.

---

## 45. MVP Implementation Phases

### Phase 1: Foundation

- Auth
- Roles
- Users
- Settings shell
- Company settings
- Database foundation with `company_id`
- Audit log

### Phase 2: Email ingestion

- Monitored mailboxes
- IMAP connection
- Parser for Blue Train
- Parser for Rovos Rail
- New Enquiries page
- Duplicate detection
- Processed folder handling

### Phase 3: CRM and jobs

- Customer records
- Job cards
- Job numbering
- Ownership
- Pipeline board
- Search

### Phase 4: Suppliers and pricing

- Supplier categories
- Suppliers
- Train products/routes
- Suite types
- Hotel products
- Rates
- Markups
- Rate selection

### Phase 5: Quotes

- Quote builder
- Quote PDF
- Quote email
- Accept Quote link
- Follow-up settings and scheduler

### Phase 6: Invoices and payments

- Invoice generation
- Invoice numbering
- Payment capture
- Proof of payment upload
- Payment reminders
- Overdue flags

### Phase 7: Vouchers

- Voucher number generation
- Modular service blocks
- Voucher PDF
- Voucher sending
- Required-field gate

### Phase 8: Reports and system tools

- Dashboard
- Reports
- Exports
- Backup and restore
- Error logs
- Final UAT

---

## 46. Definition of Done for MVP

The MVP is complete when:

- System ingests SA-Rail Blue Train and Rovos Rail email enquiries.
- Enquiries create job cards with job numbers.
- Customers are matched by email.
- Consultants can claim and process enquiries.
- Jobs move through the defined pipeline.
- Supplier and rate data can be maintained by Admin/Manager.
- Quotes can be generated and sent.
- Clients can accept quotes via link.
- Deposit invoice is generated after quote acceptance.
- Payments can be manually captured with proof upload.
- Invoices can be generated and numbered correctly.
- Voucher generation is blocked until full payment and required fields are complete.
- Voucher PDF uses modular service blocks.
- Reports can be viewed and exported.
- Settings module controls agreed business rules.
- Errors are logged and visible with a badge.
- Backups run daily and full restore works.
- Active audit logs are retained for 24 months.
