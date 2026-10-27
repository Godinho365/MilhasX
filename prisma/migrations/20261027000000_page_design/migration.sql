-- AlterTable
ALTER TABLE "SalesProfile" ADD COLUMN     "banner" BYTEA,
ADD COLUMN     "bannerMime" TEXT,
ADD COLUMN     "bannerUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "design" JSONB;

