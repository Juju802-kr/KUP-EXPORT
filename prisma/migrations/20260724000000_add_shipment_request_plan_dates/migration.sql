-- AlterTable
ALTER TABLE "ShipmentRequest" ADD COLUMN IF NOT EXISTS "suitabilityDate" TEXT;
ALTER TABLE "ShipmentRequest" ADD COLUMN IF NOT EXISTS "shippingApprovalDate" TEXT;
ALTER TABLE "ShipmentRequest" ADD COLUMN IF NOT EXISTS "desiredShipDate" TEXT;
