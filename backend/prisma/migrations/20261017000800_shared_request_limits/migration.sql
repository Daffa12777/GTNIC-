CREATE TABLE request_limits (
  key TEXT PRIMARY KEY, hits INTEGER NOT NULL CHECK (hits >= 1), reset_at DOUBLE PRECISION NOT NULL
);
CREATE INDEX request_limits_reset_at_idx ON request_limits(reset_at);
ALTER TABLE request_limits ENABLE ROW LEVEL SECURITY;
