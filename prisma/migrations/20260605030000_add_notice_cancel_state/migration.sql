ALTER TABLE "Notice" ADD COLUMN IF NOT EXISTS "canceled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Notice" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;
ALTER TABLE "Notice" ADD COLUMN IF NOT EXISTS "canceledAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Notice_canceled_scheduleDate_idx" ON "Notice"("canceled", "scheduleDate");
