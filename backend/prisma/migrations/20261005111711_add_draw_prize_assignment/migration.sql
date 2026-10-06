-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Prize" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "drawId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "valuePaise" INTEGER,
    "rank" INTEGER NOT NULL,
    "totalQuantity" INTEGER NOT NULL,
    "assignedQuantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Prize_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Prize_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "Draw" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Prize" ("assignedQuantity", "campaignId", "createdAt", "description", "id", "name", "rank", "totalQuantity", "updatedAt", "valuePaise") SELECT "assignedQuantity", "campaignId", "createdAt", "description", "id", "name", "rank", "totalQuantity", "updatedAt", "valuePaise" FROM "Prize";
DROP TABLE "Prize";
ALTER TABLE "new_Prize" RENAME TO "Prize";
CREATE INDEX "Prize_campaignId_rank_idx" ON "Prize"("campaignId", "rank");
CREATE INDEX "Prize_drawId_rank_idx" ON "Prize"("drawId", "rank");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
