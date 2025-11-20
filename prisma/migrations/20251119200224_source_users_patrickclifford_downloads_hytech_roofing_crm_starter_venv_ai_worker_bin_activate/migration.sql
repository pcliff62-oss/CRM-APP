-- AlterTable
ALTER TABLE "CrewPaymentRequest" ADD COLUMN "address" TEXT;
ALTER TABLE "CrewPaymentRequest" ADD COLUMN "attachmentsJson" TEXT;
ALTER TABLE "CrewPaymentRequest" ADD COLUMN "customerName" TEXT;
ALTER TABLE "CrewPaymentRequest" ADD COLUMN "extrasJson" TEXT;
ALTER TABLE "CrewPaymentRequest" ADD COLUMN "extrasTotal" REAL;
ALTER TABLE "CrewPaymentRequest" ADD COLUMN "grandTotal" REAL;
ALTER TABLE "CrewPaymentRequest" ADD COLUMN "installTotal" REAL;
ALTER TABLE "CrewPaymentRequest" ADD COLUMN "ratePerSquare" REAL;
ALTER TABLE "CrewPaymentRequest" ADD COLUMN "usedSquares" REAL;
