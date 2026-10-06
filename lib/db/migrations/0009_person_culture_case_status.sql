ALTER TABLE persons ADD COLUMN IF NOT EXISTS dialect text, ADD COLUMN IF NOT EXISTS tribe text;
ALTER TYPE incident_status ADD VALUE IF NOT EXISTS 'cleared';
ALTER TYPE incident_status ADD VALUE IF NOT EXISTS 'solved';
ALTER TABLE incidents ALTER COLUMN status SET DEFAULT 'under_investigation';
