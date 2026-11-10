ALTER TABLE app_users DROP CONSTRAINT app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('owner', 'supervisor', 'teknisi'));
ALTER TABLE technicians ADD COLUMN "userId" TEXT;
CREATE UNIQUE INDEX "technicians_userId_key" ON technicians("userId");
ALTER TABLE technicians ADD CONSTRAINT "technicians_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES app_users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
