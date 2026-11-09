-- Termo de emissão: o texto padrão do usuário e quando foi mandado ao comprador de cada negociação
ALTER TABLE "UserPreference" ADD COLUMN "emissionTerms" TEXT;
ALTER TABLE "MilesDeal" ADD COLUMN "termsSentAt" TIMESTAMP(3);
