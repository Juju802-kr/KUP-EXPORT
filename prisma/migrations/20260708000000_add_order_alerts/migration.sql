-- CreateEnum
CREATE TYPE "OrderAlertDismissType" AS ENUM ('PERMANENT', 'LATER');

-- CreateTable
CREATE TABLE "OrderAlert" (
    "id" TEXT NOT NULL,
    "salesOwner" TEXT NOT NULL,
    "exportCountry" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "OrderAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderAlertDismissal" (
    "id" TEXT NOT NULL,
    "orderAlertId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dismissType" "OrderAlertDismissType" NOT NULL,
    "orderEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderAlertDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderAlert_salesOwner_idx" ON "OrderAlert"("salesOwner");

-- CreateIndex
CREATE INDEX "OrderAlert_exportCountry_productName_idx" ON "OrderAlert"("exportCountry", "productName");

-- CreateIndex
CREATE INDEX "OrderAlertDismissal_orderAlertId_idx" ON "OrderAlertDismissal"("orderAlertId");

-- CreateIndex
CREATE INDEX "OrderAlertDismissal_userId_idx" ON "OrderAlertDismissal"("userId");

-- CreateIndex
CREATE INDEX "OrderAlertDismissal_orderEntryId_idx" ON "OrderAlertDismissal"("orderEntryId");

-- AddForeignKey
ALTER TABLE "OrderAlertDismissal" ADD CONSTRAINT "OrderAlertDismissal_orderAlertId_fkey" FOREIGN KEY ("orderAlertId") REFERENCES "OrderAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
