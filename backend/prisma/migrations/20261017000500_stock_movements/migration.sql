CREATE TABLE stock_movements (
  id TEXT PRIMARY KEY, "partId" TEXT NOT NULL REFERENCES inventory(part_id) ON DELETE RESTRICT,
  delta INTEGER NOT NULL CHECK (delta <> 0), balance INTEGER NOT NULL CHECK (balance >= 0),
  reason TEXT NOT NULL, actor TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "stock_movements_partId_createdAt_idx" ON stock_movements("partId", "createdAt" DESC);
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
