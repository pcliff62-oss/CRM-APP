/*
  Warnings:

  - A unique constraint covering the columns `[publicId]` on the table `Proposal` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[signToken]` on the table `Proposal` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN "grandTotal" REAL;
ALTER TABLE "Proposal" ADD COLUMN "publicId" TEXT;
ALTER TABLE "Proposal" ADD COLUMN "signToken" TEXT;
ALTER TABLE "Proposal" ADD COLUMN "signTokenExpires" DATETIME;
ALTER TABLE "Proposal" ADD COLUMN "signatureDataUrl" TEXT;
ALTER TABLE "Proposal" ADD COLUMN "signedAt" DATETIME;
ALTER TABLE "Proposal" ADD COLUMN "signerEmail" TEXT;
ALTER TABLE "Proposal" ADD COLUMN "signerName" TEXT;
ALTER TABLE "Proposal" ADD COLUMN "snapshotJson" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_publicId_key" ON "Proposal"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_signToken_key" ON "Proposal"("signToken");
