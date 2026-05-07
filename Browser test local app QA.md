# Browser Test: Local App QA

Date: 2026-05-05
Tester: Codex browser QA
App: http://localhost:3000
Login: carmen@luxustravel.co.za
Test data created: Nora Qa, nora.qa.1778005489389@example.com, job LUX-2026-000024

## Workflow Summary

- Login worked.
- Creating a customer/job worked through Pipeline -> New Enquiry -> paste email import.
- The Customers page itself did not expose a visible "new customer" action.
- New enquiry creation from the Enquiries page is broken because the `New Enquiry` link opens `/enquire/rovos`, which renders the not-found page.
- The created job opened as LUX-2026-000024 and appeared in dashboard counts/recent jobs.
- Quote generation for the new job was blocked in the UI: Quotes tab showed `No quotes yet` with no create/generate/add-item/send action.
- Existing seeded quote data is visible, and existing quotes have an `Apply Package` action, but I did not find a way to create the first quote from the job UI.
- Stage gate validation exists server-side: moving from Quote Sent to Quote Accepted without a sent/accepted quote returns 422 and blocks the move.
- The UI hides the useful validation details and only shows `Request failed`.
- Deposit invoice creation/sending could not be completed from the new test job because quote creation was blocked.
- Payment recording UI exists on jobs with a Payments tab and shows a `Record Payment` dialog.
- Voucher UI is available too early on a Deposit Paid job, before Paid in Full.
- Mobile booking detail layout clips content horizontally at 390px viewport.

## Issues

### 1. Broken New Enquiry link from Enquiries page

- Severity: high
- Page or route: `/app/enquiries` -> `/enquire/rovos`
- Type: UI / routing
- Screenshot: `qa-screenshots/browser-test-local-app-qa/01-broken-new-enquiry-link.png`
- Steps to reproduce:
  1. Log in.
  2. Open `/app/enquiries`.
  3. Click `New Enquiry`.
- Expected behavior: Opens a usable enquiry creation form or in-app import dialog.
- Actual behavior: Opens `/enquire/rovos`, which renders `Page Not Found`.

### 2. New customer cannot be created directly from Customers page

- Severity: medium
- Page or route: `/app/customers`
- Type: UI / workflow gap
- Steps to reproduce:
  1. Log in.
  2. Open `/app/customers`.
  3. Look for a create customer action.
- Expected behavior: Salesperson can create a new customer from the customer management page.
- Actual behavior: Page shows search and filters only; no visible create customer action. I could only create a customer indirectly through Pipeline -> New Enquiry import.

### 3. New job has no visible quote creation or quote item action

- Severity: blocker
- Page or route: `/app/bookings/23b20a26-cd5c-42b0-97e5-f211450bdb40`, Quotes tab
- Type: UI / workflow gap
- Screenshot: `qa-screenshots/browser-test-local-app-qa/02-empty-quotes-no-create-action.png`
- Steps to reproduce:
  1. Create a new enquiry through Pipeline -> New Enquiry -> paste email import.
  2. Save & Open the created job.
  3. Open the `Quotes (0)` tab.
- Expected behavior: Salesperson can generate a quote and add quote items.
- Actual behavior: The tab only says `No quotes yet`; no create/generate/add item/send quote action is visible.

### 4. Quote stage can be set without an actual quote

- Severity: high
- Page or route: `/app/bookings/23b20a26-cd5c-42b0-97e5-f211450bdb40`
- Type: validation / data
- Steps to reproduce:
  1. Create a new enquiry/job with zero quotes.
  2. Click `Next` from stage `Enquiry`.
- Expected behavior: App should require a generated/sent quote before moving to `Quote Sent`, or should create/send a quote as part of that action.
- Actual behavior: Job moved to `Quote Sent` while `Quotes (0)` remained empty.

### 5. Stage gate failure displays only generic `Request failed`

- Severity: medium
- Page or route: booking detail stage controls
- Type: validation / UI
- Screenshot: `qa-screenshots/browser-test-local-app-qa/03-stage-gate-generic-error.png`
- Steps to reproduce:
  1. Use a job in `Quote Sent` with no sent/accepted quote.
  2. Click `Next`.
- Expected behavior: Show the API validation message: `At least one sent or accepted quote is required before quote acceptance. Send a quote from the booking before moving it to Quote Accepted.`
- Actual behavior: UI only shows `Request failed`.

### 6. Voucher is available before invoice balance is zero

- Severity: high
- Page or route: `/app/bookings/00000000-0000-0000-0000-000000009006`, Documents tab
- Type: validation / UI
- Screenshot: `qa-screenshots/browser-test-local-app-qa/04-voucher-available-before-full-payment.png`
- Steps to reproduce:
  1. Open seeded job `LUX-2025-000006` in stage `Deposit Paid`.
  2. Open `Documents (0)`.
- Expected behavior: Voucher action is unavailable until invoice balance is `0` / job is paid in full.
- Actual behavior: `Generate Voucher` is visible and enabled on a Deposit Paid job.

### 7. Booking detail mobile layout clips content horizontally

- Severity: medium
- Page or route: booking detail, 390px viewport
- Type: UI / responsive layout
- Screenshot: `qa-screenshots/browser-test-local-app-qa/05-mobile-booking-detail-clipped.png`
- Steps to reproduce:
  1. Use a narrow viewport around 390px wide.
  2. Open a booking detail page such as `LUX-2025-000006`.
  3. Open the Documents tab.
- Expected behavior: Content fits within viewport or scrolls horizontally in contained regions only.
- Actual behavior: Main content is wider than viewport and clipped on the left; job number, customer card, tabs, and voucher card are partially cut off.

## Confirmations

- Server-side validation blocks Quote Sent -> Quote Accepted when no sent/accepted quote exists. API returned 422 with a blocking validation failure.
- Payment recording UI exists and opens a modal with Amount, Method, Reference, and Notes fields.
- Existing seeded quote items render correctly on seeded jobs, but the UI path for creating a first quote on a new job was not discoverable.

## Not Completed

- Generate a quote, add quote items, send/accept quote, create/send deposit invoice, and record a deposit payment on the new dummy job could not be completed because quote creation was blocked at the UI level.
- I did not click `Generate Voucher` on the Deposit Paid job because it appeared likely to mutate seeded data; the issue is that the action is already visible/enabled before full payment.
