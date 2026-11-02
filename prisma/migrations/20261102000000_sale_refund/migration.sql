-- AlterEnum
ALTER TYPE "EntryType" ADD VALUE 'SALE_REFUND';

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "refundFeeCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "refundedAt" TIMESTAMP(3);

