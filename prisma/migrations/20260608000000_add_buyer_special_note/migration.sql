ALTER TYPE "AttachmentOwnerType" ADD VALUE IF NOT EXISTS 'BUYER_MASTER';

ALTER TABLE "BuyerMaster" ADD COLUMN "specialNote" TEXT;
ALTER TABLE "BuyerMaster" ADD COLUMN "specialNoteUpdatedAt" TIMESTAMP(3);
