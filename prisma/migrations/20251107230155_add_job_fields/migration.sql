-- CreateTable
CREATE TABLE "PastJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT,
    "appointmentId" TEXT,
    "crewUserId" TEXT,
    "customerName" TEXT,
    "address" TEXT,
    "squares" REAL,
    "extrasJson" TEXT,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PastJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PastJob_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PastJob_tenantId_completedAt_idx" ON "PastJob"("tenantId", "completedAt");

-- CreateIndex
CREATE INDEX "PastJob_leadId_idx" ON "PastJob"("leadId");

-- CreateIndex
CREATE INDEX "PastJob_crewUserId_idx" ON "PastJob"("crewUserId");
