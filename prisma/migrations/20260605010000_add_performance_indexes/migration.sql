CREATE INDEX IF NOT EXISTS "ShipmentRequest_status_idx" ON "ShipmentRequest"("status");
CREATE INDEX IF NOT EXISTS "ShipmentRequest_salesOwner_idx" ON "ShipmentRequest"("salesOwner");
CREATE INDEX IF NOT EXISTS "ShipmentRequest_exportOwner_idx" ON "ShipmentRequest"("exportOwner");
CREATE INDEX IF NOT EXISTS "ShipmentRequest_releaseDate_idx" ON "ShipmentRequest"("releaseDate");
CREATE INDEX IF NOT EXISTS "ShipmentRequest_etd_idx" ON "ShipmentRequest"("etd");
CREATE INDEX IF NOT EXISTS "ShipmentRequest_eta_idx" ON "ShipmentRequest"("eta");

CREATE INDEX IF NOT EXISTS "PaymentTT_date_idx" ON "PaymentTT"("date");
CREATE INDEX IF NOT EXISTS "PaymentTT_salesOwner_idx" ON "PaymentTT"("salesOwner");
CREATE INDEX IF NOT EXISTS "PaymentTT_exportOwner_idx" ON "PaymentTT"("exportOwner");

CREATE INDEX IF NOT EXISTS "PaymentLC_noticeDate_idx" ON "PaymentLC"("noticeDate");
CREATE INDEX IF NOT EXISTS "PaymentLC_productionRequestNo_idx" ON "PaymentLC"("productionRequestNo");
CREATE INDEX IF NOT EXISTS "PaymentLC_salesOwner_idx" ON "PaymentLC"("salesOwner");
CREATE INDEX IF NOT EXISTS "PaymentLC_exportOwner_idx" ON "PaymentLC"("exportOwner");

CREATE INDEX IF NOT EXISTS "Notice_scheduleDate_idx" ON "Notice"("scheduleDate");
