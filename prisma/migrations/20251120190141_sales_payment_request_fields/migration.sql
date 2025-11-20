/*
  Warnings:

  - You are about to drop the column `basePrice` on the `SalesPaymentRequest` table. All the data in the column will be lost.
  - You are about to drop the column `commissionAmount` on the `SalesPaymentRequest` table. All the data in the column will be lost.
  - You are about to drop the column `extrasTotal` on the `SalesPaymentRequest` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "CrewPaymentRequest_appointmentId_idx";

-- DropIndex
DROP INDEX "CrewPaymentRequest_crewUserId_idx";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SalesPaymentRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT,
    "appointmentId" TEXT,
    "salesUserId" TEXT,
    "salesUserName" TEXT,
    "commissionPercent" REAL,
    "contractPrice" REAL,
    "customerName" TEXT,
    "address" TEXT,
    "extrasJson" TEXT,
    "grandTotal" REAL,
    "amount" REAL,
    "paid" BOOLEAN DEFAULT false,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesPaymentRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesPaymentRequest_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesPaymentRequest_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesPaymentRequest_salesUserId_fkey" FOREIGN KEY ("salesUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SalesPaymentRequest" ("address", "appointmentId", "commissionPercent", "createdAt", "customerName", "extrasJson", "grandTotal", "id", "paid", "paidAt", "salesUserId", "tenantId") SELECT "address", "appointmentId", "commissionPercent", "createdAt", "customerName", "extrasJson", "grandTotal", "id", "paid", "paidAt", "salesUserId", "tenantId" FROM "SalesPaymentRequest";
DROP TABLE "SalesPaymentRequest";
ALTER TABLE "new_SalesPaymentRequest" RENAME TO "SalesPaymentRequest";
CREATE INDEX "SalesPaymentRequest_tenantId_createdAt_idx" ON "SalesPaymentRequest"("tenantId", "createdAt");
CREATE INDEX "SalesPaymentRequest_tenantId_salesUserId_idx" ON "SalesPaymentRequest"("tenantId", "salesUserId");
CREATE INDEX "SalesPaymentRequest_leadId_idx" ON "SalesPaymentRequest"("leadId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CrewPaymentRequest_tenantId_crewUserId_idx" ON "CrewPaymentRequest"("tenantId", "crewUserId");

-- CreateIndex
CREATE INDEX "CrewPaymentRequest_tenantId_appointmentId_idx" ON "CrewPaymentRequest"("tenantId", "appointmentId");

-- CreateIndex
CREATE INDEX "Lead_tenantId_createdAt_idx" ON "Lead"("tenantId", "createdAt");
