-- Editar fatura do cartão: valor real e vencimento por fatura (CardBill), vários pagamentos por fatura
-- (pagamento parcial) e a conta do Financeiro de onde saiu cada pagamento.
-- DropIndex
DROP INDEX "CardBillPayment_cardId_dueDate_key";

-- AlterTable
ALTER TABLE "CardBillPayment" ADD COLUMN     "accountId" TEXT;

-- CreateTable
CREATE TABLE "CardBill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "realCents" INTEGER,
    "dueOverride" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardBill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardBill_userId_idx" ON "CardBill"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CardBill_cardId_dueDate_key" ON "CardBill"("cardId", "dueDate");

-- CreateIndex
CREATE INDEX "CardBillPayment_cardId_dueDate_idx" ON "CardBillPayment"("cardId", "dueDate");

-- AddForeignKey
ALTER TABLE "CardBillPayment" ADD CONSTRAINT "CardBillPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardBill" ADD CONSTRAINT "CardBill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardBill" ADD CONSTRAINT "CardBill_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

