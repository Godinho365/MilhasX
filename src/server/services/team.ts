// Equipe: membros, parceiros, tarefas em quadros, metas com resultados-chave e processos (passo a passo que vira tarefas).
import { prisma, DomainError } from "../db";
import { listSales } from "./sales";
import { detectAttachment, MAX_BYTES, MAX_FILES } from "./holder-files";
import { nextDue, columnStatus, BASIC_COLUMNS, type Recurrence, type BoardColumn } from "@/domain/team";
import { brDay } from "@/domain/brasilia";
import { dropMemberLogin } from "./team-access";
import { ROLE_LABEL, rolePermissions, type RoleKey } from "@/domain/permissions";
import { statsFor } from "@/domain/commissions";

const day = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);

async function ownMember(userId: string, memberId?: string | null) {
  if (memberId && !(await prisma.teamMember.findFirst({ where: { id: memberId, userId }, select: { id: true } }))) throw new DomainError(404, "Membro não encontrado");
}
async function ownMembers(userId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length && (await prisma.teamMember.count({ where: { id: { in: unique }, userId } })) !== unique.length) throw new DomainError(404, "Membro não encontrado");
  return unique;
}

/* ---------------- Membros ---------------- */

export type MemberInput = { name: string; role?: string | null; email?: string | null; phone?: string | null; color?: string; active?: boolean; issuer?: boolean };

export async function listMembers(userId: string) {
  const [rows, open] = await Promise.all([
    prisma.teamMember.findMany({ where: { userId }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    prisma.task.findMany({ where: { userId, status: { not: "DONE" } }, select: { memberIds: true } }),
  ]);
  const count = (id: string) => open.filter((t) => t.memberIds.includes(id)).length;
  const now = new Date();
  return rows.map((m) => ({
    id: m.id, name: m.name, role: m.role, email: m.email, phone: m.phone, color: m.color, active: m.active, issuer: m.issuer, openTasks: count(m.id), createdAt: m.createdAt.toISOString(),
    // acesso ao app: NONE (só cadastro), INVITED (convite pendente), EXPIRED (convite vencido) ou ACTIVE (entra com login)
    access: {
      status: (m.loginUserId ? "ACTIVE" : m.inviteTokenHash ? (m.inviteExpiresAt && m.inviteExpiresAt > now ? "INVITED" : "EXPIRED") : "NONE") as "NONE" | "INVITED" | "EXPIRED" | "ACTIVE",
      role: (m.accessRole as RoleKey | null) ?? null,
      roleLabel: m.accessRole ? ROLE_LABEL[m.accessRole as RoleKey] ?? null : null,
      permissions: m.accessRole ? rolePermissions(m.accessRole as RoleKey, m.permissions) : [],
      invitedAt: m.invitedAt?.toISOString() ?? null, joinedAt: m.joinedAt?.toISOString() ?? null, lastSeenAt: m.lastSeenAt?.toISOString() ?? null,
    },
  }));
}

export async function saveMember(userId: string, id: string | null, input: MemberInput) {
  const data = {
    name: input.name.trim(), role: input.role?.trim() || null, email: input.email?.trim().toLowerCase() || null, phone: input.phone?.trim() || null,
    ...(input.color ? { color: input.color } : {}), ...(input.active !== undefined ? { active: input.active } : {}), ...(input.issuer !== undefined ? { issuer: input.issuer } : {}),
  };
  if (!id) return (await prisma.teamMember.create({ data: { userId, ...data } })).id;
  // desativado: perde o acesso ao app na hora (o login sai; para voltar, convide de novo)
  if (input.active === false) {
    await dropMemberLogin(userId, id);
    Object.assign(data, { accessRole: null, permissions: [], inviteTokenHash: null, inviteExpiresAt: null, joinedAt: null, lastSeenAt: null });
  }
  const { count } = await prisma.teamMember.updateMany({ where: { id, userId }, data });
  if (!count) throw new DomainError(404, "Membro não encontrado");
  return id;
}

/** Tira o membro e tira ele das tarefas em que estava. */
export async function deleteMember(userId: string, id: string) {
  await dropMemberLogin(userId, id); // o login do membro sai junto
  const { count } = await prisma.teamMember.deleteMany({ where: { id, userId } });
  if (!count) throw new DomainError(404, "Membro não encontrado");
  const tasks = await prisma.task.findMany({ where: { userId, memberIds: { has: id } }, select: { id: true, memberIds: true } });
  for (const t of tasks) await prisma.task.update({ where: { id: t.id }, data: { memberIds: t.memberIds.filter((m) => m !== id) } });
}

/* ---------------- Parceiros ---------------- */

export type PartnerInput = { name: string; mode: "PROFIT_PCT" | "SALE_PCT" | "FIXED"; value: number; notes?: string | null; active?: boolean };

export async function listPartners(userId: string) {
  const rows = await prisma.partner.findMany({ where: { userId }, orderBy: [{ active: "desc" }, { name: "asc" }], include: { sales: { where: { refundedAt: null }, select: { partnerCommissionCents: true } } } });
  return rows.map((p) => ({ id: p.id, name: p.name, mode: p.mode, value: p.value, notes: p.notes, active: p.active, sales: p.sales.length, commissionCents: p.sales.reduce((t, s) => t + s.partnerCommissionCents, 0) }));
}

export async function savePartner(userId: string, id: string | null, input: PartnerInput) {
  if (input.mode !== "FIXED" && input.value > 100_00) throw new DomainError(400, "A porcentagem vai até 100%");
  const data = { name: input.name.trim(), mode: input.mode, value: input.value, notes: input.notes?.trim() || null, ...(input.active !== undefined ? { active: input.active } : {}) };
  if (!id) return (await prisma.partner.create({ data: { userId, ...data } })).id;
  const { count } = await prisma.partner.updateMany({ where: { id, userId }, data });
  if (!count) throw new DomainError(404, "Parceiro não encontrado");
  return id;
}

export async function deletePartner(userId: string, id: string) {
  const { count } = await prisma.partner.deleteMany({ where: { id, userId } });
  if (!count) throw new DomainError(404, "Parceiro não encontrado");
}

/* ---------------- Quadros de tarefas ---------------- */

const columnsOf = (v: unknown) => (Array.isArray(v) ? (v as BoardColumn[]).filter((c) => c && typeof c.id === "string" && typeof c.name === "string") : []);

/** O quadro "Equipe" nasce sozinho (colunas básicas); tarefas antigas sem quadro vão para ele. */
export async function listBoards(userId: string) {
  let boards = await prisma.taskBoard.findMany({ where: { userId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  if (!boards.length) {
    const b = await prisma.taskBoard.create({ data: { userId, name: "Equipe", columns: BASIC_COLUMNS } });
    await prisma.task.updateMany({ where: { userId, boardId: null }, data: { boardId: b.id } });
    boards = [b];
  }
  return boards.map((b) => ({ id: b.id, name: b.name, description: b.description, columns: columnsOf(b.columns), restricted: b.restricted, memberIds: b.memberIds }));
}
export type BoardView = Awaited<ReturnType<typeof listBoards>>[number];

export type BoardInput = { name: string; description?: string | null; columns?: { id?: string; name: string }[]; restricted?: boolean; memberIds?: string[] };

/** Colunas novas ganham id; as que já existiam mantêm o seu (as tarefas continuam nelas). */
function cleanColumns(cols: { id?: string; name: string }[]) {
  const seen = new Set<string>();
  return cols.map((c) => {
    let id = c.id?.trim() || "";
    if (!id || seen.has(id)) id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    seen.add(id);
    return { id, name: c.name.trim() };
  });
}

export async function saveBoard(userId: string, id: string | null, input: BoardInput) {
  // só muda colunas e acesso quando vierem (renomear não mexe neles)
  const data = {
    name: input.name.trim(), description: input.description?.trim() || null,
    ...(input.restricted !== undefined ? { restricted: input.restricted, memberIds: input.restricted ? await ownMembers(userId, input.memberIds ?? []) : [] } : {}),
    ...(input.columns ? { columns: cleanColumns(input.columns) } : {}),
  };
  if (!id) {
    const last = await prisma.taskBoard.aggregate({ where: { userId }, _max: { position: true } });
    return (await prisma.taskBoard.create({ data: { userId, ...data, columns: data.columns ?? BASIC_COLUMNS, position: (last._max.position ?? -1) + 1 } })).id;
  }
  const { count } = await prisma.taskBoard.updateMany({ where: { id, userId }, data });
  if (!count) throw new DomainError(404, "Quadro não encontrado");
  return id;
}

/** O último quadro não sai; as tarefas do quadro excluído vão junto. */
export async function deleteBoard(userId: string, id: string) {
  await ownBoard(userId, id);
  if ((await prisma.taskBoard.count({ where: { userId } })) <= 1) throw new DomainError(409, "Você precisa ter ao menos um quadro");
  await prisma.taskBoard.delete({ where: { id } });
}

async function ownBoard(userId: string, boardId: string) {
  const b = await prisma.taskBoard.findFirst({ where: { id: boardId, userId }, select: { id: true, columns: true } });
  if (!b) throw new DomainError(404, "Quadro não encontrado");
  return columnsOf(b.columns);
}

/* ---------------- Tarefas ---------------- */

export const TASK_STATUSES = ["TODO", "DOING", "DONE"] as const;
export const STATUS_LABELS: Record<string, string> = { TODO: "Pendente", DOING: "Em progresso", DONE: "Concluída" };
type ChecklistItem = { text: string; done: boolean };
export type TaskInput = {
  boardId?: string | null; title: string; description?: string | null; priority: string; memberIds?: string[];
  dueDate?: Date | null; dueTime?: string | null; status?: string; columnId?: string | null; recurrence?: Recurrence; checklist?: ChecklistItem[];
};

const checklistOf = (v: unknown) => (Array.isArray(v) ? (v as ChecklistItem[]).filter((i) => i && typeof i.text === "string") : []);

export async function listTasks(userId: string, f: { boardId?: string; memberId?: string; q?: string } = {}) {
  const q = f.q?.trim();
  const [rows, members] = await Promise.all([
    prisma.task.findMany({
      where: {
        userId, boardId: f.boardId || undefined, memberIds: f.memberId ? { has: f.memberId } : undefined,
        ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}),
      },
      include: { _count: { select: { comments: { where: { kind: "COMMENT" } }, attachments: true } } },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    }),
    prisma.teamMember.findMany({ where: { userId }, select: { id: true, name: true, color: true } }),
  ]);
  const byId = new Map(members.map((m) => [m.id, m]));
  return rows.map((t) => {
    const checklist = checklistOf(t.checklist);
    return {
      id: t.id, boardId: t.boardId, title: t.title, description: t.description, status: t.status, columnId: t.columnId, priority: t.priority,
      memberIds: t.memberIds, members: t.memberIds.map((id) => byId.get(id)).filter((m): m is NonNullable<typeof m> => !!m),
      dueDate: t.dueDate ? day(t.dueDate) : null, dueTime: t.dueTime, recurrence: t.recurrence as Recurrence, checklist,
      checklistDone: checklist.filter((i) => i.done).length, comments: t._count.comments, attachments: t._count.attachments,
      doneAt: t.doneAt?.toISOString() ?? null, createdAt: t.createdAt.toISOString(),
    };
  });
}
export type TaskView = Awaited<ReturnType<typeof listTasks>>[number];

const activity = (taskId: string, text: string) => prisma.taskComment.create({ data: { taskId, kind: "ACTIVITY", text } });

export async function saveTask(userId: string, id: string | null, input: TaskInput) {
  const memberIds = await ownMembers(userId, input.memberIds ?? []);
  const boardId = input.boardId ?? (await listBoards(userId))[0]!.id;
  const cols = await ownBoard(userId, boardId);
  const col = input.columnId ? cols.findIndex((c) => c.id === input.columnId) : -1;
  if (input.columnId && col < 0) throw new DomainError(400, "Coluna não encontrada neste quadro");
  if (input.dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.dueTime)) throw new DomainError(400, "Horário inválido (use HH:MM)");
  const data = {
    boardId, title: input.title.trim(), description: input.description?.trim() || null, priority: input.priority, memberIds,
    dueDate: input.dueDate ?? null, dueTime: input.dueDate && input.dueTime ? input.dueTime : null,
    recurrence: input.recurrence ?? "NONE", checklist: (input.checklist ?? []).map((i) => ({ text: i.text.trim(), done: !!i.done })).filter((i) => i.text),
  };
  if (!id) {
    const status = col >= 0 ? columnStatus(cols, col) : input.status ?? "TODO";
    const t = await prisma.task.create({ data: { userId, ...data, status, columnId: col >= 0 ? input.columnId : null, doneAt: status === "DONE" ? new Date() : null } });
    await activity(t.id, "Tarefa criada");
    return t.id;
  }
  const cur = await prisma.task.findFirst({ where: { id, userId } });
  if (!cur) throw new DomainError(404, "Tarefa não encontrada");
  // trocou de quadro: a coluna antiga não existe lá, vale a da situação
  await prisma.task.update({ where: { id }, data: { ...data, ...(boardId !== cur.boardId ? { columnId: null } : {}) } });
  if (col >= 0 && input.columnId !== cur.columnId) await moveTaskToColumn(userId, id, input.columnId!);
  else if (input.status && input.status !== cur.status) await moveTask(userId, id, input.status);
  return id;
}

/** Arrastar para uma coluna do quadro: a primeira é pendente, a última concluída, as do meio em progresso. */
export async function moveTaskToColumn(userId: string, id: string, columnId: string, position?: number) {
  const t = await prisma.task.findFirst({ where: { id, userId }, select: { board: { select: { columns: true } } } });
  if (!t) throw new DomainError(404, "Tarefa não encontrada");
  const cols = columnsOf(t.board?.columns);
  const idx = cols.findIndex((c) => c.id === columnId);
  if (idx < 0) throw new DomainError(400, "Coluna não encontrada neste quadro");
  await moveTask(userId, id, columnStatus(cols, idx), position, columnId);
}

/** Move a tarefa de situação (e posição). Concluir uma tarefa recorrente cria a próxima, com o prazo seguinte. */
export async function moveTask(userId: string, id: string, status: string, position?: number, columnId: string | null = null) {
  const t = await prisma.task.findFirst({ where: { id, userId } });
  if (!t) throw new DomainError(404, "Tarefa não encontrada");
  await prisma.$transaction(async (tx) => {
    const column = await tx.task.findMany({ where: { userId, boardId: t.boardId, status, NOT: { id } }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true } });
    const at = Math.max(0, Math.min(position ?? column.length, column.length));
    const ids = [...column.slice(0, at).map((c) => c.id), id, ...column.slice(at).map((c) => c.id)];
    for (const [i, tid] of ids.entries()) {
      await tx.task.update({ where: { id: tid }, data: { position: i, ...(tid === id ? { status, columnId, doneAt: status === "DONE" ? t.doneAt ?? new Date() : null } : {}) } });
    }
    if (t.status !== status) await tx.taskComment.create({ data: { taskId: id, kind: "ACTIVITY", text: `${STATUS_LABELS[t.status] ?? t.status} → ${STATUS_LABELS[status] ?? status}` } });
    // recorrente concluída: a próxima entra pendente, com o checklist desmarcado
    if (status === "DONE" && t.status !== "DONE" && t.recurrence !== "NONE") {
      const next = nextDue(t.dueDate ? day(t.dueDate) : brDay(), t.recurrence as Recurrence);
      if (next) {
        const n = await tx.task.create({
          data: { userId, boardId: t.boardId, title: t.title, description: t.description, priority: t.priority, memberIds: t.memberIds, dueDate: utc(next), dueTime: t.dueTime, recurrence: t.recurrence, checklist: checklistOf(t.checklist).map((i) => ({ text: i.text, done: false })), status: "TODO" },
        });
        await tx.taskComment.create({ data: { taskId: n.id, kind: "ACTIVITY", text: "Criada pela recorrência" } });
      }
    }
  });
}

/** Na visão por pessoa, arrastar para a coluna de outra pessoa passa a tarefa para ela. */
export async function assignTask(userId: string, id: string, memberId: string | null) {
  await ownMember(userId, memberId);
  const t = await prisma.task.findFirst({ where: { id, userId } });
  if (!t) throw new DomainError(404, "Tarefa não encontrada");
  await prisma.task.update({ where: { id }, data: { memberIds: memberId ? [memberId] : [] } });
}

/** Marca ou desmarca um item do checklist. */
export async function toggleChecklist(userId: string, id: string, index: number, done: boolean) {
  const t = await prisma.task.findFirst({ where: { id, userId } });
  if (!t) throw new DomainError(404, "Tarefa não encontrada");
  const list = checklistOf(t.checklist);
  if (!list[index]) throw new DomainError(404, "Item não encontrado");
  list[index] = { ...list[index]!, done };
  await prisma.task.update({ where: { id }, data: { checklist: list } });
}

export async function deleteTask(userId: string, id: string) {
  const { count } = await prisma.task.deleteMany({ where: { id, userId } });
  if (!count) throw new DomainError(404, "Tarefa não encontrada");
}

/* ---------------- Comentários e anexos da tarefa ---------------- */

async function ownTask(userId: string, id: string) {
  const t = await prisma.task.findFirst({ where: { id, userId }, select: { id: true } });
  if (!t) throw new DomainError(404, "Tarefa não encontrada");
  return t;
}

export async function taskDetail(userId: string, id: string) {
  await ownTask(userId, id);
  const [comments, files] = await Promise.all([
    prisma.taskComment.findMany({ where: { taskId: id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.taskAttachment.findMany({ where: { taskId: id }, select: { id: true, name: true, mime: true, size: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
  ]);
  return { comments: comments.map((c) => ({ id: c.id, kind: c.kind, text: c.text, createdAt: c.createdAt.toISOString() })), files: files.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() })) };
}

export async function addTaskComment(userId: string, id: string, text: string) {
  await ownTask(userId, id);
  await prisma.taskComment.create({ data: { taskId: id, kind: "COMMENT", text: text.trim() } });
}

export async function addTaskFile(userId: string, id: string, name: string, buf: Buffer) {
  await ownTask(userId, id);
  if (buf.length === 0) throw new DomainError(400, "Arquivo vazio");
  if (buf.length > MAX_BYTES) throw new DomainError(413, "Arquivo maior que 10 MB");
  const mime = detectAttachment(buf);
  if (!mime) throw new DomainError(415, "Envie PNG, JPEG, WEBP, HEIC ou PDF");
  if ((await prisma.taskAttachment.count({ where: { taskId: id } })) >= MAX_FILES) throw new DomainError(409, `No máximo ${MAX_FILES} arquivos por tarefa`);
  const clean = name.replace(/[\\/]/g, "_").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120) || "arquivo";
  await prisma.taskAttachment.create({ data: { taskId: id, name: clean, mime, size: buf.length, data: new Uint8Array(buf) } });
  await activity(id, `Anexo: ${clean}`);
}

export async function getTaskFile(userId: string, id: string, fileId: string) {
  await ownTask(userId, id);
  const a = await prisma.taskAttachment.findFirst({ where: { id: fileId, taskId: id } });
  if (!a) throw new DomainError(404, "Anexo não encontrado");
  return { name: a.name, mime: a.mime, data: Buffer.from(a.data) };
}

export async function deleteTaskFile(userId: string, id: string, fileId: string) {
  await ownTask(userId, id);
  const { count } = await prisma.taskAttachment.deleteMany({ where: { id: fileId, taskId: id } });
  if (!count) throw new DomainError(404, "Anexo não encontrado");
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

/**
 * Valor atual dos resultados medidos pelas vendas do período: os da empresa (meta sem responsável) ou os de um
 * membro (só as vendas que ele emitiu, a parte dele quando a venda tem vários emissores; clientes novos são da empresa).
 */
async function measured(userId: string, start: Date, end: Date) {
  const sales = await listSales(userId, { from: start, to: new Date(end.getTime() - 86_400_000) });
  const sold = sales.filter((s) => !s.refund);
  const customers = await prisma.customer.count({ where: { userId, createdAt: { gte: start, lt: end } } });
  type Values = Record<Exclude<Metric, "MANUAL">, number>;
  const company: Values = {
    REVENUE: sales.reduce((t, s) => t + s.totalCents, 0),
    PROFIT: sales.reduce((t, s) => t + s.resultCents, 0),
    SALES: sold.length,
    MILES: sold.reduce((t, s) => t + s.points, 0),
    CUSTOMERS: customers,
  };
  const lite = sales.map((s) => ({ occurredAt: s.date, issuerIds: s.issuerIds, totalCents: s.totalCents, resultCents: s.resultCents, points: s.points, refunded: !!s.refund }));
  return (memberId: string | null): Values => {
    if (!memberId) return company;
    const st = statsFor(lite, memberId, "INDIVIDUAL");
    return { REVENUE: Math.round(st.revenue), PROFIT: Math.round(st.profit), SALES: Math.round(st.sales * 10) / 10, MILES: Math.round(st.miles), CUSTOMERS: customers };
  };
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
      const current = k.metric === "MANUAL" ? k.current : m!(g.memberId)[k.metric as Exclude<Metric, "MANUAL">] ?? 0;
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
export async function runProcess(userId: string, id: string, input: { label?: string | null; memberId?: string | null; dueDate?: Date | null; boardId?: string | null }) {
  const p = await prisma.process.findFirst({ where: { id, userId } });
  if (!p) throw new DomainError(404, "Processo não encontrado");
  await ownMember(userId, input.memberId);
  const steps = (Array.isArray(p.steps) ? p.steps : []) as { title: string; detail?: string | null }[];
  const boardId = input.boardId ?? (await listBoards(userId))[0]!.id;
  await ownBoard(userId, boardId);
  const base = (await prisma.task.aggregate({ where: { userId, boardId, status: "TODO" }, _max: { position: true } }))._max.position ?? -1;
  const prefix = input.label?.trim() ? `${input.label.trim()} · ` : "";
  await prisma.task.createMany({
    data: steps.map((s, i) => ({ userId, boardId, title: `${prefix}${s.title}`, description: [p.title, s.detail].filter(Boolean).join("\n"), status: "TODO", priority: "MEDIUM", memberIds: input.memberId ? [input.memberId] : [], dueDate: input.dueDate ?? null, position: base + 1 + i })),
  });
  return steps.length;
}
