-- CreateTable
CREATE TABLE "MissionTelemetry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT NOT NULL,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "altAGL" REAL,
    "altMSL" REAL,
    "heading" REAL,
    "gimbalPitch" REAL,
    "speedMS" REAL,
    "batteryPct" INTEGER,
    CONSTRAINT "MissionTelemetry_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "DroneMission" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MissionEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "missionId" TEXT NOT NULL,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "meta" TEXT,
    CONSTRAINT "MissionEvent_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "DroneMission" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_File" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT,
    "leadId" TEXT,
    "missionId" TEXT,
    "category" TEXT NOT NULL,
    "folder" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mime" TEXT,
    "size" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "File_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "File_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "File_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "File_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "DroneMission" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_File" ("category", "contactId", "createdAt", "folder", "id", "leadId", "mime", "name", "path", "size", "tenantId") SELECT "category", "contactId", "createdAt", "folder", "id", "leadId", "mime", "name", "path", "size", "tenantId" FROM "File";
DROP TABLE "File";
ALTER TABLE "new_File" RENAME TO "File";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MissionTelemetry_missionId_ts_idx" ON "MissionTelemetry"("missionId", "ts");

-- CreateIndex
CREATE INDEX "MissionEvent_missionId_ts_idx" ON "MissionEvent"("missionId", "ts");

-- CreateIndex
CREATE INDEX "MissionEvent_missionId_type_idx" ON "MissionEvent"("missionId", "type");
