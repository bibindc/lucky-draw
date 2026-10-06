-- AlterTable
ALTER TABLE "ComplimentaryOption" ADD COLUMN "imageUpdatedAt" DATETIME;

-- CreateTable
CREATE TABLE "ComplimentaryOptionImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "optionId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BLOB NOT NULL,
    "size" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ComplimentaryOptionImage_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ComplimentaryOption" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ComplimentaryOptionImage_optionId_key" ON "ComplimentaryOptionImage"("optionId");

