-- Retire unused customer-facing quote acceptance link feature (never wired to a route).
DROP TABLE IF EXISTS quote_acceptance_tokens;
