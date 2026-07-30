-- AlterEnum
ALTER TYPE "DropdownCategory" ADD VALUE IF NOT EXISTS 'OVERSEAS_SALES_TEAM';

-- AlterTable
ALTER TABLE "DropdownOption" ADD COLUMN IF NOT EXISTS "partNo" INTEGER;
ALTER TABLE "DropdownOption" ADD COLUMN IF NOT EXISTS "rankNo" INTEGER;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DropdownOption_category_partNo_rankNo_idx" ON "DropdownOption"("category", "partNo", "rankNo");
