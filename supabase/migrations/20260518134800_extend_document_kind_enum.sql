-- Extend document_kind enum to support proof_of_payment uploads.
-- Must commit before the value is used (PG forbids using a new enum value in
-- the same transaction in which it was added).
ALTER TYPE public.document_kind ADD VALUE IF NOT EXISTS 'proof_of_payment';
