-- CreateEnum
CREATE TYPE "RelevanceLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "NewsArticleStatus" AS ENUM ('ACTIVE', 'DUPLICATE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NewsEventType" ADD VALUE 'PRODUCT';
ALTER TYPE "NewsEventType" ADD VALUE 'CAPITAL_ALLOCATION';
ALTER TYPE "NewsEventType" ADD VALUE 'BUYBACK';
ALTER TYPE "NewsEventType" ADD VALUE 'DIVIDEND';
ALTER TYPE "NewsEventType" ADD VALUE 'FINANCING';
ALTER TYPE "NewsEventType" ADD VALUE 'SUPPLY_CHAIN';
ALTER TYPE "NewsEventType" ADD VALUE 'CUSTOMER';
ALTER TYPE "NewsEventType" ADD VALUE 'PARTNERSHIP';
ALTER TYPE "NewsEventType" ADD VALUE 'ANALYST_ACTION';
ALTER TYPE "NewsEventType" ADD VALUE 'PRICE_MOVEMENT';

-- AlterTable
ALTER TABLE "NewsArticle" DROP COLUMN "importance",
ADD COLUMN     "duplicateOfId" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "provider" TEXT NOT NULL,
ADD COLUMN     "relatedSymbols" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "relevance" "RelevanceLevel",
ADD COLUMN     "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "status" "NewsArticleStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX "NewsArticle_publishedAt_idx" ON "NewsArticle"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsArticle_provider_externalId_key" ON "NewsArticle"("provider", "externalId");

-- AddForeignKey
ALTER TABLE "NewsArticle" ADD CONSTRAINT "NewsArticle_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "NewsArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

