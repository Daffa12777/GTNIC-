BEGIN;
-- Normalize legacy optional references without deleting operational data.
UPDATE work_orders SET case_id = NULL WHERE case_id = '';
UPDATE purchase_requests SET work_order_id = NULL WHERE work_order_id = '';
UPDATE cases SET pump_id = NULL WHERE pump_id = '';
UPDATE agent_logs SET case_id = NULL WHERE case_id = '';

ALTER TABLE sensor_readings ADD CONSTRAINT sensor_readings_pump_id_fkey FOREIGN KEY (pump_id) REFERENCES pumps(id) ON DELETE RESTRICT;
ALTER TABLE cases ADD CONSTRAINT cases_pump_id_fkey FOREIGN KEY (pump_id) REFERENCES pumps(id) ON DELETE RESTRICT;
ALTER TABLE work_orders ADD CONSTRAINT work_orders_pump_id_fkey FOREIGN KEY (pump_id) REFERENCES pumps(id) ON DELETE RESTRICT;
ALTER TABLE work_orders ADD CONSTRAINT work_orders_case_id_fkey FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE RESTRICT;
ALTER TABLE work_orders ADD CONSTRAINT work_orders_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES technicians(id) ON DELETE RESTRICT;
ALTER TABLE purchase_requests ADD CONSTRAINT purchase_requests_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE RESTRICT;
ALTER TABLE case_history ADD CONSTRAINT case_history_pump_id_fkey FOREIGN KEY (pump_id) REFERENCES pumps(id) ON DELETE RESTRICT;
ALTER TABLE agent_logs ADD CONSTRAINT agent_logs_case_id_fkey FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE RESTRICT;
ALTER TABLE inventory ADD CONSTRAINT inventory_nonnegative CHECK (stock >= 0 AND min_stock >= 0);
ALTER TABLE purchase_requests ADD CONSTRAINT purchase_quantity CHECK (qty BETWEEN 1 AND 50);
ALTER TABLE work_orders ADD CONSTRAINT work_order_priority CHECK (priority IN ('rendah','sedang','tinggi'));
ALTER TABLE case_history ADD COLUMN work_order_id text;
ALTER TABLE case_history ADD CONSTRAINT case_history_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX case_history_work_order_id_key ON case_history(work_order_id);

-- Partial indexes enforce idempotency across concurrent processes, not just one Node instance.
CREATE UNIQUE INDEX one_open_case_per_pump ON cases(pump_id) WHERE status IN ('diproses','menunggu_klarifikasi','menunggu_persetujuan');
CREATE UNIQUE INDEX one_active_order_per_title ON work_orders(pump_id,title) WHERE status NOT IN ('selesai','dibatalkan');
CREATE UNIQUE INDEX one_active_order_per_technician ON work_orders(technician_id) WHERE status NOT IN ('selesai','dibatalkan') AND technician_id IS NOT NULL;
CREATE UNIQUE INDEX one_pending_purchase_per_part ON purchase_requests(work_order_id,part_name) WHERE status = 'menunggu persetujuan' AND work_order_id IS NOT NULL;
CREATE INDEX work_orders_pump_id_status_idx ON work_orders(pump_id,status);
CREATE INDEX work_orders_case_id_idx ON work_orders(case_id);
CREATE INDEX work_orders_technician_id_idx ON work_orders(technician_id);
CREATE INDEX purchase_requests_work_order_id_idx ON purchase_requests(work_order_id);
CREATE INDEX agent_logs_case_id_idx ON agent_logs(case_id);
CREATE INDEX technicians_available_skill_level_idx ON technicians(available,skill,level);
CREATE INDEX case_history_pump_id_ts_idx ON case_history(pump_id,ts DESC);

CREATE TABLE app_users (
  id text PRIMARY KEY, username text NOT NULL UNIQUE, "passwordHash" text NOT NULL,
  role text NOT NULL CHECK (role IN ('teknisi','supervisor')), active boolean NOT NULL DEFAULT true,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE refresh_sessions (
  id text PRIMARY KEY, "userId" text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  "tokenHash" text NOT NULL UNIQUE, "expiresAt" timestamp(3) NOT NULL, "revokedAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "refresh_sessions_userId_revokedAt_idx" ON refresh_sessions("userId","revokedAt");
CREATE INDEX "refresh_sessions_expiresAt_idx" ON refresh_sessions("expiresAt");
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_sessions ENABLE ROW LEVEL SECURITY;
CREATE TABLE consumed_refresh_tokens (
  "tokenHash" text PRIMARY KEY, "sessionId" text NOT NULL REFERENCES refresh_sessions(id) ON DELETE CASCADE,
  "expiresAt" timestamp(3) NOT NULL
);
CREATE INDEX "consumed_refresh_tokens_sessionId_idx" ON consumed_refresh_tokens("sessionId");
CREATE INDEX "consumed_refresh_tokens_expiresAt_idx" ON consumed_refresh_tokens("expiresAt");
ALTER TABLE consumed_refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ADD COLUMN attempts integer NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN "claimedAt" timestamp(3);
CREATE INDEX notification_outbox_pending ON notifications(status,id) WHERE status IN ('diantrekan','mengirim');
COMMIT;
