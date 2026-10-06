-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "featuredCampaignId" TEXT,
    "organizerName" TEXT,
    "contactPhone" TEXT,
    "whatsappNumber" TEXT,
    "contactEmail" TEXT,
    "joinNote" TEXT,
    "updatedByAdminId" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SiteSettings_featuredCampaignId_fkey" FOREIGN KEY ("featuredCampaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

