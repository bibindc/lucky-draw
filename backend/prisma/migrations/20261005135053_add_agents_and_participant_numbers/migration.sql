-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentCode" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SequenceCounter" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "nextValue" INTEGER NOT NULL
);

INSERT INTO "SequenceCounter" ("name", "nextValue")
SELECT 'participant-number', 1000 + COUNT(*) FROM "Participant";
INSERT INTO "SequenceCounter" ("name", "nextValue") VALUES ('agent-code', 1000);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Admin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SUPER_ADMIN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Admin" ("createdAt", "email", "id", "name", "passwordHash", "updatedAt") SELECT "createdAt", "email", "id", "name", "passwordHash", "updatedAt" FROM "Admin";
DROP TABLE "Admin";
ALTER TABLE "new_Admin" RENAME TO "Admin";
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");
CREATE TABLE "new_Participant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "participantNumber" INTEGER NOT NULL DEFAULT 1000,
    "campaignId" TEXT NOT NULL,
    "agentId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "mobile" TEXT,
    "externalUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Participant_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Participant_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
WITH "ordered_participants" AS (
    SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS "sequenceNumber"
    FROM "Participant"
)
INSERT INTO "new_Participant" ("campaignId", "createdAt", "email", "externalUserId", "id", "mobile", "name", "participantNumber", "status", "updatedAt")
SELECT "Participant"."campaignId", "Participant"."createdAt", "Participant"."email", "Participant"."externalUserId", "Participant"."id", "Participant"."mobile", "Participant"."name", 999 + "ordered_participants"."sequenceNumber", "Participant"."status", "Participant"."updatedAt"
FROM "Participant"
JOIN "ordered_participants" ON "ordered_participants"."id" = "Participant"."id";
DROP TABLE "Participant";
ALTER TABLE "new_Participant" RENAME TO "Participant";
CREATE UNIQUE INDEX "Participant_participantNumber_key" ON "Participant"("participantNumber");
CREATE INDEX "Participant_campaignId_status_idx" ON "Participant"("campaignId", "status");
CREATE INDEX "Participant_campaignId_name_idx" ON "Participant"("campaignId", "name");
CREATE INDEX "Participant_agentId_createdAt_idx" ON "Participant"("agentId", "createdAt");
CREATE UNIQUE INDEX "Participant_campaignId_email_key" ON "Participant"("campaignId", "email");
CREATE UNIQUE INDEX "Participant_campaignId_mobile_key" ON "Participant"("campaignId", "mobile");
CREATE UNIQUE INDEX "Participant_campaignId_externalUserId_key" ON "Participant"("campaignId", "externalUserId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Agent_agentCode_key" ON "Agent"("agentCode");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_email_key" ON "Agent"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_mobile_key" ON "Agent"("mobile");
