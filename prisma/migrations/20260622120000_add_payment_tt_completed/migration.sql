ALTER TABLE "PaymentTT" ADD COLUMN "completed" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "PaymentTT_completed_idx" ON "PaymentTT"("completed");
