-- CreateTable
CREATE TABLE "SalesPaymentRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "salesUserId" TEXT,
    "commissionPercent" REAL,
    "commissionAmount" REAL,
    "basePrice" REAL,
    "extrasTotal" REAL,
    "grandTotal" REAL,
    "customerName" TEXT,
    "address" TEXT,
    "extrasJson" TEXT,
    "paid" BOOLEAN DEFAULT false,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesPaymentRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SalesPaymentRequest_tenantId_createdAt_idx" ON "SalesPaymentRequest"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "SalesPaymentRequest_salesUserId_idx" ON "SalesPaymentRequest"("salesUserId");

-- CreateIndex
CREATE INDEX "SalesPaymentRequest_appointmentId_idx" ON "SalesPaymentRequest"("appointmentId");
