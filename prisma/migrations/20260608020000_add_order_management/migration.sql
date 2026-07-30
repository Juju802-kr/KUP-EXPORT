CREATE TABLE "OrderEntry" (
    "id" TEXT NOT NULL,
    "salesOwner" TEXT NOT NULL,
    "exportCountry" TEXT,
    "buyer" TEXT,
    "piDate" TIMESTAMP(3),
    "piNo" TEXT,
    "productionRequestNo" TEXT,
    "productName" TEXT,
    "unitPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "OrderEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesRegistration" (
    "id" TEXT NOT NULL,
    "orderKey" TEXT NOT NULL,
    "salesOwner" TEXT NOT NULL,
    "exportCountry" TEXT,
    "buyer" TEXT,
    "piNo" TEXT,
    "productionRequestNo" TEXT,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "registeredAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "SalesRegistration_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderEntry_salesOwner_idx" ON "OrderEntry"("salesOwner");
CREATE INDEX "OrderEntry_exportCountry_idx" ON "OrderEntry"("exportCountry");
CREATE INDEX "OrderEntry_buyer_idx" ON "OrderEntry"("buyer");
CREATE INDEX "OrderEntry_piDate_idx" ON "OrderEntry"("piDate");
CREATE INDEX "OrderEntry_piNo_idx" ON "OrderEntry"("piNo");
CREATE INDEX "OrderEntry_productionRequestNo_idx" ON "OrderEntry"("productionRequestNo");

CREATE UNIQUE INDEX "SalesRegistration_orderKey_salesOwner_key" ON "SalesRegistration"("orderKey", "salesOwner");
CREATE INDEX "SalesRegistration_salesOwner_idx" ON "SalesRegistration"("salesOwner");
CREATE INDEX "SalesRegistration_registeredAt_idx" ON "SalesRegistration"("registeredAt");
CREATE INDEX "SalesRegistration_status_idx" ON "SalesRegistration"("status");
