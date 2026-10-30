-- CRM Milhas: negociações de venda de milhas (viram venda em Vendas ao chegar em "Pago")
-- CreateEnum
CREATE TYPE "MilesDealStage" AS ENUM ('NEW', 'NEGOTIATION', 'AWAITING', 'ISSUED', 'PAID');

-- CreateTable
CREATE TABLE "MilesDeal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "buyerType" TEXT NOT NULL DEFAULT 'FINAL',
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "stage" "MilesDealStage" NOT NULL DEFAULT 'NEW',
    "position" INTEGER NOT NULL DEFAULT 0,
    "accountId" TEXT,
    "points" INTEGER,
    "saleCpmCents" INTEGER,
    "profitCents" INTEGER,
    "passengers" INTEGER,
    "notes" TEXT,
    "saleId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MilesDeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MilesDeal_saleId_key" ON "MilesDeal"("saleId");

-- CreateIndex
CREATE INDEX "MilesDeal_userId_stage_idx" ON "MilesDeal"("userId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "MilesDeal_userId_number_key" ON "MilesDeal"("userId", "number");

-- AddForeignKey
ALTER TABLE "MilesDeal" ADD CONSTRAINT "MilesDeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilesDeal" ADD CONSTRAINT "MilesDeal_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilesDeal" ADD CONSTRAINT "MilesDeal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilesDeal" ADD CONSTRAINT "MilesDeal_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

