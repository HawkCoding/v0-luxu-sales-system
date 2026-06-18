-- Extend document_kind enum to support the client-facing itinerary PDF.
-- Must commit before the value is used (PG forbids using a new enum value in
-- the same transaction in which it was added).
ALTER TYPE public.document_kind ADD VALUE IF NOT EXISTS 'itinerary_pdf';
