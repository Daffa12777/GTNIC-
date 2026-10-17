ALTER TABLE app_users ADD COLUMN "notificationsReadThrough" BIGINT NOT NULL DEFAULT 0 CHECK ("notificationsReadThrough" >= 0);
