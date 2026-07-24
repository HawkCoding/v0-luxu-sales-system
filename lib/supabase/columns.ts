// Centralised explicit column lists for production queries.
// Avoid select("*") so schema drift never silently widens API payloads.

export const CUSTOMER_COLUMNS =
  "id, first_name, last_name, email, phone, fax, country, province, title, company_name, address_line1, address_line2, city, postal_code, vat_number, notes, date_of_birth, id_passport, vip_status, preferences, communication_preferences, default_rate_type_id, first_travel_date, last_travel_date, is_repeat_client, created_at, updated_at"

export const BOOKING_COLUMNS =
  "id, booking_number, customer_id, stage, purpose, source, consultant, owner_user_id, assigned_salesperson_id, is_repeat_client_at_creation, departure_date, duration_nights, email_import_needs_review, email_import_review_resolved_at, email_import_missing_fields, email_import_warnings, email_import_source_message_id, email_import_duplicate_of_booking_id, email_import_subject, email_import_mailbox, email_import_received_at, email_import_raw_preview, no_of_adults, no_of_children, no_of_suites, child_ages, route_id, raw_text, extracted_json, terms_accepted, additional_services, additional_services_details, promotion_code, extend_stay, extra_nights, hotel_phase, hotel_supplier_id, customer_invoice_number, created_at, updated_at, quote_sent_at, accepted_at, reservation_form_received_at, deposit_requested_at, deposit_paid_at, final_paid_at, voucher_sent_at, closed_at, deposit_paid, invoice_balance, cancelled_at, refund_status, refund_amount, refund_reference, refunded_at, outcome, outcome_reason_id, outcome_notes, outcome_set_at, outcome_set_by"

export const BOOKING_WITH_ROUTE_COLUMNS = `${BOOKING_COLUMNS}, route:routes(id, name)`

// Adds the booking's resolvable supplier (via its route, or its hotel supplier)
// so list views can show the real supplier instead of guessing from the route name.
export const BOOKING_WITH_SUPPLIER_COLUMNS = `${BOOKING_COLUMNS}, route:routes(id, name, supplier:suppliers(id, name)), hotel_supplier:suppliers!bookings_hotel_supplier_id_fkey(id, name)`

export const BOOKING_SUITE_COLUMNS = "id, booking_id, suite_number, suite_type_id, suite_type_name"

export const TRAVELLER_COLUMNS =
  "id, booking_id, prefix, first_name, last_name, id_passport, date_of_birth, residence, room_with, room_type, is_child, is_primary, sort_order"

export const BOOKING_TRANSPORT_REQUEST_COLUMNS =
  "id, booking_id, supplier_id, route_id, suite_type_id, package_leg_id, service_type, pickup_point, dropoff_point, pickup_at, passenger_count, luggage_count, flight_number, price_override, notes, sort_order, supplier_reference, created_at, updated_at, rental_details:booking_vehicle_rental_details(transport_request_id, return_at, return_cutoff_time, created_at, updated_at)"

export const BOOKING_SUPPLIER_SCHEDULE_COLUMNS =
  "id, booking_id, supplier_id, supplier_kind, label, date_from, date_to, time_start, time_end, notes, sort_order, created_at, updated_at, booking_date, confirmation_date, payment_made_date, paid_with, amount_payable, amount_receivable"

export const PAYMENT_COLUMNS =
  "id, booking_id, amount, received_at, method, reference, notes, created_at"

export const QUOTE_COLUMNS =
  "id, booking_id, itinerary_id, status, quote_number, parent_quote_id, validity_until, subtotal, total, last_sent_at, override_pin, override_reason, no_package_match, created_at, updated_at"

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

export const PIPELINE_HISTORY_COLUMNS =
  "id, booking_id, from_stage, to_stage, moved_by, moved_at"

export const TEMPLATE_COLUMNS = "id, key, subject, body_html, version, active, is_system"

export const AUDIT_LOG_COLUMNS =
  "id, actor, actor_user_id, entity_type, entity_id, action, before_json, after_json, meta_json, created_at"
