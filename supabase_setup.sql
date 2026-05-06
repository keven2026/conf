-- Rodar no SQL Editor do Supabase
CREATE TABLE IF NOT EXISTS app_data (
  key   TEXT PRIMARY KEY,
  value JSONB
);

ALTER TABLE app_data DISABLE ROW LEVEL SECURITY;
