-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PaymentTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "participantId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "paidOn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "recordedByAdminId" TEXT NOT NULL,
    "collectedByAgentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" DATETIME,
    CONSTRAINT "PaymentTransaction_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaymentTransaction_recordedByAdminId_fkey" FOREIGN KEY ("recordedByAdminId") REFERENCES "Admin" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaymentTransaction_collectedByAgentId_fkey" FOREIGN KEY ("collectedByAgentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
-- Existing payments were entered on the day they were paid.
INSERT INTO "new_PaymentTransaction" ("amountPaise", "collectedByAgentId", "createdAt", "id", "method", "paidOn", "participantId", "recordedByAdminId", "reference", "status", "voidedAt") SELECT "amountPaise", "collectedByAgentId", "createdAt", "id", "method", "createdAt", "participantId", "recordedByAdminId", "reference", "status", "voidedAt" FROM "PaymentTransaction";
DROP TABLE "PaymentTransaction";
ALTER TABLE "new_PaymentTransaction" RENAME TO "PaymentTransaction";
CREATE INDEX "PaymentTransaction_participantId_createdAt_idx" ON "PaymentTransaction"("participantId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
