-- Negociação vinda do Chat Balcões: com quem está negociando (quem postou o pedido no grupo)
ALTER TABLE "MilesDeal" ADD COLUMN "sourceContact" TEXT;
-- as já registradas: o nome está na primeira linha das observações ("Pedido de <nome> no grupo ...")
UPDATE "MilesDeal" SET "sourceContact" = substring("notes" from '^Pedido de (.+?) no grupo ')
WHERE "sourceRef" LIKE 'tg:%' AND "sourceContact" IS NULL AND "notes" LIKE 'Pedido de % no grupo %';
