// Simulações salvas: o botão "Simular" guarda os valores informados e a lista "Recentes" reabre.
import type { Prisma } from "@prisma/client";
import { prisma, DomainError } from "../db";
import type { SimulatorKind } from "@/domain/simulators";

const KEEP = 20; // guarda as 20 mais recentes por usuário

/** JSON com as chaves em ordem (o jsonb do Postgres não preserva a ordem original). */
const canonical = (o: unknown) => JSON.stringify(o, Object.keys((o ?? {}) as object).sort());

export function listSimulations(userId: string, limit = 10) {
  return prisma.simulation.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit, select: { id: true, kind: true, title: true, input: true, createdAt: true } });
}

export async function getSimulation(userId: string, id: string) {
  return prisma.simulation.findFirst({ where: { id, userId }, select: { id: true, kind: true, title: true, input: true } });
}

export async function saveSimulation(userId: string, input: { kind: SimulatorKind; title: string; input: Prisma.InputJsonObject }) {
  if (JSON.stringify(input.input).length > 4000) throw new DomainError(400, "Simulação grande demais");
  // Repetir a mesma simulação só atualiza a data, para não encher a lista de cópias
  const same = await prisma.simulation.findFirst({ where: { userId, kind: input.kind, title: input.title }, select: { id: true, input: true } });
  const sim = same && canonical(same.input) === canonical(input.input)
    ? await prisma.simulation.update({ where: { id: same.id }, data: { createdAt: new Date() } })
    : await prisma.simulation.create({ data: { userId, kind: input.kind, title: input.title, input: input.input } });
  const old = await prisma.simulation.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, skip: KEEP, select: { id: true } });
  if (old.length) await prisma.simulation.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  return sim;
}

export async function deleteSimulation(userId: string, id: string) {
  const { count } = await prisma.simulation.deleteMany({ where: { id, userId } });
  if (!count) throw new DomainError(404, "Simulação não encontrada");
}
