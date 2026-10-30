-- CRM Milhas: taxas da emissão, link do pedido e página do comprador (passageiros e localizador)
-- AlterTable
ALTER TABLE "MilesDeal" ADD COLUMN     "locator" TEXT,
ADD COLUMN     "orderLink" TEXT,
ADD COLUMN     "passengersAt" TIMESTAMP(3),
ADD COLUMN     "passengersData" JSONB,
ADD COLUMN     "shareToken" TEXT,
ADD COLUMN     "taxesCents" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "MilesDeal_shareToken_key" ON "MilesDeal"("shareToken");

