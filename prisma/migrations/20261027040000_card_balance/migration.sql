-- AlterTable
ALTER TABLE "CardInvoice" ADD COLUMN     "pointsIncluded" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CreditCard" ADD COLUMN     "balanceEntryId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CreditCard_balanceEntryId_key" ON "CreditCard"("balanceEntryId");

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_balanceEntryId_fkey" FOREIGN KEY ("balanceEntryId") REFERENCES "Entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

