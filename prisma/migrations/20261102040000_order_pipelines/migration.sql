-- Funis do CRM Passagens: cada usuário com pedidos ganha os 3 funis padrão
-- (Funil Comercial, Pós-Venda e Recuperação de Venda) e os pedidos vão para a
-- coluna equivalente à etapa antiga. Ids determinísticos (md5) para ligar pedido e coluna.

-- CreateTable
CREATE TABLE "OrderPipeline" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderPipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderPipelineStage" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#60a5fa',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderPipelineStage_pkey" PRIMARY KEY ("id")
);

-- Funis padrão para quem já tem pedidos (os demais ganham ao abrir o CRM)
INSERT INTO "OrderPipeline" ("id", "userId", "name", "position")
SELECT 'pl' || md5(u."userId" || ':' || p.key), u."userId", p.name, p.pos
FROM (SELECT DISTINCT "userId" FROM "TravelOrder") u
CROSS JOIN (VALUES ('comercial', 'Funil Comercial', 0), ('pos-venda', 'Pós-Venda', 1), ('recuperacao', 'Recuperação de Venda', 2)) AS p(key, name, pos);

INSERT INTO "OrderPipelineStage" ("id", "pipelineId", "name", "color", "position")
SELECT 'st' || md5(u."userId" || ':' || s.key), 'pl' || md5(u."userId" || ':' || s.pipeline), s.name, s.color, s.pos
FROM (SELECT DISTINCT "userId" FROM "TravelOrder") u
CROSS JOIN (VALUES
  ('NEW', 'comercial', 'Novos pedidos', '#60a5fa', 0),
  ('QUOTING', 'comercial', 'Pesquisa e cotação', '#f59e0b', 1),
  ('QUOTE_SENT', 'comercial', 'Cotação enviada', '#a78bfa', 2),
  ('NEGOTIATION', 'comercial', 'Negociação e emissão', '#fb923c', 3),
  ('ISSUED', 'comercial', 'Emitido', '#22c55e', 4),
  ('WAITING', 'pos-venda', 'Aguardando viagem', '#60a5fa', 0),
  ('TRAVELING', 'pos-venda', 'Viagem em curso', '#38bdf8', 1),
  ('FEEDBACK', 'pos-venda', 'Aguardando avaliação', '#f59e0b', 2),
  ('DONE', 'pos-venda', 'Viagem concluída', '#94a3b8', 3),
  ('LOST', 'recuperacao', 'Perdido recente', '#ef4444', 0),
  ('CONTACTED', 'recuperacao', 'Contato feito', '#f59e0b', 1),
  ('NEW_OFFER', 'recuperacao', 'Nova proposta', '#a78bfa', 2),
  ('RECOVERED', 'recuperacao', 'Recuperado', '#22c55e', 3)
) AS s(key, pipeline, name, color, pos);

-- Pedidos: da etapa antiga para a coluna nova
ALTER TABLE "TravelOrder" ADD COLUMN "stageId" TEXT;
UPDATE "TravelOrder" SET "stageId" = 'st' || md5("userId" || ':' || "stage"::text);
ALTER TABLE "TravelOrder" ALTER COLUMN "stageId" SET NOT NULL;

-- Histórico: guarda o nome da coluna em vez da chave da etapa antiga
UPDATE "OrderEvent" SET
  "fromStage" = CASE "fromStage" WHEN 'NEW' THEN 'Novos pedidos' WHEN 'QUOTING' THEN 'Pesquisa e cotação' WHEN 'QUOTE_SENT' THEN 'Cotação enviada' WHEN 'NEGOTIATION' THEN 'Negociação e emissão' WHEN 'ISSUED' THEN 'Emitido' WHEN 'TRAVELING' THEN 'Viagem em curso' WHEN 'DONE' THEN 'Viagem concluída' ELSE "fromStage" END,
  "toStage" = CASE "toStage" WHEN 'NEW' THEN 'Novos pedidos' WHEN 'QUOTING' THEN 'Pesquisa e cotação' WHEN 'QUOTE_SENT' THEN 'Cotação enviada' WHEN 'NEGOTIATION' THEN 'Negociação e emissão' WHEN 'ISSUED' THEN 'Emitido' WHEN 'TRAVELING' THEN 'Viagem em curso' WHEN 'DONE' THEN 'Viagem concluída' ELSE "toStage" END;

-- DropIndex
DROP INDEX "TravelOrder_userId_stage_idx";

-- AlterTable
ALTER TABLE "TravelOrder" DROP COLUMN "stage";

-- DropEnum
DROP TYPE "OrderStage";

-- CreateIndex
CREATE INDEX "OrderPipeline_userId_position_idx" ON "OrderPipeline"("userId", "position");

-- CreateIndex
CREATE INDEX "OrderPipelineStage_pipelineId_position_idx" ON "OrderPipelineStage"("pipelineId", "position");

-- CreateIndex
CREATE INDEX "TravelOrder_userId_stageId_idx" ON "TravelOrder"("userId", "stageId");

-- AddForeignKey
ALTER TABLE "OrderPipeline" ADD CONSTRAINT "OrderPipeline_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPipelineStage" ADD CONSTRAINT "OrderPipelineStage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "OrderPipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelOrder" ADD CONSTRAINT "TravelOrder_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "OrderPipelineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
