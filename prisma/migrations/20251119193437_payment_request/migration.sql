-- CreateTable
CREATE TABLE "CrewPaymentRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "pastJobId" TEXT,
    "crewUserId" TEXT,
    "amount" REAL,
    "rateTier" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrewPaymentRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CrewPaymentRequest_tenantId_createdAt_idx" ON "CrewPaymentRequest"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "CrewPaymentRequest_crewUserId_idx" ON "CrewPaymentRequest"("crewUserId");

-- CreateIndex
CREATE INDEX "CrewPaymentRequest_appointmentId_idx" ON "CrewPaymentRequest"("appointmentId");
