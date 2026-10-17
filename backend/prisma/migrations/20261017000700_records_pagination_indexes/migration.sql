CREATE INDEX idx_cases_page ON cases(created_at DESC, id DESC);
CREATE INDEX idx_cases_status_page ON cases(status, created_at DESC, id DESC);
CREATE INDEX idx_orders_page ON work_orders(created_at DESC, id DESC);
CREATE INDEX idx_orders_status_page ON work_orders(status, created_at DESC, id DESC);
