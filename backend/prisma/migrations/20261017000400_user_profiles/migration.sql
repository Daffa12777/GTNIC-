ALTER TABLE app_users ADD COLUMN name TEXT, ADD COLUMN email TEXT;
-- Nullable email preserves existing accounts without inventing addresses.
CREATE UNIQUE INDEX app_users_email_key ON app_users(email);
ALTER TABLE app_users ADD CONSTRAINT app_users_email_normalized CHECK
  (email IS NULL OR (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254));
ALTER TABLE app_users ADD CONSTRAINT app_users_name_length CHECK
  (name IS NULL OR length(btrim(name)) BETWEEN 1 AND 100);
