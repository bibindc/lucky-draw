-- AlterTable
ALTER TABLE "Prize" ADD COLUMN "imageUpdatedAt" DATETIME;

-- CreateTable
CREATE TABLE "PrizeImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prizeId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BLOB NOT NULL,
    "size" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PrizeImage_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "Prize" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PrizeImage_prizeId_key" ON "PrizeImage"("prizeId");

