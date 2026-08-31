// Centralised explicit column lists for production queries.
// Avoid select("*") so schema drift never silently widens API payloads.

export const CUSTOMER_COLUMNS =
  "id, first_name, last_name, email, phone, fax, country, province, title, company_name, address_line1, address_line2, city, postal_code, vat_number, notes, date_of_birth, id_passport, vip_status, preferences, communication_preferences, first_travel_date, last_travel_date, is_repeat_client, created_at, updated_at"

export const BOOKING_COLUMNS =
  "id, booking_number, customer_id, stage, purpose, source, consultant, owner_user_id, assigned_salesperson_id, is_repeat_client_at_creation, departure_date, duration_nights, email_import_needs_review, email_import_review_resolved_at, email_import_missing_fields, email_import_warnings, email_import_source_message_id, email_import_duplicate_of_booking_id, email_import_subject, email_import_mailbox, email_import_received_at, email_import_raw_preview, no_of_adults, no_of_children, no_of_adults_original, no_of_children_original, no_of_suites, child_ages, route_id, raw_text, extracted_json, terms_accepted, additional_services, additional_services_details, promotion_code, extend_stay, extra_nights, hotel_phase, hotel_supplier_id, customer_invoice_number, services_confirmed_at, services_confirmed_by, created_at, updated_at, quote_sent_at, accepted_at, reservation_form_received_at, deposit_requested_at, deposit_paid_at, final_paid_at, voucher_sent_at, closed_at, deposit_paid, invoice_balance, overpaid_amount, cancelled_at, refund_status, refund_amount, refund_reference, refunded_at, outcome, outcome_reason_id, outcome_notes, outcome_set_at, outcome_set_by"

export const BOOKING_WITH_ROUTE_COLUMNS = `${BOOKING_COLUMNS}, route:routes(id, name)`

// Adds the booking's resolvable supplier (via its route, or its hotel supplier)
// so list views can show the real supplier instead of guessing from the route name.
export const BOOKING_WITH_SUPPLIER_COLUMNS = `${BOOKING_COLUMNS}, route:routes(id, name, supplier:suppliers(id, name)), hotel_supplier:suppliers!bookings_hotel_supplier_id_fkey(id, name)`

/** BOOKING_COLUMNS without raw_text / email_import_raw_preview, for list reads across
 * every /api/data page. Neither field renders in any list view — the raw enquiry text
 * is only shown on the booking detail Enquiry tab, which fetches it from /api/jobs/[id].
 * Written out as a literal (not derived from BOOKING_COLUMNS at runtime) because
 * Supabase's typed select() infers columns from the string literal type — a
 * computed string widens to `string` and falls back to an untyped result. */
export const BOOKING_LIST_COLUMNS =
  "id, booking_number, customer_id, stage, purpose, source, consultant, owner_user_id, assigned_salesperson_id, is_repeat_client_at_creation, departure_date, duration_nights, email_import_needs_review, email_import_review_resolved_at, email_import_missing_fields, email_import_warnings, email_import_source_message_id, email_import_duplicate_of_booking_id, email_import_subject, email_import_mailbox, email_import_received_at, no_of_adults, no_of_children, no_of_adults_original, no_of_children_original, no_of_suites, child_ages, route_id, extracted_json, terms_accepted, additional_services, additional_services_details, promotion_code, extend_stay, extra_nights, hotel_phase, hotel_supplier_id, customer_invoice_number, services_confirmed_at, services_confirmed_by, created_at, updated_at, quote_sent_at, accepted_at, reservation_form_received_at, deposit_requested_at, deposit_paid_at, final_paid_at, voucher_sent_at, closed_at, deposit_paid, invoice_balance, overpaid_amount, cancelled_at, refund_status, refund_amount, refund_reference, refunded_at, outcome, outcome_reason_id, outcome_notes, outcome_set_at, outcome_set_by"

export const BOOKING_LIST_WITH_SUPPLIER_COLUMNS = `${BOOKING_LIST_COLUMNS}, route:routes(id, name, supplier:suppliers(id, name)), hotel_supplier:suppliers!bookings_hotel_supplier_id_fkey(id, name)`

export const BOOKING_SUITE_COLUMNS =
  "id, booking_id, suite_number, suite_type_id, suite_type_name, bedroom_type_id, bedroom_layout_id, bathroom_type_id, source_phrase, match_json"

export const TRAVELLER_COLUMNS =
  "id, booking_id, prefix, first_name, last_name, id_passport, date_of_birth, residence, room_with, room_type, is_child, is_primary, sort_order"

export const BOOKING_TRANSPORT_REQUEST_COLUMNS =
  "id, booking_id, supplier_id, route_id, suite_type_id, service_id, service_type, pickup_point, dropoff_point, pickup_at, date_anchor, passenger_count, luggage_count, flight_number, price_override, price_override_set_at, price_override_set_by, complimentary, notes, sort_order, supplier_reference, supplier_contact_name, voucher_footnote, pricing_basis, adult_count, child_count, infant_count, price_override_child, price_override_infant, created_at, updated_at, rental_details:booking_vehicle_rental_details(transport_request_id, return_at, return_cutoff_time, created_at, updated_at)"

export const PAYMENT_COLUMNS =
  "id, booking_id, amount, received_at, method, reference, notes, created_at"

export const QUOTE_COLUMNS =
  "id, booking_id, itinerary_id, status, quote_number, parent_quote_id, validity_until, subtotal, total, currency, commission_bonus, agent_commission, last_sent_at, override_pin, override_reason, created_at, updated_at"

export const QUOTE_LINE_ITEM_COLUMNS =
  "id, quote_id, description, supplier_description, pricing_snapshot, qty, unit_price, total, sort_order"

export const ITINERARY_COLUMNS =
  "id, booking_id, name, notes, accepted_at, created_at, updated_at"

export const INVOICE_COLUMNS =
  "id, booking_id, quote_id, kind, status, invoice_number, deposit_percentage, amount, currency, due_date, sent_at, created_at"

export const DOCUMENT_COLUMNS =
  "id, booking_id, kind, status, storage_path, file_name, uploaded_by, payment_id, created_at"

export const CORRESPONDENCE_COLUMNS =
  "id, booking_id, channel, kind, subject, body_html, status, sent_at, scheduled_at, error, provider_message_id, created_at"

/** CORRESPONDENCE_COLUMNS without body_html, for list reads that only render the envelope.
 * The rendered HTML of every email on a booking is a large payload nothing in a list view shows —
 * the send/preview dialogs get their HTML from the /prepare endpoints, not from list data. */
export const CORRESPONDENCE_LIST_COLUMNS =
  "id, booking_id, channel, kind, subject, status, sent_at, scheduled_at, error, provider_message_id, created_at"

export const PIPELINE_HISTORY_COLUMNS =
  "id, booking_id, from_stage, to_stage, moved_by, moved_at"

export const TEMPLATE_COLUMNS = "id, key, subject, body_html, version, active, is_system"

export const AUDIT_LOG_COLUMNS =
  "id, actor, actor_user_id, entity_type, entity_id, action, before_json, after_json, meta_json, created_at"

export const SIGNATURE_BRAND_COLUMNS =
  "id, slug, name, banner_url, banner_width, banner_height, badges, enabled, sort_order, company_line, registration_line, trading_hours, divisions_line, confidentiality, office_address, created_at, updated_at"

export const PAYMENT_METHOD_COLUMNS =
  "id, name, enabled, is_default, sort_order, bank_name, bank_account_name, bank_account_number, bank_branch_code, bank_swift_code, company_address, company_reg_number, company_vat_number, company_tel, company_cell, company_fax, company_email, company_website, created_at, updated_at"
