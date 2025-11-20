/*
  Warnings:

  - You are about to drop the column `status` on the `CrewPaymentRequest` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CrewPaymentRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "pastJobId" TEXT,
    "crewUserId" TEXT,
    "amount" REAL,
    "rateTier" TEXT,
    "customerName" TEXT,
    "address" TEXT,
    "usedSquares" REAL,
    "ratePerSquare" REAL,
    "installTotal" REAL,
    "extrasTotal" REAL,
    "grandTotal" REAL,
    "extrasJson" TEXT,
    "attachmentsJson" TEXT,
    "paid" BOOLEAN DEFAULT false,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrewPaymentRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CrewPaymentRequest" ("address", "amount", "appointmentId", "attachmentsJson", "createdAt", "crewUserId", "customerName", "extrasJson", "extrasTotal", "grandTotal", "id", "installTotal", "paidAt", "pastJobId", "ratePerSquare", "rateTier", "tenantId", "usedSquares") SELECT "address", "amount", "appointmentId", "attachmentsJson", "createdAt", "crewUserId", "customerName", "extrasJson", "extrasTotal", "grandTotal", "id", "installTotal", "paidAt", "pastJobId", "ratePerSquare", "rateTier", "tenantId", "usedSquares" FROM "CrewPaymentRequest";
DROP TABLE "CrewPaymentRequest";
ALTER TABLE "new_CrewPaymentRequest" RENAME TO "CrewPaymentRequest";
CREATE INDEX "CrewPaymentRequest_tenantId_createdAt_idx" ON "CrewPaymentRequest"("tenantId", "createdAt");
CREATE INDEX "CrewPaymentRequest_crewUserId_idx" ON "CrewPaymentRequest"("crewUserId");
CREATE INDEX "CrewPaymentRequest_appointmentId_idx" ON "CrewPaymentRequest"("appointmentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
