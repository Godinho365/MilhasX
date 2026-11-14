import type { Prisma, ProgramKind } from "@prisma/client";
import { prisma, DomainError, audit } from "../db";
import { detectImage } from "./extras";
import { paging } from "@/lib/paging";

export const USER_FILTERS = ["paid", "trial", "request", "deletion", "disabled", "admin"] as const;
export type UserFilter = (typeof USER_FILTERS)[number];

function userFilterWhere(f: UserFilter, now = new Date()): Prisma.UserWhereInput {
  switch (f) {
    case "paid": return { plan: { not: "PESSOAL" } };
    case "trial": return { plan: "PESSOAL", trialEndsAt: { gt: now } };
    case "request": return { planRequest: { not: null } };
    case "deletion": return { deletionRequestedAt: { not: null } };
    case "disabled": return { status: "DISABLED" };
    case "admin": return { role: "ADMIN" };
  }
}

/** Quantos usuários caem em cada filtro rápido da aba Usuários. */
export async function userFilterCounts() {
  const counts = await Promise.all(USER_FILTERS.map((f) => prisma.user.count({ where: userFilterWhere(f) })));
  return { all: await prisma.user.count(), ...Object.fromEntries(USER_FILTERS.map((f, i) => [f, counts[i]!])) } as Record<UserFilter | "all", number>;
}

function usersWhere(q?: string, filter?: string | null): Prisma.UserWhereInput | undefined {
  const and: Prisma.UserWhereInput[] = [];
  if (q) and.push({ OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] });
  if (filter && (USER_FILTERS as readonly string[]).includes(filter)) and.push(userFilterWhere(filter as UserFilter));
  return and.length ? { AND: and } : undefined;
}

const USER_ROW = {
  id: true, name: true, email: true, role: true, status: true, createdAt: true,
  plan: true, planInterval: true, trialEndsAt: true, planRequest: true, planRequestInterval: true, deletionRequestedAt: true,
  _count: { select: { entries: true, accounts: true } },
} satisfies Prisma.UserSelect;
// Do mais novo para o mais antigo; o id desempata quem foi criado no mesmo instante (a paginação não repete nem pula ninguém)
const USER_ORDER = [{ createdAt: "desc" }, { id: "desc" }] satisfies Prisma.UserOrderByWithRelationInput[];

/** Busca rápida (API): os 200 cadastros mais recentes que batem com a busca e o filtro. */
export async function listUsers(q?: string, filter?: string | null) {
  return prisma.user.findMany({ where: usersWhere(q, filter), select: USER_ROW, orderBy: USER_ORDER, take: 200 });
}

export const USERS_PAGE_SIZE = 50;

/** Uma página da aba Usuários; a busca e o filtro valem para a lista e para o total. */
export async function listUsersPage(q: string | undefined, filter: string | null | undefined, page: number, pageSize = USERS_PAGE_SIZE) {
  const where = usersWhere(q, filter);
  const { skip, take, ...meta } = paging(await prisma.user.count({ where }), page, pageSize);
  return { ...meta, items: await prisma.user.findMany({ where, select: USER_ROW, orderBy: USER_ORDER, skip, take }) };
}

export async function setUserStatus(actorId: string, userId: string, status: "ACTIVE" | "DISABLED") {
  if (actorId === userId) throw new DomainError(400, "Você não pode alterar o status da sua própria conta");
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) throw new DomainError(404, "Usuário não encontrado");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { status } });
    if (status === "DISABLED") await tx.session.deleteMany({ where: { userId } });
    await audit(tx, actorId, status === "DISABLED" ? "admin.user_disable" : "admin.user_enable", "User", userId);
  });
}

export const listPrograms = (all = true) =>
  prisma.program.findMany({ where: all ? undefined : { active: true }, orderBy: { name: "asc" } });

export interface ProgramInput {
  name: string;
  code: string;
  kind: ProgramKind;
  active: boolean;
  marketValueCpmCents: number;
  color: string;
}

export async function upsertProgram(actorId: string, id: string | null, input: ProgramInput) {
  const code = input.code.trim().toUpperCase();
  const dup = await prisma.program.findFirst({ where: { code, NOT: id ? { id } : undefined } });
  if (dup) throw new DomainError(409, "Já existe um programa com essa sigla");
  const data = { ...input, name: input.name.trim(), code };
  const p = id ? await prisma.program.update({ where: { id }, data }) : await prisma.program.create({ data });
  await audit(prisma, actorId, id ? "admin.program_update" : "admin.program_create", "Program", p.id, data);
  return p;
}

const MAX_LOGO = 256 * 1024;

/** Imagem do programa (PNG/JPG/WebP validados pelo conteúdo). */
export async function setProgramLogo(actorId: string, programId: string, buf: Buffer) {
  if (buf.length === 0) throw new DomainError(400, "Arquivo vazio");
  if (buf.length > MAX_LOGO) throw new DomainError(413, "Imagem maior que 256 KB");
  const mime = detectImage(buf);
  if (!mime) throw new DomainError(415, "Envie uma imagem JPG, PNG ou WebP");
  if (!(await prisma.program.findUnique({ where: { id: programId }, select: { id: true } }))) throw new DomainError(404, "Programa não encontrado");
  const data = new Uint8Array(buf);
  await prisma.$transaction([
    prisma.programLogo.upsert({ where: { programId }, update: { data, mime }, create: { programId, data, mime } }),
    prisma.program.update({ where: { id: programId }, data: { logoUpdatedAt: new Date() } }),
  ]);
  await audit(prisma, actorId, "admin.program_logo", "Program", programId, { mime, bytes: buf.length });
}

export async function removeProgramLogo(actorId: string, programId: string) {
  await prisma.$transaction([
    prisma.programLogo.deleteMany({ where: { programId } }),
    prisma.program.updateMany({ where: { id: programId }, data: { logoUpdatedAt: null } }),
  ]);
  await audit(prisma, actorId, "admin.program_logo_remove", "Program", programId, {});
}

export async function getProgramLogo(programId: string) {
  const l = await prisma.programLogo.findUnique({ where: { programId } });
  return l ? { data: Buffer.from(l.data), mime: l.mime } : null;
}

export async function metrics() {
  const since = new Date(Date.now() - 30 * 86400_000);
  const [users, activeUsers, newUsers, entries, entries30, sales, programs] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.entry.count(),
    prisma.entry.count({ where: { createdAt: { gte: since } } }),
    prisma.sale.aggregate({ _sum: { totalCents: true }, _count: true }),
    prisma.program.count({ where: { active: true } }),
  ]);
  return { users, activeUsers, newUsers, entries, entries30, salesCount: sales._count, salesTotalCents: sales._sum.totalCents ?? 0, programs };
}

export const AUDIT_PAGE_SIZE = 50;

export async function listAudit(opts: { action?: string; page?: number }) {
  const where: Prisma.AuditLogWhereInput = opts.action ? { action: { contains: opts.action } } : {};
  // Página além da última mostra a última (antes mostrava uma tabela vazia com "Mostrando 951-50")
  const { skip, take, ...meta } = paging(await prisma.auditLog.count({ where }), opts.page ?? 1, AUDIT_PAGE_SIZE);
  const items = await prisma.auditLog.findMany({
    where,
    include: { actor: { select: { email: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip,
    take,
  });
  return { ...meta, items };
}

export async function getSettings() {
  const rows = await prisma.appSetting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, unknown>;
}

const SETTING_KEYS = ["registrationOpen", "supportEmail", "announcement"] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export async function setSetting(actorId: string, key: string, value: Prisma.InputJsonValue) {
  if (!SETTING_KEYS.includes(key as SettingKey)) throw new DomainError(400, "Parâmetro desconhecido");
  await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  await audit(prisma, actorId, "admin.setting", "AppSetting", key, { value });
}

export async function isRegistrationOpen() {
  const s = await prisma.appSetting.findUnique({ where: { key: "registrationOpen" } });
  return s ? s.value !== false : true;
}

export const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Evita injeção de fórmulas em planilhas
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",;\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function exportCsv(actorId: string, kind: "users" | "programs" | "audit") {
  let rows: unknown[][];
  if (kind === "users") {
    const users = await listUsers();
    rows = [["id", "nome", "email", "papel", "status", "criado_em", "contas", "lancamentos"],
      ...users.map((u) => [u.id, u.name, u.email, u.role, u.status, u.createdAt.toISOString(), u._count.accounts, u._count.entries])];
  } else if (kind === "programs") {
    const ps = await listPrograms();
    rows = [["id", "nome", "sigla", "tipo", "ativo", "valor_milheiro_centavos"], ...ps.map((p) => [p.id, p.name, p.code, p.kind, p.active, p.marketValueCpmCents])];
  } else {
    const logs = await prisma.auditLog.findMany({ include: { actor: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 5000 });
    rows = [["data", "ator", "acao", "alvo", "alvo_id"], ...logs.map((l) => [l.createdAt.toISOString(), l.actor?.email ?? "", l.action, l.targetType, l.targetId ?? ""])];
  }
  await audit(prisma, actorId, "admin.export", "Export", kind);
  return rows.map((r) => r.map(csvCell).join(";")).join("\n");
}

// ---------- Ficha do usuário ----------

/** Tudo que a ficha do usuário mostra: plano, assinaturas, uso, indicação e histórico. */
export async function userDetail(id: string) {
  const u = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, phone: true, role: true, status: true, createdAt: true, googleId: true, termsAcceptedAt: true,
      plan: true, planInterval: true, trialEndsAt: true, planRequest: true, planRequestInterval: true, planRequestedAt: true, deletionRequestedAt: true,
      referralCode: true, referredBy: { select: { id: true, name: true } }, workspaceOwnerId: true,
      _count: { select: { entries: true, accounts: true, holders: true, customers: true, sales: true, referrals: true, sessions: true } },
      subscriptions: { orderBy: { createdAt: "desc" }, take: 20, select: { id: true, plan: true, interval: true, amountCents: true, status: true, createdAt: true, updatedAt: true, externalId: true } },
    },
  });
  if (!u) return null;
  const [last, history] = await Promise.all([
    prisma.$queryRaw<{ at: Date | null; sessionAt: Date | null }[]>`
      SELECT (SELECT max("createdAt") FROM (
        SELECT "createdAt" FROM "Session" WHERE "userId" = ${id}
        UNION ALL SELECT "createdAt" FROM "Entry" WHERE "userId" = ${id}
        UNION ALL SELECT "createdAt" FROM "Sale" WHERE "userId" = ${id}) t) AS at,
      (SELECT max("createdAt") FROM "Session" WHERE "userId" = ${id}) AS "sessionAt"`,
    prisma.auditLog.findMany({
      where: { OR: [{ targetId: id }, { actorId: id }] },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
  ]);
  return { ...u, lastActivity: last[0]?.at ?? null, lastLogin: last[0]?.sessionAt ?? null, history };
}

/** Estende (ou começa) o teste grátis do Gestor. */
export async function extendTrial(actorId: string, userId: string, days: number) {
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new DomainError(400, "Informe de 1 a 365 dias");
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { trialEndsAt: true } });
  if (!u) throw new DomainError(404, "Usuário não encontrado");
  const now = Date.now();
  const base = u.trialEndsAt && u.trialEndsAt.getTime() > now ? u.trialEndsAt.getTime() : now;
  const trialEndsAt = new Date(base + days * 86400_000);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { trialEndsAt } });
    await tx.notification.create({ data: { userId, category: "billing", title: "Teste grátis estendido", body: `Você ganhou mais ${days} dias de teste do plano Gestor.` } });
    await audit(tx, actorId, "admin.trial_extend", "User", userId, { days, trialEndsAt: trialEndsAt.toISOString() });
  });
  return { trialEndsAt };
}

/** Registra que a administração chamou o usuário (Recuperação); a nota fica na auditoria. */
export async function logContact(actorId: string, userId: string, channel: "whatsapp" | "email", reason: string) {
  if (!(await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) throw new DomainError(404, "Usuário não encontrado");
  await audit(prisma, actorId, "admin.contact", "User", userId, { channel, reason: reason.slice(0, 60) });
}

// ---------- Solicitações LGPD (formulário público /privacidade/solicitacao) ----------

export const PRIVACY_STATUSES = ["NEW", "IN_PROGRESS", "DONE"] as const;
export const PRIVACY_DEADLINE_DAYS = 15; // prazo de resposta da LGPD (art. 19, II)

export const PRIVACY_PAGE_SIZE = 50;

export async function listPrivacyRequests(status: string | null, page = 1, pageSize = PRIVACY_PAGE_SIZE) {
  const st = (PRIVACY_STATUSES as readonly string[]).includes(status ?? "") ? status! : null;
  const grouped = await prisma.privacyRequest.groupBy({ by: ["status"], _count: true });
  const total = grouped.filter((g) => !st || g.status === st).reduce((t, g) => t + g._count, 0);
  const { skip, take, ...meta } = paging(total, page, pageSize);
  const items = await prisma.privacyRequest.findMany({ where: st ? { status: st } : undefined, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take });
  // Liga o pedido à conta com o mesmo e-mail, quando existe
  const accounts = await prisma.user.findMany({ where: { email: { in: [...new Set(items.map((i) => i.email))] } }, select: { id: true, email: true } });
  const byEmail = new Map(accounts.map((a) => [a.email, a.id]));
  return {
    status: st,
    paging: meta,
    counts: Object.fromEntries(PRIVACY_STATUSES.map((s) => [s, grouped.find((g) => g.status === s)?._count ?? 0])) as Record<(typeof PRIVACY_STATUSES)[number], number>,
    items: items.map((i) => ({ ...i, userId: byEmail.get(i.email) ?? null, dueAt: new Date(i.createdAt.getTime() + PRIVACY_DEADLINE_DAYS * 86400_000) })),
  };
}

export async function setPrivacyStatus(actorId: string, id: string, status: (typeof PRIVACY_STATUSES)[number]) {
  const r = await prisma.privacyRequest.update({ where: { id }, data: { status } }).catch(() => null);
  if (!r) throw new DomainError(404, "Pedido não encontrado");
  await audit(prisma, actorId, "admin.privacy_status", "PrivacyRequest", id, { status });
}
