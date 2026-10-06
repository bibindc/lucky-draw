-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Draw" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "drawNumber" INTEGER NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "prizeCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "executionMode" TEXT,
    "totalRounds" INTEGER,
    "roundsCompleted" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME,
    "heldAt" DATETIME,
    "executedAt" DATETIME,
    "executedByAdminId" TEXT,
    "poolSnapshot" JSONB,
    CONSTRAINT "Draw_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Draw_executedByAdminId_fkey" FOREIGN KEY ("executedByAdminId") REFERENCES "Admin" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Draw" ("campaignId", "drawNumber", "executedAt", "executedByAdminId", "executionMode", "heldAt", "id", "poolSnapshot", "prizeCount", "scheduledAt", "status") SELECT "campaignId", "drawNumber", "executedAt", "executedByAdminId", "executionMode", "heldAt", "id", "poolSnapshot", "prizeCount", "scheduledAt", "status" FROM "Draw";
DROP TABLE "Draw";
ALTER TABLE "new_Draw" RENAME TO "Draw";
CREATE INDEX "Draw_campaignId_scheduledAt_idx" ON "Draw"("campaignId", "scheduledAt");
CREATE INDEX "Draw_status_scheduledAt_idx" ON "Draw"("status", "scheduledAt");
CREATE UNIQUE INDEX "Draw_campaignId_drawNumber_key" ON "Draw"("campaignId", "drawNumber");
CREATE TABLE "new_Winner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "drawId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "prizeId" TEXT NOT NULL,
    "drawPosition" INTEGER NOT NULL DEFAULT 1,
    "drawnAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedByAdminId" TEXT,
    "poolSnapshot" JSONB,
    "claimStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "claimNote" TEXT,
    "claimUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Winner_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "Draw" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Winner_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Winner_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "Prize" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Winner_recordedByAdminId_fkey" FOREIGN KEY ("recordedByAdminId") REFERENCES "Admin" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Winner" ("claimNote", "claimStatus", "claimUpdatedAt", "createdAt", "drawId", "drawPosition", "id", "participantId", "prizeId") SELECT "claimNote", "claimStatus", "claimUpdatedAt", "createdAt", "drawId", "drawPosition", "id", "participantId", "prizeId" FROM "Winner";
DROP TABLE "Winner";
ALTER TABLE "new_Winner" RENAME TO "Winner";
CREATE UNIQUE INDEX "Winner_participantId_key" ON "Winner"("participantId");
CREATE INDEX "Winner_drawId_createdAt_idx" ON "Winner"("drawId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- Backfill: draws completed before rounds existed count every winner as one round.
UPDATE "Winner" SET
    "drawnAt" = "createdAt",
    "recordedByAdminId" = (SELECT "executedByAdminId" FROM "Draw" WHERE "Draw"."id" = "Winner"."drawId");
UPDATE "Draw" SET
    "roundsCompleted" = (SELECT COUNT(*) FROM "Winner" WHERE "Winner"."drawId" = "Draw"."id"),
    "totalRounds" = (SELECT COUNT(*) FROM "Winner" WHERE "Winner"."drawId" = "Draw"."id"),
    "startedAt" = COALESCE("heldAt", "executedAt")
WHERE "status" = 'COMPLETED';
