// Equipe: membros, tarefas em quadro, metas com resultados-chave e processos (passo a passo que vira tarefas).
import { prisma, DomainError } from "../db";
import { listSales } from "./sales";

const day = (d: Date) => d.toISOString().slice(0, 10);

async function ownMember(userId: string, memberId?: string | null) {
  if (memberId && !(await prisma.teamMember.findFirst({ where: { id: memberId, userId }, select: { id: true } }))) throw new DomainError(404, "Membro não encontrado");
}

/* ---------------- Membros ---------------- */

export type MemberInput = { name: string; role?: string | null; email?: string | null; phone?: string | null; color?: string; active?: boolean };

export async function listMembers(userId: string) {
  const rows = await prisma.teamMember.findMany({
    where: { userId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { tasks: { where: { status: { not: "DONE" } } } } } },
  });
  return rows.map((m) => ({ id: m.id, name: m.name, role: m.role, email: m.email, phone: m.phone, color: m.color, active: m.active, openTasks: m._count.tasks }));
}

export async function saveMember(userId: string, id: string | null, input: MemberInput) {
  const data = { name: input.name.trim(), role: input.role?.trim() || null, email: input.email?.trim().toLowerCase() || null, phone: input.phone?.trim() || null, ...(input.color ? { color: input.color } : {}), ...(input.active !== undefined ? { active: input.active } : {}) };
  if (!id) return (await prisma.teamMember.create({ data: { userId, ...data } })).id;
  const { count } = await prisma.teamMember.updateMany({ where: { id, userId }, data });
  if (!count) throw new DomainError(404, "Membro não encontrado");
  return id;
}

export async function deleteMember(userId: string, id: string) {
  const { count } = await prisma.teamMember.deleteMany({ where: { id, userId } });
  if (!count) throw new DomainError(404, "Membro não encontrado");
}

/* ---------------- Tarefas ---------------- */

export const TASK_STATUSES = ["TODO", "DOING", "DONE"] as const;
export type TaskInput = { title: string; description?: string | null; priority: string; memberId?: string | null; dueDate?: Date | null; status?: string };

export async function listTasks(userId: string, memberId?: string) {
  const rows = await prisma.task.findMany({
    where: { userId, memberId: memberId || undefined },
    include: { member: { select: { name: true, color: true } } },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((t) => ({ id: t.id, title: t.title, description: t.description, status: t.status, priority: t.priority, memberId: t.memberId, member: t.member?.name ?? null, memberColor: t.member?.color ?? null, dueDate: t.dueDate ? day(t.dueDate) : null, doneAt: t.doneAt?.toISOString() ?? null }));
}

export async function saveTask(userId: string, id: string | null, input: TaskInput) {
  await ownMember(userId, input.memberId);
  const data = { title: input.title.trim(), description: input.description?.trim() || null, priority: input.priority, memberId: input.memberId || null, dueDate: input.dueDate ?? null };
  if (!id) {
    const status = input.status ?? "TODO";
    return (await prisma.task.create({ data: { userId, ...data, status, doneAt: status === "DONE" ? new Date() : null } })).id;
  }
  const { count } = await prisma.task.updateMany({ where: { id, userId }, data });
  if (!count) throw new DomainError(404, "Tarefa não encontrada");
  return id;
}

/** Move a tarefa para a coluna (e posição), reordenando a coluna de destino. */
export async function moveTask(userId: string, id: string, status: string, position?: number) {
  const t = await prisma.task.findFirst({ where: { id, userId } });
  if (!t) throw new DomainError(404, "Tarefa não encontrada");
  await prisma.$transaction(async (tx) => {
    const column = await tx.task.findMany({ where: { userId, status, NOT: { id } }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true } });
    const at = Math.max(0, Math.min(position ?? column.length, column.length));
    const ids = [...column.slice(0, at).map((c) => c.id), id, ...column.slice(at).map((c) => c.id)];
    for (const [i, tid] of ids.entries()) {
      await tx.task.update({ where: { id: tid }, data: { position: i, ...(tid === id ? { status, doneAt: status === "DONE" ? t.doneAt ?? new Date() : null } : {}) } });
    }
  });
}

export async function deleteTask(userId: string, id: string) {
  const { count } = await prisma.task.deleteMany({ where: { id, userId } });
  if (!count) throw new DomainError(404, "Tarefa não encontrada");
}

/* ---------------- Metas ---------------- */

export const METRICS = { MANUAL: "Manual", REVENUE: "Faturamento (R$)", PROFIT: "Lucro (R$)", SALES: "Número de vendas", MILES: "Milhas vendidas", CUSTOMERS: "Clientes novos" } as const;
export type Metric = keyof typeof METRICS;
export type GoalInput = { title: string; period: "MONTH" | "QUARTER" | "YEAR"; start: Date; memberId?: string | null; keyResults: { id?: string; title: string; metric: Metric; target: number; current?: number }[] };

/** Fim do período (exclusivo): mês, trimestre ou ano a partir do primeiro dia. */
export function periodEnd(period: string, start: Date) {
  const months = period === "YEAR" ? 12 : period === "QUARTER" ? 3 : 1;
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1));
}
/** Primeiro dia do período que contém a data. */
export function periodStart(period: string, d: Date) {
  const m = period === "YEAR" ? 0 : period === "QUARTER" ? Math.floor(d.getUTCMonth() / 3) * 3 : d.getUTCMonth();
  return new Date(Date.UTC(d.getUTCFullYear(), m, 1));
}

/** Valor atual dos resultados medidos pelas vendas do período. */
async function measured(userId: string, start: Date, end: Date) {
  const sales = await listSales(userId, { from: start, to: new Date(end.getTime() - 86_400_000) });
  const sold = sales.filter((s) => !s.refund);
  const customers = await prisma.customer.count({ where: { userId, createdAt: { gte: start, lt: end } } });
  return {
    REVENUE: sales.reduce((t, s) => t + s.totalCents, 0),
    PROFIT: sales.reduce((t, s) => t + s.resultCents, 0),
    SALES: sold.length,
    MILES: sold.reduce((t, s) => t + s.points, 0),
    CUSTOMERS: customers,
  } as Record<Exclude<Metric, "MANUAL">, number>;
}

export async function listGoals(userId: string, period: "MONTH" | "QUARTER" | "YEAR", start: Date) {
  const goals = await prisma.goal.findMany({
    where: { userId, period, start },
    include: { keyResults: { orderBy: { position: "asc" } }, member: { select: { name: true, color: true } } },
    orderBy: { createdAt: "asc" },
  });
  const m = goals.some((g) => g.keyResults.some((k) => k.metric !== "MANUAL")) ? await measured(userId, start, periodEnd(period, start)) : null;
  return goals.map((g) => {
    const krs = g.keyResults.map((k) => {
      const current = k.metric === "MANUAL" ? k.current : m![k.metric as Exclude<Metric, "MANUAL">] ?? 0;
      return { id: k.id, title: k.title, metric: k.metric as Metric, target: k.target, current, progress: k.target > 0 ? Math.min(100, Math.round((current / k.target) * 100)) : 0 };
    });
    return { id: g.id, title: g.title, period: g.period, start: day(g.start), memberId: g.memberId, member: g.member?.name ?? null, memberColor: g.member?.color ?? null, keyResults: krs, progress: krs.length ? Math.round(krs.reduce((t, k) => t + k.progress, 0) / krs.length) : 0 };
  });
}

export async function saveGoal(userId: string, id: string | null, input: GoalInput) {
  await ownMember(userId, input.memberId);
  if (!input.keyResults.length) throw new DomainError(400, "Inclua ao menos um resultado-chave");
  const start = periodStart(input.period, input.start);
  const krs = input.keyResults.map((k, i) => ({ title: k.title.trim(), metric: k.metric, target: k.target, current: k.metric === "MANUAL" ? k.current ?? 0 : 0, position: i }));
  if (!id) return (await prisma.goal.create({ data: { userId, title: input.title.trim(), period: input.period, start, memberId: input.memberId || null, keyResults: { create: krs } } })).id;
  const g = await prisma.goal.findFirst({ where: { id, userId } });
  if (!g) throw new DomainError(404, "Meta não encontrada");
  await prisma.$transaction([
    prisma.keyResult.deleteMany({ where: { goalId: id } }),
    prisma.goal.update({ where: { id }, data: { title: input.title.trim(), period: input.period, start, memberId: input.memberId || null, keyResults: { create: krs } } }),
  ]);
  return id;
}

/** Check-in de um resultado-chave manual. */
export async function checkInKeyResult(userId: string, id: string, current: number) {
  const k = await prisma.keyResult.findFirst({ where: { id, goal: { userId } } });
  if (!k) throw new DomainError(404, "Resultado-chave não encontrado");
  if (k.metric !== "MANUAL") throw new DomainError(409, "Esse resultado é medido sozinho pelas vendas");
  await prisma.keyResult.update({ where: { id }, data: { current } });
}

export async function deleteGoal(userId: string, id: string) {
  const { count } = await prisma.goal.deleteMany({ where: { id, userId } });
  if (!count) throw new DomainError(404, "Meta não encontrada");
}

/* ---------------- Processos ---------------- */

export type ProcessInput = { title: string; description?: string | null; steps: { title: string; detail?: string | null }[] };

export async function listProcesses(userId: string) {
  const rows = await prisma.process.findMany({ where: { userId }, orderBy: { title: "asc" } });
  return rows.map((p) => ({ id: p.id, title: p.title, description: p.description, steps: (Array.isArray(p.steps) ? p.steps : []) as { title: string; detail?: string | null }[], updatedAt: p.updatedAt.toISOString() }));
}

export async function saveProcess(userId: string, id: string | null, input: ProcessInput) {
  const steps = input.steps.map((s) => ({ title: s.title.trim(), detail: s.detail?.trim() || null })).filter((s) => s.title);
  if (!steps.length) throw new DomainError(400, "Inclua ao menos uma etapa");
  const data = { title: input.title.trim(), description: input.description?.trim() || null, steps };
  if (!id) return (await prisma.process.create({ data: { userId, ...data } })).id;
  const { count } = await prisma.process.updateMany({ where: { id, userId }, data });
  if (!count) throw new DomainError(404, "Processo não encontrado");
  return id;
}

export async function deleteProcess(userId: string, id: string) {
  const { count } = await prisma.process.deleteMany({ where: { id, userId } });
  if (!count) throw new DomainError(404, "Processo não encontrado");
}

/** Usa o processo: cada etapa vira uma tarefa "A fazer" (com o responsável e o prazo escolhidos). */
export async function runProcess(userId: string, id: string, input: { label?: string | null; memberId?: string | null; dueDate?: Date | null }) {
  const p = await prisma.process.findFirst({ where: { id, userId } });
  if (!p) throw new DomainError(404, "Processo não encontrado");
  await ownMember(userId, input.memberId);
  const steps = (Array.isArray(p.steps) ? p.steps : []) as { title: string; detail?: string | null }[];
  const base = (await prisma.task.aggregate({ where: { userId, status: "TODO" }, _max: { position: true } }))._max.position ?? -1;
  const prefix = input.label?.trim() ? `${input.label.trim()} · ` : "";
  await prisma.task.createMany({
    data: steps.map((s, i) => ({ userId, title: `${prefix}${s.title}`, description: [p.title, s.detail].filter(Boolean).join("\n"), status: "TODO", priority: "MEDIUM", memberId: input.memberId || null, dueDate: input.dueDate ?? null, position: base + 1 + i })),
  });
  return steps.length;
}
