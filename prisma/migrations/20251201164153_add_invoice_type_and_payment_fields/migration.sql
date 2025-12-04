-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "contactId" TEXT,
    "appointmentId" TEXT,
    "number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "type" TEXT NOT NULL DEFAULT 'FINAL',
    "contractPrice" REAL,
    "depositAmount" REAL,
    "extrasJson" TEXT,
    "extrasTotal" REAL,
    "totalDue" REAL,
    "emailedAt" DATETIME,
    "viewedAt" DATETIME,
    "paidAt" DATETIME,
    "paidAmount" REAL,
    "paymentMethod" TEXT,
    "paymentRef" TEXT,
    "dueDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Invoice" ("appointmentId", "contactId", "contractPrice", "createdAt", "depositAmount", "dueDate", "emailedAt", "extrasJson", "extrasTotal", "id", "leadId", "number", "paidAt", "status", "tenantId", "totalDue", "updatedAt", "viewedAt") SELECT "appointmentId", "contactId", "contractPrice", "createdAt", "depositAmount", "dueDate", "emailedAt", "extrasJson", "extrasTotal", "id", "leadId", "number", "paidAt", "status", "tenantId", "totalDue", "updatedAt", "viewedAt" FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");
CREATE INDEX "Invoice_tenantId_leadId_idx" ON "Invoice"("tenantId", "leadId");
CREATE INDEX "Invoice_tenantId_status_dueDate_idx" ON "Invoice"("tenantId", "status", "dueDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
