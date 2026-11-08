-- Faturas a pagar por cartão: despesa do Financeiro pode ser no cartão (vai para a fatura) e a fatura pode ser
-- marcada como paga. A fatura é calculada (compras no cartão que vencem no mesmo dia); aqui só fica o pagamento.
-- AlterTable
ALTER TABLE "FinTransaction" ADD COLUMN     "cardId" TEXT;

-- CreateTable
CREATE TABLE "CardBillPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardBillPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardBillPayment_userId_idx" ON "CardBillPayment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CardBillPayment_cardId_dueDate_key" ON "CardBillPayment"("cardId", "dueDate");

-- CreateIndex
CREATE INDEX "FinTransaction_cardId_idx" ON "FinTransaction"("cardId");

-- AddForeignKey
ALTER TABLE "FinTransaction" ADD CONSTRAINT "FinTransaction_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardBillPayment" ADD CONSTRAINT "CardBillPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardBillPayment" ADD CONSTRAINT "CardBillPayment_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

