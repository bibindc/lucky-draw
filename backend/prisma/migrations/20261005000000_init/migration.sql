-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "drawCount" INTEGER NOT NULL,
    "totalAmountPaise" INTEGER NOT NULL,
    "perDrawAmountPaise" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Draw" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "drawNumber" INTEGER NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "prizeCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "executedAt" DATETIME,
    "executedByAdminId" TEXT,
    "poolSnapshot" JSONB,
    CONSTRAINT "Draw_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Draw_executedByAdminId_fkey" FOREIGN KEY ("executedByAdminId") REFERENCES "Admin" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "mobile" TEXT,
    "externalUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Participant_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DrawPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "participantId" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_PAID',
    "retainedCredit" BOOLEAN NOT NULL DEFAULT false,
    "transactionId" TEXT,
    CONSTRAINT "DrawPayment_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DrawPayment_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "Draw" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DrawPayment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PaymentTransaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "participantId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "recordedByAdminId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" DATETIME,
    CONSTRAINT "PaymentTransaction_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaymentTransaction_recordedByAdminId_fkey" FOREIGN KEY ("recordedByAdminId") REFERENCES "Admin" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "drawPaymentId" TEXT NOT NULL,
    CONSTRAINT "PaymentAllocation_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PaymentTransaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaymentAllocation_drawPaymentId_fkey" FOREIGN KEY ("drawPaymentId") REFERENCES "DrawPayment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Prize" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "valuePaise" INTEGER,
    "rank" INTEGER NOT NULL,
    "totalQuantity" INTEGER NOT NULL,
    "assignedQuantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Prize_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Winner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "drawId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "prizeId" TEXT NOT NULL,
    "claimStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "claimNote" TEXT,
    "claimUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Winner_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "Draw" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Winner_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Winner_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "Prize" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE INDEX "Draw_campaignId_scheduledAt_idx" ON "Draw"("campaignId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Draw_status_scheduledAt_idx" ON "Draw"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "Draw_campaignId_drawNumber_key" ON "Draw"("campaignId", "drawNumber");

-- CreateIndex
CREATE INDEX "Participant_campaignId_status_idx" ON "Participant"("campaignId", "status");

-- CreateIndex
CREATE INDEX "Participant_campaignId_name_idx" ON "Participant"("campaignId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_campaignId_email_key" ON "Participant"("campaignId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_campaignId_mobile_key" ON "Participant"("campaignId", "mobile");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_campaignId_externalUserId_key" ON "Participant"("campaignId", "externalUserId");

-- CreateIndex
CREATE INDEX "DrawPayment_drawId_status_idx" ON "DrawPayment"("drawId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DrawPayment_participantId_drawId_key" ON "DrawPayment"("participantId", "drawId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_participantId_createdAt_idx" ON "PaymentTransaction"("participantId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentAllocation_drawPaymentId_idx" ON "PaymentAllocation"("drawPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_transactionId_drawPaymentId_key" ON "PaymentAllocation"("transactionId", "drawPaymentId");

-- CreateIndex
CREATE INDEX "Prize_campaignId_rank_idx" ON "Prize"("campaignId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "Winner_participantId_key" ON "Winner"("participantId");

-- CreateIndex
CREATE INDEX "Winner_drawId_createdAt_idx" ON "Winner"("drawId", "createdAt");
