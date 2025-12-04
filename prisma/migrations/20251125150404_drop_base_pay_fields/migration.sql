/*
  Warnings:

  - You are about to drop the column `basePayAmount` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `basePayPeriod` on the `User` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "tenantId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "commissionPercent" REAL,
    "payStructuresJson" TEXT,
    "ratePerSquare" REAL,
    "salaryRate" REAL,
    "salaryMode" TEXT,
    CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_User" ("commissionPercent", "createdAt", "email", "id", "name", "payStructuresJson", "ratePerSquare", "role", "salaryMode", "salaryRate", "tenantId") SELECT "commissionPercent", "createdAt", "email", "id", "name", "payStructuresJson", "ratePerSquare", "role", "salaryMode", "salaryRate", "tenantId" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_tenantId_name_key" ON "User"("tenantId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
