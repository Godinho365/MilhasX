-- CRM Milhas: verificação antes da emissão (validação facial do titular na LATAM)
-- AlterTable
ALTER TABLE "MilesDeal" ADD COLUMN     "faceCheckAt" TIMESTAMP(3),
ADD COLUMN     "faceCheckStatus" TEXT,
ADD COLUMN     "faceCheckUrl" TEXT;

