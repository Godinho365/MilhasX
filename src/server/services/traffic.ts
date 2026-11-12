// Tráfego: a conexão com o Meta (token criptografado), as contas de anúncios escolhidas (até 3) e o relatório do
// período por campanha, conjunto ou anúncio, guardado por um tempo para não bater no limite de chamadas do Meta,
// com os pedidos que chegaram pela página da agência ligados a cada linha.
import type { Prisma } from "@prisma/client";
import { prisma, DomainError, audit, log } from "../db";
import { encrypt, decrypt, credentialsEnabled } from "./accounts";
import { MetaError, adAccounts, exchangeCode, insights, metaEnabled, metaMe, revoke, type MetaAdAccount } from "../meta";
import { brDay } from "@/domain/brasilia";
import { addDays } from "@/domain/calendar";
import {
  attributeOrders, parseInsight, pickUtm, trafficRange, trafficTotals,
  type TrafficLevel, type TrafficPeriod, type TrafficRow,
} from "@/domain/traffic";

export const MAX_ACCOUNTS = 3;
/** Quanto tempo vale a cópia do relatório: com o dia de hoje, 15 minutos; só dias passados, 6 horas. */
const FRESH_TODAY_MS = 15 * 60_000;
const FRESH_PAST_MS = 6 * 3_600_000;

export async function trafficState(userId: string) {
  const c = await prisma.trafficConnection.findUnique({ where: { userId } });
  return {
    enabled: metaEnabled() && credentialsEnabled(),
    connection: c ? {
      name: c.metaUserName, status: c.status as "OK" | "EXPIRED", expiresAt: c.expiresAt?.toISOString() ?? null,
      accounts: (Array.isArray(c.accounts) ? c.accounts : []) as MetaAdAccount[], selected: c.selected, connectedAt: c.createdAt.toISOString(),
    } : null,
  };
}
export type TrafficState = Awaited<ReturnType<typeof trafficState>>;

function metaFail(e: unknown): never {
  if (e instanceof MetaError) {
    if (e.limited) throw new DomainError(429, "O Meta limitou as consultas agora. Tente de novo em alguns minutos.");
    log("error", "traffic.meta_error", { code: e.code, status: e.status });
    throw new DomainError(502, "O Meta não respondeu como esperado. Tente de novo.");
  }
  throw e;
}

/** Fim da conexão (retorno do Meta): guarda o token criptografado e as contas; escolhe as 3 primeiras ativas. */
export async function finishMetaConnection(req: Request, userId: string, code: string, actorId: string) {
  if (!metaEnabled() || !credentialsEnabled()) throw new DomainError(503, "A conexão com o Meta não está configurada neste servidor");
  try {
    const { token, expiresAt } = await exchangeCode(req, code);
    const [me, accounts] = await Promise.all([metaMe(token), adAccounts(token)]);
    const old = await prisma.trafficConnection.findUnique({ where: { userId }, select: { selected: true } });
    const ids = new Set(accounts.map((a) => a.id));
    const kept = (old?.selected ?? []).filter((id) => ids.has(id));
    const selected = kept.length ? kept : accounts.filter((a) => a.status === 1).slice(0, MAX_ACCOUNTS).map((a) => a.id);
    const data = { metaUserId: me.id, metaUserName: me.name ?? "Conta do Facebook", tokenEnc: encrypt(token), expiresAt, accounts: accounts as unknown as Prisma.InputJsonValue, selected, status: "OK" };
    await prisma.trafficConnection.upsert({ where: { userId }, update: data, create: { userId, ...data } });
    await prisma.trafficReport.deleteMany({ where: { userId } });
    await audit(prisma, actorId, "traffic.connect", "TrafficConnection", userId, { accounts: accounts.length });
    return { accounts: accounts.length };
  } catch (e) {
    metaFail(e);
  }
}

export async function selectAccounts(userId: string, ids: string[]) {
  const c = await prisma.trafficConnection.findUnique({ where: { userId } });
  if (!c) throw new DomainError(404, "Conecte o Meta primeiro");
  const known = new Set(((Array.isArray(c.accounts) ? c.accounts : []) as MetaAdAccount[]).map((a) => a.id));
  const sel = [...new Set(ids)];
  if (sel.length > MAX_ACCOUNTS) throw new DomainError(400, `Escolha no máximo ${MAX_ACCOUNTS} contas de anúncios`);
  if (sel.some((id) => !known.has(id))) throw new DomainError(404, "Conta de anúncios não encontrada");
  await prisma.trafficConnection.update({ where: { userId }, data: { selected: sel } });
  return sel;
}

export async function disconnectMeta(userId: string, actorId: string) {
  const c = await prisma.trafficConnection.findUnique({ where: { userId } });
  if (!c) return;
  if (metaEnabled() && credentialsEnabled()) {
    try { await revoke(decrypt(c.tokenEnc)); } catch { /* o token pode já não valer; segue desconectando */ }
  }
  await prisma.$transaction([prisma.trafficReport.deleteMany({ where: { userId } }), prisma.trafficConnection.delete({ where: { userId } })]);
  await audit(prisma, actorId, "traffic.disconnect", "TrafficConnection", userId, {});
}

/** Relatório de uma conta: da cópia, se ainda vale; senão, do Meta. */
async function accountRows(userId: string, token: string, accountId: string, level: TrafficLevel, range: { since: string; until: string }, today: string, refresh: boolean) {
  const key = `${accountId}|${level}|${range.since}|${range.until}`;
  const cached = await prisma.trafficReport.findUnique({ where: { userId_key: { userId, key } } });
  const ttl = range.until >= today ? FRESH_TODAY_MS : FRESH_PAST_MS;
  if (cached && !refresh && Date.now() - cached.fetchedAt.getTime() < ttl) return { rows: cached.data as unknown as Record<string, unknown>[], fetchedAt: cached.fetchedAt };
  const rows = await insights(token, accountId, level, range);
  const fetchedAt = new Date();
  const data = rows as unknown as Prisma.InputJsonValue;
  await prisma.trafficReport.upsert({ where: { userId_key: { userId, key } }, update: { data, fetchedAt }, create: { userId, key, data, fetchedAt } });
  return { rows, fetchedAt };
}

/** Os pedidos que chegaram pela página no período (dias de Brasília) e de onde vieram. */
async function pageOrders(userId: string, range: { since: string; until: string }) {
  const from = new Date(`${range.since}T03:00:00Z`), to = new Date(`${addDays(range.until, 1)}T03:00:00Z`);
  const rows = await prisma.travelOrder.findMany({ where: { userId, source: "PUBLIC", createdAt: { gte: from, lt: to } }, select: { utm: true } });
  return rows.map((o) => pickUtm(o.utm as Record<string, unknown> | null));
}

export async function trafficReport(userId: string, q: { period: TrafficPeriod; since?: string | null; until?: string | null; level: TrafficLevel; account?: string | null; refresh?: boolean }) {
  const today = brDay();
  const range = trafficRange(q.period, today, { since: q.since, until: q.until });
  if (!range) throw new DomainError(400, "Período inválido (no máximo um ano, até hoje)");
  const c = await prisma.trafficConnection.findUnique({ where: { userId } });
  if (!c) throw new DomainError(404, "Conecte o Meta para ver os anúncios");
  if (c.status === "EXPIRED") throw new DomainError(409, "A conexão com o Meta venceu. Conecte de novo.");
  if (!metaEnabled() || !credentialsEnabled()) throw new DomainError(503, "A conexão com o Meta não está configurada neste servidor");
  const accounts = (Array.isArray(c.accounts) ? c.accounts : []) as MetaAdAccount[];
  const ids = q.account ? c.selected.filter((id) => id === q.account) : c.selected;
  if (!ids.length) return { range, level: q.level, rows: [] as TrafficRow[], totals: trafficTotals([]), orders: { page: 0, meta: 0, matched: 0 }, fetchedAt: null, currencies: [] as string[] };
  const token = decrypt(c.tokenEnc);
  let raw: { accountId: string; rows: Record<string, unknown>[]; fetchedAt: Date }[];
  try {
    raw = await Promise.all(ids.map(async (id) => ({ accountId: id, ...(await accountRows(userId, token, id, q.level, range, today, !!q.refresh)) })));
  } catch (e) {
    if (e instanceof MetaError && e.expired) {
      await prisma.trafficConnection.update({ where: { userId }, data: { status: "EXPIRED" } });
      throw new DomainError(409, "A conexão com o Meta venceu. Conecte de novo.");
    }
    metaFail(e);
  }
  const parsed = raw.flatMap((a) => a.rows.map((r) => parseInsight(r, q.level, a.accountId)));
  const utms = await pageOrders(userId, range);
  const att = attributeOrders(parsed, utms);
  const rows = att.rows.sort((a, b) => b.spendCents - a.spendCents || a.name.localeCompare(b.name));
  return {
    range, level: q.level, rows, totals: trafficTotals(rows),
    orders: { page: utms.length, meta: att.meta, matched: att.matched },
    fetchedAt: raw.map((a) => a.fetchedAt).sort((a, b) => a.getTime() - b.getTime())[0]?.toISOString() ?? null,
    currencies: [...new Set(accounts.filter((a) => ids.includes(a.id)).map((a) => a.currency))],
  };
}
export type TrafficReportView = Awaited<ReturnType<typeof trafficReport>>;
