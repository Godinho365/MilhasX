-- Alertas do Chat Balcões pelo pedido de compra: programa, até N CPFs, faixa de milhas e milheiro mínimo
ALTER TABLE "TelegramAlert" ADD COLUMN "program" TEXT;
ALTER TABLE "TelegramAlert" ADD COLUMN "maxCpfs" INTEGER;
ALTER TABLE "TelegramAlert" ADD COLUMN "minMiles" INTEGER;
ALTER TABLE "TelegramAlert" ADD COLUMN "maxMiles" INTEGER;
ALTER TABLE "TelegramAlert" ADD COLUMN "minCpmCents" INTEGER;
