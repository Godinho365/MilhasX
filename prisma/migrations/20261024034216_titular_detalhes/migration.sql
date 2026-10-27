-- AlterTable
ALTER TABLE "Holder" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "attributes" JSONB,
ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "documents" JSONB,
ADD COLUMN     "notes" TEXT;
