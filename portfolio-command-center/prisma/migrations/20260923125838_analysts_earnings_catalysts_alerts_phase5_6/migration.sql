-- CreateEnum
CREATE TYPE "EarningsStatus" AS ENUM ('ESTIMATED', 'CONFIRMED', 'ACTUAL');

-- CreateEnum
CREATE TYPE "CatalystType" AS ENUM ('EARNINGS', 'GUIDANCE', 'PRODUCT_LAUNCH', 'MAJOR_CONTRACT', 'REGULATORY_EVENT', 'MERGER_ACQUISITION', 'INVESTOR_DAY', 'CAPITAL_ALLOCATION', 'LEGAL_REGULATORY_DECISION', 'ANALYST_REVISION', 'OTHER');

-- CreateEnum
CREATE TYPE "CatalystStatus" AS ENUM ('UPCOMING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CatalystSourceType" AS ENUM ('NEWS', 'EARNINGS', 'ANALYST_REVISION', 'MANUAL');

-- CreateEnum
CREATE TYPE "AlertCategory" AS ENUM ('PRICE_MOVEMENT', 'PNL_CHANGE', 'HIGH_RELEVANCE_NEWS', 'EARNINGS_APPROACHING', 'EARNINGS_RELEASED', 'ANALYST_TARGET_REVISION', 'ANALYST_RATING_CHANGE', 'MAJOR_CATALYST', 'CONCENTRATION_CHANGE', 'MARGIN_LIQUIDITY_THRESHOLD', 'EXPOSURE_CHANGE', 'DATA_CONNECTION_FAILURE', 'STALE_DATA', 'IBKR_CONNECTION_STATUS');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertReadState" AS ENUM ('NEW', 'READ', 'ACKNOWLEDGED');

-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "category" "AlertCategory" NOT NULL,
ADD COLUMN     "dedupeKey" TEXT NOT NULL,
ADD COLUMN     "explanation" TEXT NOT NULL,
ADD COLUMN     "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "readState" "AlertReadState" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "ruleId" TEXT,
ADD COLUMN     "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING',
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "symbol" TEXT,
ADD COLUMN     "title" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "AnalystEstimate" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "provider" TEXT NOT NULL,
ADD COLUMN     "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "AnalystRevision" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "provider" TEXT NOT NULL,
ADD COLUMN     "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Catalyst" ADD COLUMN     "dateConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "relevance" "RelevanceLevel",
ADD COLUMN     "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceType" "CatalystSourceType" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "status" "CatalystStatus" NOT NULL DEFAULT 'UPCOMING',
ADD COLUMN     "title" TEXT NOT NULL,
ADD COLUMN     "type" "CatalystType" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "url" TEXT;

-- CreateTable
CREATE TABLE "Earnings" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "period" TEXT,
    "reportDate" TIMESTAMP(3),
    "announcementTiming" TEXT,
    "estimatedEps" DECIMAL(18,4),
    "estimatedRevenue" DECIMAL(20,2),
    "actualEps" DECIMAL(18,4),
    "actualRevenue" DECIMAL(20,2),
    "status" "EarningsStatus" NOT NULL DEFAULT 'ESTIMATED',
    "source" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "AlertCategory" NOT NULL,
    "symbol" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "threshold" DECIMAL(18,6),
    "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING',
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 60,
    "notifyInApp" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Earnings_instrumentId_reportDate_idx" ON "Earnings"("instrumentId", "reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "Earnings_provider_externalId_key" ON "Earnings"("provider", "externalId");

-- CreateIndex
CREATE INDEX "AlertRule_userId_category_idx" ON "AlertRule"("userId", "category");

-- CreateIndex
CREATE INDEX "Alert_userId_dedupeKey_idx" ON "Alert"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "Alert_userId_readState_idx" ON "Alert"("userId", "readState");

-- CreateIndex
CREATE UNIQUE INDEX "AnalystEstimate_provider_externalId_key" ON "AnalystEstimate"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalystRevision_provider_externalId_key" ON "AnalystRevision"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Catalyst_sourceType_sourceId_key" ON "Catalyst"("sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "Earnings" ADD CONSTRAINT "Earnings_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertRule" ADD CONSTRAINT "AlertRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AlertRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

