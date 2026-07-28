-- AlterTable BuyerMaster (idempotent if already applied)
ALTER TABLE "BuyerMaster" ADD COLUMN IF NOT EXISTS "vatNo" TEXT;
ALTER TABLE "BuyerMaster" ADD COLUMN IF NOT EXISTS "eoriNo" TEXT;

-- AlterTable ShipmentRequest summary fields
ALTER TABLE "ShipmentRequest" ADD COLUMN IF NOT EXISTS "summaryDataLogger" TEXT;
ALTER TABLE "ShipmentRequest" ADD COLUMN IF NOT EXISTS "summaryDataLoggerDetail" TEXT;
ALTER TABLE "ShipmentRequest" ADD COLUMN IF NOT EXISTS "summaryShippingLabelMethod" TEXT;
ALTER TABLE "ShipmentRequest" ADD COLUMN IF NOT EXISTS "summarySpecialNotes" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ShipmentSummaryDefaultNote" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "ShipmentSummaryDefaultNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ShipmentSummaryDefaultNote_sortOrder_idx" ON "ShipmentSummaryDefaultNote"("sortOrder");
