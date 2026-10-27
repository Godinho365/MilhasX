import type { Prisma, ProgramKind } from "@prisma/client";
import { prisma, DomainError, audit } from "../db";
import { evaluateStoreAlerts } from "./market";
import { detectImage } from "./extras";

export async function listUsers(q?: string) {
  return prisma.user.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : undefined,
    select: {
      id: true, name: true, email: true, role: true, status: true, createdAt: true,
      plan: true, planInterval: true, trialEndsAt: true, planRequest: true, planRequestInterval: true, deletionRequestedAt: true,
      _count: { select: { entries: true, accounts: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
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

export async function upsertStoreOffer(
  actorId: string,
  input: { storeName: string; programId?: string | null; pointsPerReal: number; cashbackBps: number; portal?: string | null },
) {
  const store = await prisma.store.upsert({ where: { name: input.storeName.trim() }, update: {}, create: { name: input.storeName.trim() } });
  const existing = await prisma.storeOffer.findFirst({ where: { storeId: store.id, programId: input.programId ?? null, portal: input.portal ?? null } });
  const data = { pointsPerReal: input.pointsPerReal, cashbackBps: input.cashbackBps };
  const offer = existing
    ? await prisma.storeOffer.update({ where: { id: existing.id }, data })
    : await prisma.storeOffer.create({ data: { ...data, storeId: store.id, programId: input.programId ?? null, portal: input.portal ?? null } });
  await audit(prisma, actorId, "admin.store_offer", "StoreOffer", offer.id, { store: store.name, ...data });
  await evaluateStoreAlerts(store.id);
  return offer;
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

export async function listAudit(opts: { action?: string; page?: number }) {
  const pageSize = 50;
  const page = Math.max(opts.page ?? 1, 1);
  const where: Prisma.AuditLogWhereInput = opts.action ? { action: { contains: opts.action } } : {};
  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { total, page, pages: Math.max(1, Math.ceil(total / pageSize)), items };
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

const csvCell = (v: unknown) => {
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
