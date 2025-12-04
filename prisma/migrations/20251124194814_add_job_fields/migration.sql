-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "lastWeatherShiftAt" DATETIME;
ALTER TABLE "Tenant" ADD COLUMN "lastWeatherShiftDay" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "lastWeatherShiftResultJson" TEXT;
