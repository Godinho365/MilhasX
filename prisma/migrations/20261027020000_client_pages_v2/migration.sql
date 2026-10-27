-- AlterTable
ALTER TABLE "ContractSignature" ADD COLUMN     "address" TEXT,
ADD COLUMN     "birthDate" TEXT,
ADD COLUMN     "cpf" TEXT,
ADD COLUMN     "orderId" TEXT;

-- AlterTable
ALTER TABLE "MilesLead" ADD COLUMN     "incomeRange" TEXT,
ADD COLUMN     "programs" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "TravelOrder" ADD COLUMN     "proposal" JSONB,
ADD COLUMN     "reservation" JSONB;

-- CreateTable
CREATE TABLE "OrderAccess" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderAccess_sessionHash_key" ON "OrderAccess"("sessionHash");

-- CreateIndex
CREATE INDEX "OrderAccess_orderId_idx" ON "OrderAccess"("orderId");

-- AddForeignKey
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TravelOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAccess" ADD CONSTRAINT "OrderAccess_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TravelOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

