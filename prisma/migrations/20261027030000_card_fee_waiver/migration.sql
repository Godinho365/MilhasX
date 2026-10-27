-- AlterTable
ALTER TABLE "CardInvoice" ADD COLUMN     "feeCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "CreditCard" ADD COLUMN     "feeWaiverCents" INTEGER;

