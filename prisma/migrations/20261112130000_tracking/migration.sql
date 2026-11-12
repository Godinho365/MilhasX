-- Acompanhamentos: companhia/fornecedor, horários e as marcações de check-in e confirmação dos itens da venda
-- (IF NOT EXISTS: o banco de testes recebeu esta migração com outro nome durante o desenvolvimento)
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "provider" TEXT,
ADD COLUMN IF NOT EXISTS "departureTime" TEXT,
ADD COLUMN IF NOT EXISTS "returnTime" TEXT,
ADD COLUMN IF NOT EXISTS "doneOutAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "doneRetAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SaleItem_departureDate_idx" ON "SaleItem"("departureDate");
