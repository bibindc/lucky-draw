-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SUPER_ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "agentCode" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceCounter" (
    "name" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL,

    CONSTRAINT "SequenceCounter_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "drawCount" INTEGER NOT NULL,
    "totalAmountPaise" INTEGER NOT NULL,
    "perDrawAmountPaise" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draw" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "drawNumber" INTEGER NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "prizeCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "executionMode" TEXT,
    "totalRounds" INTEGER,
    "roundsCompleted" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "heldAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "executedByAdminId" TEXT,
    "poolSnapshot" JSONB,

    CONSTRAINT "Draw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL,
    "participantNumber" INTEGER NOT NULL DEFAULT 1000,
    "campaignId" TEXT NOT NULL,
    "agentId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "mobile" TEXT,
    "externalUserId" TEXT,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawPayment" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_PAID',
    "retainedCredit" BOOLEAN NOT NULL DEFAULT false,
    "transactionId" TEXT,

    CONSTRAINT "DrawPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "recordedByAdminId" TEXT NOT NULL,
    "collectedByAgentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "drawPaymentId" TEXT NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prize" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "drawId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "valuePaise" INTEGER,
    "rank" INTEGER NOT NULL,
    "totalQuantity" INTEGER NOT NULL,
    "assignedQuantity" INTEGER NOT NULL DEFAULT 0,
    "imageUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Winner" (
    "id" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "prizeId" TEXT NOT NULL,
    "drawPosition" INTEGER NOT NULL DEFAULT 1,
    "drawnAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedByAdminId" TEXT,
    "poolSnapshot" JSONB,
    "claimStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "claimNote" TEXT,
    "claimUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Winner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualDrawRecord" (
    "id" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "conductedBy" TEXT NOT NULL,
    "drawMethod" TEXT NOT NULL,
    "venue" TEXT,
    "witnesses" TEXT,
    "notes" TEXT,
    "evidenceReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualDrawRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplimentaryOption" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "valuePaise" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "imageUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplimentaryOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplimentaryChoice" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CHOSEN',
    "chosenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chosenByAdminId" TEXT,
    "chosenByAgentId" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "deliveryNote" TEXT,
    "deliveredByAdminId" TEXT,
    "deliveredByAgentId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,

    CONSTRAINT "ComplimentaryChoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "campaignId" TEXT NOT NULL,
    "participantId" TEXT,
    "winnerId" TEXT,
    "agentId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "originalPayload" JSONB,
    "pendingKey" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedByAdminId" TEXT,
    "rejectionReason" TEXT,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrizeImage" (
    "id" TEXT NOT NULL,
    "prizeId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrizeImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplimentaryOptionImage" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplimentaryOptionImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "featuredCampaignId" TEXT,
    "organizerName" TEXT,
    "contactPhone" TEXT,
    "whatsappNumber" TEXT,
    "contactEmail" TEXT,
    "joinNote" TEXT,
    "updatedByAdminId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_agentCode_key" ON "Agent"("agentCode");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_email_key" ON "Agent"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_mobile_key" ON "Agent"("mobile");

-- CreateIndex
CREATE INDEX "Draw_campaignId_scheduledAt_idx" ON "Draw"("campaignId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Draw_status_scheduledAt_idx" ON "Draw"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "Draw_campaignId_drawNumber_key" ON "Draw"("campaignId", "drawNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_participantNumber_key" ON "Participant"("participantNumber");

-- CreateIndex
CREATE INDEX "Participant_campaignId_status_idx" ON "Participant"("campaignId", "status");

-- CreateIndex
CREATE INDEX "Participant_campaignId_name_idx" ON "Participant"("campaignId", "name");

-- CreateIndex
CREATE INDEX "Participant_agentId_createdAt_idx" ON "Participant"("agentId", "createdAt");

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
CREATE INDEX "Prize_drawId_rank_idx" ON "Prize"("drawId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "Winner_participantId_key" ON "Winner"("participantId");

-- CreateIndex
CREATE INDEX "Winner_drawId_createdAt_idx" ON "Winner"("drawId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ManualDrawRecord_drawId_key" ON "ManualDrawRecord"("drawId");

-- CreateIndex
CREATE INDEX "ComplimentaryOption_campaignId_isActive_idx" ON "ComplimentaryOption"("campaignId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ComplimentaryChoice_participantId_key" ON "ComplimentaryChoice"("participantId");

-- CreateIndex
CREATE INDEX "ComplimentaryChoice_optionId_status_idx" ON "ComplimentaryChoice"("optionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_pendingKey_key" ON "ApprovalRequest"("pendingKey");

-- CreateIndex
CREATE INDEX "ApprovalRequest_status_submittedAt_idx" ON "ApprovalRequest"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_agentId_status_idx" ON "ApprovalRequest"("agentId", "status");

-- CreateIndex
CREATE INDEX "ApprovalRequest_participantId_status_idx" ON "ApprovalRequest"("participantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PrizeImage_prizeId_key" ON "PrizeImage"("prizeId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplimentaryOptionImage_optionId_key" ON "ComplimentaryOptionImage"("optionId");

-- AddForeignKey
ALTER TABLE "Draw" ADD CONSTRAINT "Draw_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draw" ADD CONSTRAINT "Draw_executedByAdminId_fkey" FOREIGN KEY ("executedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawPayment" ADD CONSTRAINT "DrawPayment_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawPayment" ADD CONSTRAINT "DrawPayment_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "Draw"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawPayment" ADD CONSTRAINT "DrawPayment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PaymentTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_recordedByAdminId_fkey" FOREIGN KEY ("recordedByAdminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_collectedByAgentId_fkey" FOREIGN KEY ("collectedByAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PaymentTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_drawPaymentId_fkey" FOREIGN KEY ("drawPaymentId") REFERENCES "DrawPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prize" ADD CONSTRAINT "Prize_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prize" ADD CONSTRAINT "Prize_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "Draw"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Winner" ADD CONSTRAINT "Winner_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "Draw"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Winner" ADD CONSTRAINT "Winner_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Winner" ADD CONSTRAINT "Winner_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "Prize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Winner" ADD CONSTRAINT "Winner_recordedByAdminId_fkey" FOREIGN KEY ("recordedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualDrawRecord" ADD CONSTRAINT "ManualDrawRecord_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "Draw"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplimentaryOption" ADD CONSTRAINT "ComplimentaryOption_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplimentaryChoice" ADD CONSTRAINT "ComplimentaryChoice_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplimentaryChoice" ADD CONSTRAINT "ComplimentaryChoice_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ComplimentaryOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplimentaryChoice" ADD CONSTRAINT "ComplimentaryChoice_chosenByAdminId_fkey" FOREIGN KEY ("chosenByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplimentaryChoice" ADD CONSTRAINT "ComplimentaryChoice_chosenByAgentId_fkey" FOREIGN KEY ("chosenByAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplimentaryChoice" ADD CONSTRAINT "ComplimentaryChoice_deliveredByAdminId_fkey" FOREIGN KEY ("deliveredByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplimentaryChoice" ADD CONSTRAINT "ComplimentaryChoice_deliveredByAgentId_fkey" FOREIGN KEY ("deliveredByAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "Winner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_decidedByAdminId_fkey" FOREIGN KEY ("decidedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrizeImage" ADD CONSTRAINT "PrizeImage_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "Prize"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplimentaryOptionImage" ADD CONSTRAINT "ComplimentaryOptionImage_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ComplimentaryOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteSettings" ADD CONSTRAINT "SiteSettings_featuredCampaignId_fkey" FOREIGN KEY ("featuredCampaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

