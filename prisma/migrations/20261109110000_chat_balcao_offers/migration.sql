-- Chat Balcões: alerta por lucro e lucro por CPF; conversa no privado ligada à contraproposta, com as não vistas
ALTER TABLE "TelegramAlert" ADD COLUMN "minProfitCents" INTEGER,
ADD COLUMN "minProfitPerCpfCents" INTEGER;

ALTER TABLE "TelegramDm" ADD COLUMN "closed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "seenUpTo" INTEGER,
ADD COLUMN "offerAt" TIMESTAMP(3),
ADD COLUMN "offer" JSONB;
