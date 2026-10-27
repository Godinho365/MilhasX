import { randomBytes, createHash } from "node:crypto";
import { prisma, DomainError, audit, log } from "../db";
import { sendMail } from "../mailer";
import { assertFeature } from "./plan-limits";
import { ENTRY_LABELS } from "@/domain/ledger";

// Página do titular: o dono da carteira envia um link de uso único ao e-mail autorizado do titular.
// Ao abrir, o link vira uma sessão só de leitura (cookie próprio, separado do login do app).
export const HOLDER_COOKIE = "mm_holder";
const LINK_HOURS = 24;
const SESSION_DAYS = 7;
const MAX_LINKS_PER_HOUR = 5;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const token = () => randomBytes(32).toString("base64url");

export async function sendHolderAccess(userId: string, holderId: string, appName: string) {
  const holder = await prisma.holder.findFirst({ where: { id: holderId, userId }, select: { id: true, name: true, accessEmail: true } });
  if (!holder) throw new DomainError(404, "Titular não encontrado");
  await assertFeature(userId, "holderPage");
  if (!holder.accessEmail) throw new DomainError(400, "Cadastre o e-mail autorizado do titular antes de enviar o acesso");
  // A origem do link vem só da configuração (nunca do cabeçalho Host)
  const base = process.env.APP_URL;
  if (!base) throw new DomainError(503, "APP_URL não configurada no servidor");
  const recent = await prisma.holderAccess.count({ where: { holderId, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (recent >= MAX_LINKS_PER_HOUR) throw new DomainError(429, "Muitos envios para este titular. Tente de novo mais tarde.");

  const t = token();
  await prisma.$transaction(async (tx) => {
    // Um link novo invalida os anteriores ainda não usados
    await tx.holderAccess.deleteMany({ where: { holderId, usedAt: null } });
    await tx.holderAccess.create({ data: { holderId, email: holder.accessEmail!, tokenHash: sha(t), expiresAt: new Date(Date.now() + LINK_HOURS * 3600_000) } });
    await audit(tx, userId, "holder.access_sent", "Holder", holderId);
  });
  await sendMail(
    holder.accessEmail,
    `Seus pontos no ${appName}`,
    `Olá, ${holder.name.split(" ")[0]}!\n\nVocê recebeu acesso para acompanhar os saldos das suas contas de pontos.\nAbra o link abaixo (vale por ${LINK_HOURS} horas e só pode ser usado uma vez):\n${new URL(base).origin}/api/holder-access/${t}\n\nSe você não esperava este e-mail, pode ignorá-lo.`,
  );
  return { email: holder.accessEmail };
}

/** Revoga todos os links e sessões do titular. */
export async function revokeHolderAccess(userId: string, holderId: string) {
  const holder = await prisma.holder.findFirst({ where: { id: holderId, userId }, select: { id: true } });
  if (!holder) throw new DomainError(404, "Titular não encontrado");
  const { count } = await prisma.holderAccess.deleteMany({ where: { holderId } });
  await audit(prisma, userId, "holder.access_revoked", "Holder", holderId);
  return count;
}

export async function holderAccessStatus(userId: string, holderId: string) {
  const rows = await prisma.holderAccess.findMany({ where: { holderId, holder: { userId } }, orderBy: { createdAt: "desc" }, take: 20 });
  const now = new Date();
  return {
    pendingLink: rows.some((r) => !r.usedAt && r.expiresAt > now),
    activeSessions: rows.filter((r) => r.sessionExpiresAt && r.sessionExpiresAt > now).length,
    lastSentAt: rows[0]?.createdAt.toISOString() ?? null,
  };
}

/** Troca o link (uso único) por uma sessão de leitura. Devolve null se inválido, usado ou expirado. */
export async function consumeHolderLink(raw: string) {
  const row = await prisma.holderAccess.findUnique({ where: { tokenHash: sha(raw) }, include: { holder: { select: { accessEmail: true } } } });
  if (!row || row.usedAt || row.expiresAt < new Date() || row.holder.accessEmail !== row.email) return null;
  const session = token();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  // updateMany com usedAt: null garante o uso único mesmo com dois cliques simultâneos
  const { count } = await prisma.holderAccess.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date(), sessionHash: sha(session), sessionExpiresAt: expiresAt },
  });
  if (!count) return null;
  log("info", "holder.access_opened", { holderId: row.holderId });
  return { session, expiresAt };
}

/** Dados que o titular vê: saldos e últimas movimentações das contas dele (sem custos do gestor). */
export async function holderView(rawSession: string | undefined) {
  if (!rawSession) return null;
  const row = await prisma.holderAccess.findUnique({
    where: { sessionHash: sha(rawSession) },
    include: { holder: { select: { id: true, name: true, accessEmail: true, userId: true, user: { select: { status: true } } } } },
  });
  if (!row || !row.sessionExpiresAt || row.sessionExpiresAt < new Date()) return null;
  // Trocar o e-mail autorizado ou desativar o dono encerra o acesso
  if (row.holder.accessEmail !== row.email || row.holder.user.status !== "ACTIVE") return null;
  const accounts = await prisma.account.findMany({
    where: { holderId: row.holder.id, archived: false },
    select: { id: true, balance: true, costCents: true, nickname: true, program: { select: { name: true, color: true, marketValueCpmCents: true } } },
    orderBy: { balance: "desc" },
  });
  const entries = await prisma.entry.findMany({
    where: { account: { holderId: row.holder.id, archived: false } },
    select: { id: true, type: true, status: true, points: true, occurredAt: true, account: { select: { program: { select: { name: true } } } } },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 30,
  });
  // Evolução do saldo total nos últimos 12 meses (a partir do saldo de hoje, desfazendo cada mês)
  const since = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 11, 1));
  const year = await prisma.entry.findMany({
    where: { account: { holderId: row.holder.id, archived: false }, status: "CONFIRMED", occurredAt: { gte: since } },
    select: { points: true, occurredAt: true },
  });
  const byMonth = new Map<string, number>();
  for (const e of year) { const k = e.occurredAt.toISOString().slice(0, 7); byMonth.set(k, (byMonth.get(k) ?? 0) + e.points); }
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  const series: { month: string; total: number }[] = [];
  let running = total;
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - i, 1));
    const k = d.toISOString().slice(0, 7);
    series.unshift({ month: k, total: running });
    running -= byMonth.get(k) ?? 0;
  }
  return {
    holder: row.holder.name,
    ownerId: row.holder.userId,
    sessionExpiresAt: row.sessionExpiresAt.toISOString(),
    accounts: accounts.map((a) => ({
      id: a.id, program: a.program.name, color: a.program.color, balance: a.balance, nickname: a.nickname,
      cpmCents: a.balance > 0 && a.costCents > 0 ? Math.round((a.costCents * 1000) / a.balance) : null,
      valueCents: Math.round((a.balance * a.program.marketValueCpmCents) / 1000),
    })),
    series,
    earned12m: year.filter((e) => e.points > 0).reduce((s, e) => s + e.points, 0),
    entries: entries.map((e) => ({ id: e.id, label: ENTRY_LABELS[e.type], pending: e.status === "PENDING", points: e.points, program: e.account.program.name, date: e.occurredAt.toISOString() })),
  };
}

export async function endHolderSession(rawSession: string | undefined) {
  if (!rawSession) return;
  await prisma.holderAccess.updateMany({ where: { sessionHash: sha(rawSession) }, data: { sessionExpiresAt: new Date(0) } });
}
