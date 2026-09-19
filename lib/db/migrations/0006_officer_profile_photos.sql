-- Officer self-service profile photos (avatar + cover), shown on the
-- "My Profile" page. Both nullable — an officer with no uploaded photo
-- falls back to their initials (avatar) and a gradient (cover). The stored
-- values are object-storage paths (e.g. /objects/<uuid>) served via
-- GET /api/storage/objects/<uuid>, the same mechanism incident evidence uses.
ALTER TABLE officers ADD COLUMN avatar_url text;
ALTER TABLE officers ADD COLUMN cover_url text;
