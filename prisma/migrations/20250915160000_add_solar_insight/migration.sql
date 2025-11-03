-- CreateTable
CREATE TABLE "SolarInsight" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "tenantId" TEXT NOT NULL,
  "propertyId" TEXT,
  "leadId" TEXT,
  "quality" TEXT NOT NULL,
  "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "totalM2" REAL,
  "totalSquares" REAL,
  "segmentsJson" TEXT NOT NULL,
  "rawJson" TEXT NOT NULL,
  CONSTRAINT "SolarInsight_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SolarInsight_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "SolarInsight_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "SolarInsight_property_quality_idx" ON "SolarInsight" ("propertyId", "quality");
