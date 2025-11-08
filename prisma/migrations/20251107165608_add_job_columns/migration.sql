-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "attachmentsJson" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "completedAt" DATETIME;
ALTER TABLE "Appointment" ADD COLUMN "crewId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "extrasJson" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "jobStatus" TEXT DEFAULT 'scheduled';
ALTER TABLE "Appointment" ADD COLUMN "materialOrdered" BOOLEAN DEFAULT false;
ALTER TABLE "Appointment" ADD COLUMN "squares" REAL;

-- CreateTable
CREATE TABLE "ProposalView" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proposalId" TEXT NOT NULL,
    "viewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    CONSTRAINT "ProposalView_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProposalView_proposalId_viewedAt_idx" ON "ProposalView"("proposalId", "viewedAt");
