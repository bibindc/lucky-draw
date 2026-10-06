-- CreateTable
CREATE TABLE "ComplimentaryOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "valuePaise" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ComplimentaryOption_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ComplimentaryChoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "participantId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CHOSEN',
    "chosenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chosenByAdminId" TEXT,
    "chosenByAgentId" TEXT,
    "deliveredAt" DATETIME,
    "deliveryNote" TEXT,
    "deliveredByAdminId" TEXT,
    "deliveredByAgentId" TEXT,
    "cancelledAt" DATETIME,
    "cancelReason" TEXT,
    CONSTRAINT "ComplimentaryChoice_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ComplimentaryChoice_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ComplimentaryOption" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ComplimentaryChoice_chosenByAdminId_fkey" FOREIGN KEY ("chosenByAdminId") REFERENCES "Admin" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ComplimentaryChoice_chosenByAgentId_fkey" FOREIGN KEY ("chosenByAgentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ComplimentaryChoice_deliveredByAdminId_fkey" FOREIGN KEY ("deliveredByAdminId") REFERENCES "Admin" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ComplimentaryChoice_deliveredByAgentId_fkey" FOREIGN KEY ("deliveredByAgentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ComplimentaryOption_campaignId_isActive_idx" ON "ComplimentaryOption"("campaignId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ComplimentaryChoice_participantId_key" ON "ComplimentaryChoice"("participantId");

-- CreateIndex
CREATE INDEX "ComplimentaryChoice_optionId_status_idx" ON "ComplimentaryChoice"("optionId", "status");

