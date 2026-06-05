CREATE TABLE "PaymentTTAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "productionRequestNo" TEXT,
    "invNo" TEXT,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTTAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentLCAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "productionRequestNo" TEXT,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentLCAllocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentTTAllocation_paymentId_idx" ON "PaymentTTAllocation"("paymentId");
CREATE INDEX "PaymentTTAllocation_productionRequestNo_idx" ON "PaymentTTAllocation"("productionRequestNo");
CREATE INDEX "PaymentTTAllocation_invNo_idx" ON "PaymentTTAllocation"("invNo");
CREATE INDEX "PaymentLCAllocation_paymentId_idx" ON "PaymentLCAllocation"("paymentId");
CREATE INDEX "PaymentLCAllocation_productionRequestNo_idx" ON "PaymentLCAllocation"("productionRequestNo");

ALTER TABLE "PaymentTTAllocation" ADD CONSTRAINT "PaymentTTAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PaymentTT"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentLCAllocation" ADD CONSTRAINT "PaymentLCAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PaymentLC"("id") ON DELETE CASCADE ON UPDATE CASCADE;
