-- Simplify the incident `type` to just Crime / Non-Crime — officers now
-- classify each incident with the same two buckets used for crime stats,
-- so the granular subtypes (Accident, Dispute, Missing Person, Other) go
-- away. Postgres can't drop enum values in place, so swap the type: make
-- the new 2-value enum, remap existing rows (anything that wasn't 'Crime'
-- becomes 'Non-Crime'), then replace the old enum. `category` continues to
-- be derived from this server-side (Crime -> crime, else non_crime).
CREATE TYPE incident_type_new AS ENUM ('Crime', 'Non-Crime');

ALTER TABLE incidents
  ALTER COLUMN type TYPE incident_type_new
  USING (CASE WHEN type::text = 'Crime' THEN 'Crime' ELSE 'Non-Crime' END::incident_type_new);

DROP TYPE incident_type;
ALTER TYPE incident_type_new RENAME TO incident_type;
