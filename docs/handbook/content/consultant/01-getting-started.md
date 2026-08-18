# Getting started

Everything you need before you touch a booking: signing in, finding your way around the
app, and reading the dashboard.

## Signing in

[[shot:01-login|The sign-in screen]]

1. Go to the sign-in screen and enter your email address and password.
2. Click **Sign in with email**.

If the email or password is wrong, the form clears the password field and shows:
*"Invalid email or password. Check your credentials or use Forgot password."* The screen
does not say which of the two was wrong.

## Forgotten password

[[shot:01-forgot-password|The reset-email form]]

1. On the sign-in screen, click **Forgot password?**.
2. Enter your email address and click **Send reset link**.
3. Open the email and follow the link. It brings you to a **Set new password** screen.
4. Enter a new password (minimum 10 characters) in both fields and click **Update password**.

> [!WARNING]
> The reset link expires. If it has expired by the time you follow it, request a new one
> from the sign-in screen.

You are signed in automatically once the new password is set, and the app redirects you to
the dashboard.

## Being signed out automatically

The app signs you out after a period of inactivity — no mouse movement, clicks, key
presses, scrolling, or touches. Your administrator sets the exact number of minutes in
Settings.

Shortly before the timeout, a **Session timeout warning** dialog appears telling you that
you have been inactive. Click **Stay signed in** to continue working, or **Log out now** to
end the session immediately. If you do nothing, you are logged out when the dialog's own
countdown runs out and the app returns you to the sign-in screen.

> [!STOP]
> If you have an unsaved dialog open — a note, a quote line, a payment form — when the idle
> timeout logs you out, that unsaved work is lost. Save or send before you step away.

## The shell

Every screen inside the app shares the same frame: a sidebar on the left and a header
across the top.

[[shot:01-sidebar|Sidebar with the consultant's nav items]]

The sidebar lists, top to bottom:

- **Dashboard** — the landing screen, described below.
- **Enquiries** — new enquiries waiting to be turned into bookings. A badge shows how many.
- **Pipeline** — every booking as a board, grouped by stage.
- **Bookings** — every booking as a list.
- **Customers** — the customer database.
- **Suppliers** — hotels, transfer operators and other suppliers you attach to a booking.
- **Documents** — files uploaded against bookings.
- **Emails Sent** — a record of every email the system has sent.

Below that, a **Templates** item appears under an "Admin" heading, and **Reporting** and
**Audit Log** appear under a "Manager" heading. As a consultant you will not see these —
see "What a consultant can see" below.

The bar along the bottom of the sidebar shows the app's version number and a button to
collapse the sidebar to icons only.

In the header:

- A **Search customers...** box searches the customer database directly from any screen.
  Press Enter to jump to the Customers list filtered by your search.
- A light/dark toggle switches the whole app's theme.
- Your name and role appear together on the right — for example "Leonie Botha • consultant".
- **Logout** signs you out and returns you to the sign-in screen.

## What a consultant can see

**Templates** is visible to managers and admins. **Reporting**, **Audit Log** and
**Settings** are visible to managers and admins only — a consultant account does not see
these items in the sidebar at all. This is expected behaviour, not a bug: consultants run
bookings, they do not configure the system or view business-wide reporting.

## The dashboard, tile by tile

[[shot:01-dashboard|Full dashboard as a consultant]]

The dashboard is what you land on after signing in. Across the top:

- **Open Jobs** — every booking that is not Closed or Lost. Click through to Bookings.
- **Quotes Sent** — bookings currently at the Quote Sent stage. Click through to Pipeline.
- **Deposits Paid** — bookings at the Deposit Paid stage. Click through to Payments.
- **Full Payment** — bookings at the Paid in Full stage. Click through to Payments.

Below the tiles, two cards sit side by side:

- **Jobs by Stage** — a count of every booking, grouped by stage, in pipeline order.
- **Recent Jobs** — the five most recently created bookings, each showing its booking
  number, customer name, current stage and creation date. Click any row to open the
  booking.

## Upcoming Follow-ups

[[shot:01-follow-ups|The Upcoming Follow-ups card with at least one row]]

This card lists correspondence the system has drafted and scheduled but not yet sent —
for example, a follow-up email queued a couple of days after a quote goes out. Each row
shows the email subject, the booking number, the customer, and the date it is scheduled
for.

Two actions sit on each row:

1. **Send** opens the email in an editable preview so you can review or adjust the wording
   before it goes out. It does **not** send the email silently — you still confirm the send
   from the preview dialog.
2. **Dismiss** removes the scheduled email from the list without sending it.

> [!NOTE]
> If the card is empty, there is nothing currently scheduled — it is not an error state.

## The booking lifecycle, at a glance

Every booking moves through the same sequence of stages, in this order:

1. **Enquiry**
2. **Quote Sent**
3. **Quote Accepted**
4. **Deposit Invoice Sent**
5. **Deposit Paid**
6. **Paid in Full**
7. **Voucher Sent**
8. **Closed**

A booking can also move to **Lost** from most of these stages, if the client cancels or the
enquiry does not convert.

This is only the map. What each stage requires before the system will let a booking move
into it — the gates — is covered in Chapter 8.
