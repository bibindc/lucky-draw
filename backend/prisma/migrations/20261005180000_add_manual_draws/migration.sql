-- AlterTable
ALTER TABLE "Draw" ADD COLUMN "executionMode" TEXT;
ALTER TABLE "Draw" ADD COLUMN "heldAt" DATETIME;

-- CreateTable
CREATE TABLE "ManualDrawRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "drawId" TEXT NOT NULL,
    "conductedBy" TEXT NOT NULL,
    "drawMethod" TEXT NOT NULL,
    "venue" TEXT,
    "witnesses" TEXT,
    "notes" TEXT,
    "evidenceReference" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManualDrawRecord_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "Draw" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Winner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "drawId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "prizeId" TEXT NOT NULL,
    "drawPosition" INTEGER NOT NULL DEFAULT 1,
    "claimStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "claimNote" TEXT,
    "claimUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Winner_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "Draw" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Winner_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Winner_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "Prize" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- Backfill drawPosition: existing winners are ordered by creation time within their draw.
INSERT INTO "new_Winner" ("claimNote", "claimStatus", "claimUpdatedAt", "createdAt", "drawId", "id", "participantId", "prizeId", "drawPosition") SELECT "claimNote", "claimStatus", "claimUpdatedAt", "createdAt", "drawId", "id", "participantId", "prizeId", ROW_NUMBER() OVER (PARTITION BY "drawId" ORDER BY "createdAt", "id") FROM "Winner";
DROP TABLE "Winner";
ALTER TABLE "new_Winner" RENAME TO "Winner";
CREATE UNIQUE INDEX "Winner_participantId_key" ON "Winner"("participantId");
CREATE INDEX "Winner_drawId_createdAt_idx" ON "Winner"("drawId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ManualDrawRecord_drawId_key" ON "ManualDrawRecord"("drawId");


-- Backfill: every draw completed before this migration was run automatically.
UPDATE "Draw" SET "executionMode" = 'AUTOMATIC', "heldAt" = "executedAt" WHERE "status" = 'COMPLETED';
