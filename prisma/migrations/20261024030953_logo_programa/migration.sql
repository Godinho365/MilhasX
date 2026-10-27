-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "logo" BYTEA,
ADD COLUMN     "logoMime" TEXT,
ADD COLUMN     "logoUpdatedAt" TIMESTAMP(3);
