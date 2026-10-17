-- Skema ManualMechanic (PostgreSQL / Supabase). Idempoten: aman dijalankan berulang.
-- Snapshot lama untuk referensi. Jangan deploy file ini; gunakan npm run db:migrate.

CREATE TABLE IF NOT EXISTS pumps (
  id text PRIMARY KEY, name text, location text, model text, criticality text
);
CREATE TABLE IF NOT EXISTS sensor_readings (
  id bigserial PRIMARY KEY, pump_id text NOT NULL, ts double precision NOT NULL, features jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_readings_pump ON sensor_readings (pump_id, id DESC);
CREATE TABLE IF NOT EXISTS inventory (
  part_id text PRIMARY KEY, name text, stock integer, location text, min_stock integer
);
CREATE TABLE IF NOT EXISTS technicians (
  id text PRIMARY KEY, name text, skill text, level text, available boolean DEFAULT true, contact text
);
CREATE TABLE IF NOT EXISTS work_orders (
  id text PRIMARY KEY, pump_id text, case_id text, title text, description text, priority text,
  status text, technician_id text, scheduled_at text, part text,
  created_at double precision, closed_at double precision
);
CREATE TABLE IF NOT EXISTS purchase_requests (
  id text PRIMARY KEY, part_name text, qty integer, reason text, work_order_id text,
  status text, created_at double precision
);
CREATE TABLE IF NOT EXISTS notifications (
  id bigserial PRIMARY KEY, ts double precision, recipient text, channel text,
  message text, status text, detail text
);
CREATE TABLE IF NOT EXISTS cases (
  id text PRIMARY KEY, pump_id text, status text, fault text, confidence double precision, risk text,
  summary text, trace jsonb, state jsonb, created_at double precision, updated_at double precision, mode text
);
CREATE INDEX IF NOT EXISTS idx_cases_pump ON cases (pump_id, created_at DESC);
CREATE TABLE IF NOT EXISTS case_history (
  id text PRIMARY KEY, pump_id text, ts double precision, symptoms text, fault text,
  root_cause text, action text, duration_min double precision
);
CREATE TABLE IF NOT EXISTS agent_logs (
  id bigserial PRIMARY KEY, ts double precision, case_id text, step text, tool text, input text, output text
);
CREATE TABLE IF NOT EXISTS counters (
  name text PRIMARY KEY, n integer NOT NULL DEFAULT 0
);

-- Keamanan Supabase: backend memakai koneksi Postgres langsung (peran owner, melewati RLS).
-- RLS tanpa kebijakan memblokir akses lewat API publik Supabase (anon/authenticated).
ALTER TABLE pumps ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE technicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE counters ENABLE ROW LEVEL SECURITY;
