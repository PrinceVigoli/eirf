DO $$ BEGIN
  CREATE TYPE incident_category AS ENUM ('crime', 'non_crime');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS date_reported text;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS investigating_officer_id integer REFERENCES officers(id) ON DELETE SET NULL;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS settled_date text;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS category incident_category;

UPDATE incidents
   SET category = CASE WHEN type = 'Crime' THEN 'crime'::incident_category ELSE 'non_crime'::incident_category END
 WHERE category IS NULL;

UPDATE incidents SET date_reported = date WHERE date_reported IS NULL;

ALTER TABLE incidents ALTER COLUMN category SET NOT NULL;
