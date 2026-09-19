-- Isolated on purpose: ALTER TYPE ADD VALUE commits the label, but the label
-- cannot be USED in the same transaction. migrate.mjs wraps each file in one
-- transaction, so this file must reference NOTHING that uses 'settled'.
ALTER TYPE incident_status ADD VALUE IF NOT EXISTS 'settled' BEFORE 'closed';
