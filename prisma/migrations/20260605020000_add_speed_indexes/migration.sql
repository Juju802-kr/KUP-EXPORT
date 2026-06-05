CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt");

CREATE INDEX IF NOT EXISTS "DropdownOption_category_sortOrder_idx" ON "DropdownOption"("category", "sortOrder");

CREATE INDEX IF NOT EXISTS "ShipmentRequest_exportCountry_idx" ON "ShipmentRequest"("exportCountry");
CREATE INDEX IF NOT EXISTS "ShipmentRequest_buyer_idx" ON "ShipmentRequest"("buyer");
CREATE INDEX IF NOT EXISTS "ShipmentRequest_invNo_idx" ON "ShipmentRequest"("invNo");
CREATE INDEX IF NOT EXISTS "ShipmentRequest_productionRequestNo_idx" ON "ShipmentRequest"("productionRequestNo");
CREATE INDEX IF NOT EXISTS "ShipmentRequest_sortOrder_updatedAt_idx" ON "ShipmentRequest"("sortOrder", "updatedAt");

CREATE INDEX IF NOT EXISTS "ShipmentProduct_shipmentId_idx" ON "ShipmentProduct"("shipmentId");
CREATE INDEX IF NOT EXISTS "ShipmentProduct_productName_idx" ON "ShipmentProduct"("productName");
CREATE INDEX IF NOT EXISTS "ShipmentProduct_englishName_idx" ON "ShipmentProduct"("englishName");
CREATE INDEX IF NOT EXISTS "ShipmentProduct_piNo_idx" ON "ShipmentProduct"("piNo");
CREATE INDEX IF NOT EXISTS "ShipmentProduct_productionRequestNo_idx" ON "ShipmentProduct"("productionRequestNo");

CREATE INDEX IF NOT EXISTS "PaymentTT_exportCountry_idx" ON "PaymentTT"("exportCountry");
CREATE INDEX IF NOT EXISTS "PaymentTT_buyer_idx" ON "PaymentTT"("buyer");
CREATE INDEX IF NOT EXISTS "PaymentTT_productionRequestNo_idx" ON "PaymentTT"("productionRequestNo");
CREATE INDEX IF NOT EXISTS "PaymentTT_invNo_idx" ON "PaymentTT"("invNo");
CREATE INDEX IF NOT EXISTS "PaymentTT_refNo_idx" ON "PaymentTT"("refNo");
CREATE INDEX IF NOT EXISTS "PaymentTT_createdAt_idx" ON "PaymentTT"("createdAt");

CREATE INDEX IF NOT EXISTS "PaymentLC_exportCountry_idx" ON "PaymentLC"("exportCountry");
CREATE INDEX IF NOT EXISTS "PaymentLC_buyer_idx" ON "PaymentLC"("buyer");
CREATE INDEX IF NOT EXISTS "PaymentLC_lcNo_idx" ON "PaymentLC"("lcNo");
CREATE INDEX IF NOT EXISTS "PaymentLC_lcSd_idx" ON "PaymentLC"("lcSd");
CREATE INDEX IF NOT EXISTS "PaymentLC_createdAt_idx" ON "PaymentLC"("createdAt");

CREATE INDEX IF NOT EXISTS "LcShipmentLink_shipmentId_idx" ON "LcShipmentLink"("shipmentId");
