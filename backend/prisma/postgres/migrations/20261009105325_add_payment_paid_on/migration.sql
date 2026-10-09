-- AlterTable
ALTER TABLE "PaymentTransaction" ADD COLUMN     "paidOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;


-- Existing payments were entered on the day they were paid.
UPDATE "PaymentTransaction" SET "paidOn" = "createdAt";
