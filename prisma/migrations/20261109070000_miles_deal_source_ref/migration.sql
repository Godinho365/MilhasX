-- Negociação registrada a partir de um pedido do Chat Balcões: de qual mensagem veio (uma por pedido)
ALTER TABLE "MilesDeal" ADD COLUMN "sourceRef" TEXT;
CREATE UNIQUE INDEX "MilesDeal_userId_sourceRef_key" ON "MilesDeal"("userId", "sourceRef");
