-- Rich-text formatting for email signatures (bold/italic/underline, font
-- size/family, text colour, highlight) on the six existing per-brand text
-- overrides plus a new per-brand sender name/contact layout. The six
-- existing columns keep their names and now hold sanitized inline HTML
-- (see lib/email/signature-html.ts) rather than plain text — legacy plain
-- text values still render unchanged, since sanitizing plain text is a
-- no-op.

ALTER TABLE public.signature_brands
  ADD COLUMN IF NOT EXISTS sender_layout text;

COMMENT ON COLUMN public.signature_brands.sender_layout IS
  'Optional per-brand override for the sender name/contact block (top of the signature): sanitized inline HTML with {{fullName}}/{{jobTitle}}/{{tel}}/{{cell}}/{{fax}}/{{email}}/{{website}} fill-ins. NULL/blank inherits signature_sender_layout from app_settings, which itself falls back to the built-in default layout (see lib/email/sender-layout.ts).';

-- New shared default: blank until an admin sets one, which falls back to
-- DEFAULT_SENDER_LAYOUT in lib/email/sender-layout.ts (today's hard-coded
-- layout), so an existing installation renders byte-identically after this
-- migration.
INSERT INTO public.app_settings (key, value)
VALUES ('signature_sender_layout', '')
ON CONFLICT (key) DO NOTHING;
