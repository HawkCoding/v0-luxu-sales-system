-- Email automation Phase 6: scheduled correspondences can be dismissed from
-- the dashboard queue without sending.
alter type public.correspondence_status add value if not exists 'cancelled';
