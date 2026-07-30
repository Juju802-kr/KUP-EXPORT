-- AlterTable
ALTER TABLE "OrderEntry" ADD COLUMN IF NOT EXISTS "leaderNote" TEXT;
ALTER TABLE "OrderEntry" ADD COLUMN IF NOT EXISTS "leaderPrivateNote" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrderLeaderNoteAck" (
    "id" TEXT NOT NULL,
    "orderEntryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "noteSnapshot" TEXT NOT NULL,
    "showAgain" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderLeaderNoteAck_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrderLeaderNoteAck_orderEntryId_userId_key" ON "OrderLeaderNoteAck"("orderEntryId", "userId");
CREATE INDEX IF NOT EXISTS "OrderLeaderNoteAck_userId_idx" ON "OrderLeaderNoteAck"("userId");
CREATE INDEX IF NOT EXISTS "OrderLeaderNoteAck_orderEntryId_idx" ON "OrderLeaderNoteAck"("orderEntryId");
