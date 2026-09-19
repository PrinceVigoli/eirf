-- Set the station branding for this deployment (Luna Municipal Police Station).
-- Station name/short name are admin-editable at runtime from System & Recovery;
-- this migration just sets the initial value so a fresh install (or this one)
-- shows the correct station without a manual step.
UPDATE app_settings
   SET station_name = 'Luna Municipal Police Station',
       station_short_name = 'Luna Municipal Police Station'
 WHERE id = 1;
