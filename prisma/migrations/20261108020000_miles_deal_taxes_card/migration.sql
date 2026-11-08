-- Negociação do CRM Milhas: cartão em que as taxas da emissão foram pagas (vai para a fatura dele)
ALTER TABLE "MilesDeal" ADD COLUMN "taxesCardId" TEXT;

ALTER TABLE "MilesDeal" ADD CONSTRAINT "MilesDeal_taxesCardId_fkey" FOREIGN KEY ("taxesCardId") REFERENCES "CreditCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
