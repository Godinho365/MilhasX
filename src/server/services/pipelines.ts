// Funis do CRM Passagens: cada usuário tem os seus, com colunas que ele cria, renomeia, pinta, reordena e exclui.
import { prisma, DomainError, type Tx } from "../db";
import { DEFAULT_PIPELINES, NEW_PIPELINE_STAGES } from "@/domain/pipelines";

export type PipelineView = { id: string; name: string; position: number; stages: { id: string; name: string; color: string; position: number; orders: number }[] };

/** Cria os funis padrão na primeira vez (com trava por usuário: duas abas abrindo juntas não duplicam). */
export async function ensurePipelines(userId: string) {
  if (await prisma.orderPipeline.count({ where: { userId } })) return;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pipelines:${userId}`}))`;
    if (await tx.orderPipeline.count({ where: { userId } })) return;
    for (const [i, p] of DEFAULT_PIPELINES.entries()) await createWithStages(tx, userId, p.name, i, p.stages);
  });
}

function createWithStages(tx: Tx, userId: string, name: string, position: number, stages: { name: string; color: string }[]) {
  return tx.orderPipeline.create({ data: { userId, name, position, stages: { create: stages.map((s, i) => ({ ...s, position: i })) } } });
}

export async function listPipelines(userId: string): Promise<PipelineView[]> {
  await ensurePipelines(userId);
  const rows = await prisma.orderPipeline.findMany({
    where: { userId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { stages: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], include: { _count: { select: { orders: true } } } } },
  });
  return rows.map((p) => ({ id: p.id, name: p.name, position: p.position, stages: p.stages.map((s) => ({ id: s.id, name: s.name, color: s.color, position: s.position, orders: s._count.orders })) }));
}

/** Primeira coluna do primeiro funil: onde entram os pedidos sem coluna escolhida (inclusive os da página pública). */
export async function entryStage(userId: string) {
  await ensurePipelines(userId);
  const s = await prisma.orderPipelineStage.findFirst({ where: { pipeline: { userId } }, orderBy: [{ pipeline: { position: "asc" } }, { pipeline: { createdAt: "asc" } }, { position: "asc" }, { createdAt: "asc" }] });
  if (!s) throw new DomainError(409, "Crie uma coluna no funil antes de adicionar pedidos");
  return s;
}

export async function ownStage(userId: string, stageId: string, db: Tx | typeof prisma = prisma) {
  const s = await db.orderPipelineStage.findFirst({ where: { id: stageId, pipeline: { userId } } });
  if (!s) throw new DomainError(404, "Coluna não encontrada");
  return s;
}
async function ownPipeline(userId: string, id: string) {
  const p = await prisma.orderPipeline.findFirst({ where: { id, userId } });
  if (!p) throw new DomainError(404, "Funil não encontrado");
  return p;
}

const MAX_PIPELINES = 20;
const MAX_STAGES = 20;

export async function createPipeline(userId: string, name: string) {
  await ensurePipelines(userId);
  const count = await prisma.orderPipeline.count({ where: { userId } });
  if (count >= MAX_PIPELINES) throw new DomainError(409, `No máximo ${MAX_PIPELINES} funis`);
  const last = await prisma.orderPipeline.aggregate({ where: { userId }, _max: { position: true } });
  const p = await prisma.$transaction((tx) => createWithStages(tx, userId, name.trim(), (last._max.position ?? -1) + 1, NEW_PIPELINE_STAGES));
  return p.id;
}

export async function renamePipeline(userId: string, id: string, name: string) {
  await ownPipeline(userId, id);
  await prisma.orderPipeline.update({ where: { id }, data: { name: name.trim() } });
}

/** Só sai o funil sem pedidos (nem arquivados), e sempre fica ao menos um. */
export async function deletePipeline(userId: string, id: string) {
  await ownPipeline(userId, id);
  if ((await prisma.orderPipeline.count({ where: { userId } })) <= 1) throw new DomainError(409, "Você precisa ter ao menos um funil");
  const orders = await prisma.travelOrder.count({ where: { userId, stage: { pipelineId: id } } });
  if (orders) throw new DomainError(409, `Esse funil tem ${orders} ${orders === 1 ? "pedido" : "pedidos"}. Mova para outro funil antes de excluir.`);
  await prisma.orderPipeline.delete({ where: { id } });
}

export async function addStage(userId: string, pipelineId: string, input: { name: string; color: string }) {
  await ownPipeline(userId, pipelineId);
  const count = await prisma.orderPipelineStage.count({ where: { pipelineId } });
  if (count >= MAX_STAGES) throw new DomainError(409, `No máximo ${MAX_STAGES} colunas por funil`);
  const last = await prisma.orderPipelineStage.aggregate({ where: { pipelineId }, _max: { position: true } });
  const s = await prisma.orderPipelineStage.create({ data: { pipelineId, name: input.name.trim(), color: input.color, position: (last._max.position ?? -1) + 1 } });
  return s.id;
}

/** Renomeia, troca a cor ou muda a coluna de lugar dentro do funil. */
export async function updateStage(userId: string, id: string, input: { name?: string; color?: string; position?: number }) {
  const s = await ownStage(userId, id);
  await prisma.$transaction(async (tx) => {
    if (input.name !== undefined || input.color !== undefined) await tx.orderPipelineStage.update({ where: { id }, data: { name: input.name?.trim(), color: input.color } });
    if (input.position !== undefined) {
      const others = await tx.orderPipelineStage.findMany({ where: { pipelineId: s.pipelineId, NOT: { id } }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true } });
      const at = Math.max(0, Math.min(input.position, others.length));
      const ids = [...others.slice(0, at).map((o) => o.id), id, ...others.slice(at).map((o) => o.id)];
      for (const [i, sid] of ids.entries()) await tx.orderPipelineStage.update({ where: { id: sid }, data: { position: i } });
    }
  });
}

/** Exclui a coluna; os pedidos dela (inclusive arquivados) vão para moveTo, que pode ser de outro funil. */
export async function deleteStage(userId: string, id: string, moveTo?: string) {
  const s = await ownStage(userId, id);
  if ((await prisma.orderPipelineStage.count({ where: { pipelineId: s.pipelineId } })) <= 1) throw new DomainError(409, "O funil precisa de ao menos uma coluna");
  const orders = await prisma.travelOrder.count({ where: { userId, stageId: id } });
  if (orders && !moveTo) throw new DomainError(409, `Essa coluna tem ${orders} ${orders === 1 ? "pedido" : "pedidos"}. Escolha para onde mover.`);
  if (moveTo === id) throw new DomainError(400, "Escolha outra coluna");
  await prisma.$transaction(async (tx) => {
    if (orders && moveTo) {
      const dest = await ownStage(userId, moveTo, tx);
      const base = (await tx.travelOrder.aggregate({ where: { userId, stageId: dest.id }, _max: { position: true } }))._max.position ?? -1;
      const moving = await tx.travelOrder.findMany({ where: { userId, stageId: id }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true } });
      for (const [i, o] of moving.entries()) {
        await tx.travelOrder.update({ where: { id: o.id }, data: { stageId: dest.id, position: base + 1 + i } });
        await tx.orderEvent.create({ data: { orderId: o.id, type: "stage", fromStage: s.name, toStage: dest.name, note: "Coluna excluída" } });
      }
    }
    await tx.orderPipelineStage.delete({ where: { id } });
  });
}
