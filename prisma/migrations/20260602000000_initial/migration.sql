-- CreateEnum
CREATE TYPE "Team" AS ENUM ('OVERSEAS_MARKETING', 'OVERSEAS_SALES_SUPPORT', 'OVERSEAS_SALES', 'SEOMYEON_QA', 'JEONDONG_QA', 'OVERSEAS_BRANCH');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('REQUEST_WAITING', 'QUOTE', 'SCHEDULE', 'SHIPPING_DOCS', 'NEGO_COLLECTION', 'AFTERCARE');

-- CreateEnum
CREATE TYPE "Factory" AS ENUM ('JEONDONG', 'SEOMYEON');

-- CreateEnum
CREATE TYPE "DropdownCategory" AS ENUM ('EXPORT_COUNTRY', 'TRANSPORT', 'DESTINATION_PORT', 'STORAGE_CONDITION', 'INCOTERMS', 'PAYMENT_TERM', 'DEPOSIT_STATUS', 'CURRENCY', 'FORWARDER', 'DEPARTURE_PORT');

-- CreateEnum
CREATE TYPE "PaymentLcKind" AS ENUM ('OPEN', 'AMEND', 'AMEND_1ST', 'AMEND_2ND', 'AMEND_3RD', 'AMEND_4TH', 'AMEND_5TH');

-- CreateEnum
CREATE TYPE "NoticeType" AS ENUM ('GENERAL', 'URGENT', 'MEETING', 'SHARE', 'ETC');

-- CreateEnum
CREATE TYPE "AttachmentOwnerType" AS ENUM ('SHIPMENT', 'SHIPMENT_PRODUCT', 'PAYMENT_TT', 'PAYMENT_LC', 'NOTICE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "team" "Team" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMaster" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "costGroupCode" TEXT NOT NULL,
    "factory" "Factory" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "ProductMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerMaster" (
    "id" TEXT NOT NULL,
    "exportCountry" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "defaultCurrency" TEXT,
    "salesOwner" TEXT,
    "exportOwner" TEXT,
    "salesEmailRecipients" TEXT,
    "exportEmailRecipients" TEXT,
    "branchEmailRecipients" TEXT,
    "contactPerson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "BuyerMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DropdownOption" (
    "id" TEXT NOT NULL,
    "category" "DropdownCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "DropdownOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentRequest" (
    "id" TEXT NOT NULL,
    "shipNo" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'QUOTE',
    "exportCountry" TEXT,
    "buyer" TEXT,
    "transport" TEXT,
    "destinationPort" TEXT,
    "storageCondition" TEXT,
    "incoterms" TEXT,
    "paymentTerm" TEXT,
    "forwarder" TEXT,
    "departurePort" TEXT,
    "transitFlight" TEXT,
    "currency" TEXT,
    "depositStatus" TEXT,
    "salesRequest" TEXT,
    "emailSent" TEXT,
    "note" TEXT,
    "releaseDate" TIMESTAMP(3),
    "etd" TIMESTAMP(3),
    "eta" TIMESTAMP(3),
    "invNo" TEXT,
    "productionRequestNo" TEXT,
    "lcSd" TEXT,
    "salesOwner" TEXT,
    "exportOwner" TEXT,
    "salesEmailRecipients" TEXT,
    "exportEmailRecipients" TEXT,
    "branchEmailRecipients" TEXT,
    "contactPerson" TEXT,
    "reporter" TEXT,
    "invoiceValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "linkedLcId" TEXT,
    "freightTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "dispatchNote" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "ShipmentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentProduct" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "productMasterId" TEXT,
    "productName" TEXT NOT NULL,
    "costGroupCode" TEXT,
    "factory" "Factory",
    "englishName" TEXT,
    "productionRequestNo" TEXT,
    "piNo" TEXT,
    "lotNo" TEXT,
    "exportUnitPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "bxQtyPaid" INTEGER NOT NULL DEFAULT 0,
    "bxQtyFoc" INTEGER NOT NULL DEFAULT 0,
    "bxQtyTotal" INTEGER NOT NULL DEFAULT 0,
    "changeNote" TEXT,
    "normalBoxQty" INTEGER NOT NULL DEFAULT 0,
    "iceBoxQty" INTEGER NOT NULL DEFAULT 0,
    "injectionBoxQty" INTEGER NOT NULL DEFAULT 0,
    "commonBoxQty" INTEGER NOT NULL DEFAULT 0,
    "grossWeight" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "exportEmailRecipients" TEXT,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "ShipmentProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTT" (
    "id" TEXT NOT NULL,
    "exportCountry" TEXT,
    "buyer" TEXT,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" TEXT,
    "date" TIMESTAMP(3),
    "refNo" TEXT,
    "description" TEXT,
    "productionRequestNo" TEXT,
    "invNo" TEXT,
    "note" TEXT,
    "exportOwner" TEXT,
    "depositOwner" TEXT,
    "salesOwner" TEXT,
    "salesEmailRecipients" TEXT,
    "exportEmailRecipients" TEXT,
    "xporterUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "PaymentTT_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentLC" (
    "id" TEXT NOT NULL,
    "kind" "PaymentLcKind" NOT NULL DEFAULT 'OPEN',
    "bank" TEXT,
    "exportCountry" TEXT,
    "buyer" TEXT,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" TEXT,
    "lcSd" TEXT,
    "note" TEXT,
    "noticeDate" TIMESTAMP(3),
    "lcNo" TEXT,
    "productionRequestNo" TEXT,
    "exportOwner" TEXT,
    "depositOwner" TEXT,
    "salesOwner" TEXT,
    "salesEmailRecipients" TEXT,
    "exportEmailRecipients" TEXT,
    "form" TEXT,
    "xporterUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "PaymentLC_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LcShipmentLink" (
    "id" TEXT NOT NULL,
    "lcId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "LcShipmentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "NoticeType" NOT NULL DEFAULT 'GENERAL',
    "important" BOOLEAN NOT NULL DEFAULT false,
    "place" TEXT,
    "scheduleDate" TIMESTAMP(3),
    "scheduleEndDate" TIMESTAMP(3),
    "sendEmail" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoticeRecipientTeam" (
    "id" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "team" TEXT NOT NULL,

    CONSTRAINT "NoticeRecipientTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamEmail" (
    "id" TEXT NOT NULL,
    "team" "Team" NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "TeamEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "ownerType" "AttachmentOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataLogger" (
    "id" TEXT NOT NULL,
    "loggerNo" TEXT,
    "quantity" TEXT,
    "receivedDate" TEXT,
    "releaseStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "DataLogger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "BuyerMaster_exportCountry_buyerName_idx" ON "BuyerMaster"("exportCountry", "buyerName");

-- CreateIndex
CREATE UNIQUE INDEX "DropdownOption_category_label_key" ON "DropdownOption"("category", "label");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentRequest_shipNo_key" ON "ShipmentRequest"("shipNo");

-- CreateIndex
CREATE UNIQUE INDEX "LcShipmentLink_lcId_shipmentId_key" ON "LcShipmentLink"("lcId", "shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "NoticeRecipientTeam_noticeId_team_key" ON "NoticeRecipientTeam"("noticeId", "team");

-- CreateIndex
CREATE UNIQUE INDEX "TeamEmail_team_email_key" ON "TeamEmail"("team", "email");

-- CreateIndex
CREATE INDEX "Attachment_ownerType_ownerId_idx" ON "Attachment"("ownerType", "ownerId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentProduct" ADD CONSTRAINT "ShipmentProduct_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "ShipmentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcShipmentLink" ADD CONSTRAINT "LcShipmentLink_lcId_fkey" FOREIGN KEY ("lcId") REFERENCES "PaymentLC"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LcShipmentLink" ADD CONSTRAINT "LcShipmentLink_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "ShipmentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeRecipientTeam" ADD CONSTRAINT "NoticeRecipientTeam_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "Notice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

