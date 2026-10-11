-- DropIndex
DROP INDEX "Winner_participantId_key";

-- CreateIndex
CREATE INDEX "Winner_participantId_idx" ON "Winner"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "Winner_drawId_participantId_key" ON "Winner"("drawId", "participantId");


-- Winners now keep paying toward the final (bumper) draw instead of having later draws waived (D2, D3).
UPDATE "DrawPayment" SET "status" = 'NOT_PAID' WHERE "status" = 'WAIVED';
UPDATE "DrawPayment" SET "retainedCredit" = false WHERE "retainedCredit" = true;
