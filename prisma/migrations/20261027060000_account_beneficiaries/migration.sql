-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "beneficiaryLimit" INTEGER,
ADD COLUMN     "beneficiaryWindow" TEXT NOT NULL DEFAULT 'ROLLING_12M';

-- CreateTable
CREATE TABLE "AccountBeneficiary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "saleId" TEXT,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "usedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountBeneficiary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountBeneficiary_accountId_usedAt_idx" ON "AccountBeneficiary"("accountId", "usedAt");

-- AddForeignKey
ALTER TABLE "AccountBeneficiary" ADD CONSTRAINT "AccountBeneficiary_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountBeneficiary" ADD CONSTRAINT "AccountBeneficiary_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

