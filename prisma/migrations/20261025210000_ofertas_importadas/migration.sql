-- AlterTable
ALTER TABLE "StoreOffer" ADD COLUMN     "perDollar" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "upTo" BOOLEAN NOT NULL DEFAULT false;

