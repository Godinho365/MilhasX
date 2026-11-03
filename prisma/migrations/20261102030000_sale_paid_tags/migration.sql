-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

