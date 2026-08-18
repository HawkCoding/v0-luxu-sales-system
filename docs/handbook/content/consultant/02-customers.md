# Customers

The customer record is the anchor for every booking. This chapter covers finding one,
creating one, keeping it complete, and the two ways records collide when more than one
person edits at once.

## Finding a customer

[[shot:02-customer-list|The list with filters visible]]

Open **Customers** in the sidebar for the full list. Each row shows the customer's name,
VIP and Repeat badges where they apply, the consultants linked to their bookings, email,
phone, country and booking count.

The filter bar narrows the list by:

- **Search** — matches name, email, phone or country as you type.
- **Consultant** — bookings linked to a specific consultant.
- **Supplier** — bookings that used a specific supplier.
- **Created Date Range** — a from/to pair on when the record was created.

Click **Clear filters** to reset all of them at once.

You can also search customers from anywhere in the app: the **Search customers...** box in
the header sends you straight to this list, pre-filtered, when you press Enter.

Click a row to open the customer record, either as a modal (from the list) or its own page
(from a direct link).

## Creating a customer

[[shot:02-new-customer|The New Customer dialog, expanded section open]]

1. Click **New Customer** on the Customers list.
2. Fill in **First Name**, **Last Name** and **Email** — these three are required.
3. Optionally set **Title**, **Phone**, **Country** and **Notes**.
4. Click **Advanced (optional)** to open **Province**, **Date of birth**, **ID / Passport
   number**, **VIP status**, **Preferences** and **Communication preferences**.
5. Click **Create Customer**.

The ID / Passport number you set here prefills this customer's guest row on future
reservation forms.

> [!NOTE]
> Bulk-importing customers from a CSV file is an administrator function. See the
> Administrator Guide.

## What "complete" means

> [!WARNING]
> A booking cannot move a single stage past Enquiry unless its customer record has
> **first name, last name, email, phone and country** all filled in. This is the most
> common reason a consultant gets stuck moving a booking forward — check the customer
> record first.

The Enquiry tab on a booking shows a **Customer Contact** card with exactly these five
fields. Any that are blank are called out directly:

[[shot:02-missing-fields|The Enquiry tab's missing-contact-details panel]]

If you try to move the booking's stage anyway, the stage-move dialog blocks it with the
same message and a **Go to Enquiry tab** link:

[[shot:02-blocked-by-customer|The stage-move modal blocked on `customer_complete`]]

## Editing a record

1. Open the customer and click **Edit**.
2. Change any field.
3. Click **Save changes** to save, or **Cancel** to discard and revert every field.

Fields available on the full record beyond what New Customer captures: **Fax**, **Company**,
**VAT number**, **Address line 1/2**, **City** and **Postal code** — grouped under
**Billing details**, since they print on tax invoices. **First Travel Date** and
**Last Travel Date** are read-only, calculated from the customer's bookings.

## Duplicate email

If you save an email address that already belongs to another customer, the record shows:

> *"That email already belongs to [customer name]."*

with two options:

- **Open that customer** — navigates to the existing record.
- **Add as linked account** — opens the Linked Accounts form pre-filled with the existing
  customer's name and the email you just tried to save, so you can record the relationship
  instead of creating a duplicate.

## Someone else edited it first

If another consultant saves changes to the same customer while you have it open in Edit
mode, you see:

> *"This customer changed elsewhere. Another user just updated this customer. Refresh to
> load their changes or save anyway to attempt your current edits."*

Click **Refresh** to discard your edits and load theirs, or **Save anyway** to push your
version over the top.

## Linked accounts

Linked Accounts record a relationship to another person — a spouse, a travel companion, a
company contact — for reference only. They are internal: linked people do not appear on
quotes, invoices or vouchers.

Under **Linked Accounts (internal)**:

1. Click **Add** to open the form. Enter a relationship, name, email and phone, or search
   for and attach an existing customer record.
2. Click **Save linked account**.

Each linked account row has its own **Edit** and **Delete** buttons.

## The rest of the record

Below the editable fields:

- An activity summary showing counts and totals drawn from the customer's bookings.
- **Bookings** — every booking for this customer, each showing its booking number, stage,
  route, departure date and consultant. Click through to open it.
- **Notes** — free-text internal notes, editable the same way as the rest of the record
  (**Edit** → **Save changes**).

## Starting a booking from a customer

Click **New booking** on the customer record to open a new enquiry with the customer's
name, email, phone, country and province already filled in.

## Fixing the wrong customer on a booking

[[shot:02-blocked-by-customer]]

The **Change customer** button appears on a booking's Customer Info card only when the
booking came from an **email-sourced enquiry**. It does not appear on bookings created
directly in the app.

1. Click **Change customer**.
2. Search by name, email or phone.
3. Click a result to reassign the booking to that customer.

The originally-imported customer record is left untouched — this only changes which
customer the booking points to.
