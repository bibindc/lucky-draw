UPDATE "Prize"
SET "drawId" = (
    SELECT MIN("Winner"."drawId")
    FROM "Winner"
    WHERE "Winner"."prizeId" = "Prize"."id"
)
WHERE "drawId" IS NULL
  AND EXISTS (
      SELECT 1
      FROM "Winner"
      WHERE "Winner"."prizeId" = "Prize"."id"
  )
  AND 1 = (
      SELECT COUNT(DISTINCT "Winner"."drawId")
      FROM "Winner"
      WHERE "Winner"."prizeId" = "Prize"."id"
  );
