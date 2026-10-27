-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EntryType" ADD VALUE 'PARTNER_PURCHASE';
ALTER TYPE "EntryType" ADD VALUE 'FLIGHT';
ALTER TYPE "EntryType" ADD VALUE 'HOTEL';
ALTER TYPE "EntryType" ADD VALUE 'BONUS';

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "color" TEXT NOT NULL DEFAULT '#3b82f6';
