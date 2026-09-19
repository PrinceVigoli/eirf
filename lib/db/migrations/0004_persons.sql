DO $$ BEGIN
  CREATE TYPE person_role AS ENUM ('victim', 'complainant', 'suspect', 'witness');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS persons (
  id serial PRIMARY KEY,
  full_name text NOT NULL,
  alias text,
  date_of_birth text,
  sex text,
  nationality text,
  address text,
  contact_number text,
  email text,
  id_type text,
  id_number text,
  occupation text,
  physical_description text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS persons_full_name_idx ON persons(full_name);
CREATE INDEX IF NOT EXISTS persons_alias_idx ON persons(alias);

CREATE TABLE IF NOT EXISTS incident_persons (
  id serial PRIMARY KEY,
  incident_id integer NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  person_id integer NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  role person_role NOT NULL,
  role_details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS incident_persons_incident_person_role_unique ON incident_persons(incident_id, person_id, role);
CREATE INDEX IF NOT EXISTS incident_persons_incident_id_idx ON incident_persons(incident_id);
CREATE INDEX IF NOT EXISTS incident_persons_person_id_idx ON incident_persons(person_id);
