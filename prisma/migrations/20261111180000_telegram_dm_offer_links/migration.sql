-- Chat Balcões: cada pedido encaminhado no privado lembra de qual mensagem do grupo veio (botão "Ver no grupo" e
-- contrapropostas dos outros membros embaixo dele)
ALTER TABLE "TelegramDm" ADD COLUMN "offerLinks" JSONB;
