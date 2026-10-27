-- AlterTable
ALTER TABLE "SupplierAccount" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
