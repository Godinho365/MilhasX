-- Conta do Financeiro em que o pagamento da venda entrou (soma no saldo dela)
ALTER TABLE "Sale" ADD COLUMN "finAccountId" TEXT;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_finAccountId_fkey" FOREIGN KEY ("finAccountId") REFERENCES "FinAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
