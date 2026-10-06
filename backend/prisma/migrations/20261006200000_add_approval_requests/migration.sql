-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "campaignId" TEXT NOT NULL,
    "participantId" TEXT,
    "winnerId" TEXT,
    "agentId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "originalPayload" JSONB,
    "pendingKey" TEXT,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" DATETIME,
    "decidedByAdminId" TEXT,
    "rejectionReason" TEXT,
    CONSTRAINT "ApprovalRequest_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ApprovalRequest_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ApprovalRequest_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "Winner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ApprovalRequest_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ApprovalRequest_decidedByAdminId_fkey" FOREIGN KEY ("decidedByAdminId") REFERENCES "Admin" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PaymentTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "participantId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "recordedByAdminId" TEXT NOT NULL,
    "collectedByAgentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" DATETIME,
    CONSTRAINT "PaymentTransaction_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaymentTransaction_recordedByAdminId_fkey" FOREIGN KEY ("recordedByAdminId") REFERENCES "Admin" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaymentTransaction_collectedByAgentId_fkey" FOREIGN KEY ("collectedByAgentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PaymentTransaction" ("amountPaise", "createdAt", "id", "method", "participantId", "recordedByAdminId", "reference", "status", "voidedAt") SELECT "amountPaise", "createdAt", "id", "method", "participantId", "recordedByAdminId", "reference", "status", "voidedAt" FROM "PaymentTransaction";
DROP TABLE "PaymentTransaction";
ALTER TABLE "new_PaymentTransaction" RENAME TO "PaymentTransaction";
CREATE INDEX "PaymentTransaction_participantId_createdAt_idx" ON "PaymentTransaction"("participantId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_pendingKey_key" ON "ApprovalRequest"("pendingKey");

-- CreateIndex
CREATE INDEX "ApprovalRequest_status_submittedAt_idx" ON "ApprovalRequest"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_agentId_status_idx" ON "ApprovalRequest"("agentId", "status");

-- CreateIndex
CREATE INDEX "ApprovalRequest_participantId_status_idx" ON "ApprovalRequest"("participantId", "status");

