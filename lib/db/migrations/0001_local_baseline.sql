DO $$ BEGIN CREATE TYPE role AS ENUM ('admin', 'officer'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE incident_status AS ENUM ('open', 'under_investigation', 'closed', 'archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE incident_type AS ENUM ('Crime', 'Accident', 'Dispute', 'Missing Person', 'Other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS officers (
  id serial PRIMARY KEY,
  name text NOT NULL,
  badge_number text NOT NULL UNIQUE,
  rank text NOT NULL,
  role role NOT NULL DEFAULT 'officer',
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  session_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE officers ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS incidents (
  id serial PRIMARY KEY,
  incident_number text NOT NULL UNIQUE,
  date text NOT NULL,
  time text NOT NULL,
  location text NOT NULL,
  type incident_type NOT NULL,
  description text NOT NULL,
  status incident_status NOT NULL DEFAULT 'open',
  reporting_officer_id integer REFERENCES officers(id),
  witness_statements text,
  evidence text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS system_logs (
  id serial PRIMARY KEY,
  action text NOT NULL,
  details text NOT NULL,
  officer_id integer REFERENCES officers(id),
  previous_hash text,
  entry_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS previous_hash text;
ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS entry_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS system_logs_entry_hash_unique ON system_logs(entry_hash);

CREATE TABLE IF NOT EXISTS evidence_files (
  id serial PRIMARY KEY,
  incident_id integer NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  object_path text NOT NULL,
  content_type text NOT NULL,
  file_size integer,
  sha256 text,
  uploaded_by_id integer REFERENCES officers(id),
  removed_by_id integer REFERENCES officers(id),
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE evidence_files ADD COLUMN IF NOT EXISTS sha256 text;
ALTER TABLE evidence_files ADD COLUMN IF NOT EXISTS removed_by_id integer REFERENCES officers(id);
ALTER TABLE evidence_files ADD COLUMN IF NOT EXISTS removed_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS evidence_files_object_path_unique ON evidence_files(object_path);

CREATE TABLE IF NOT EXISTS app_settings (
  id integer PRIMARY KEY DEFAULT 1,
  station_name text NOT NULL DEFAULT 'Luna Police Station',
  station_short_name text NOT NULL DEFAULT 'Luna Station',
  report_title text NOT NULL DEFAULT 'Electronic Incident Records Form',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
