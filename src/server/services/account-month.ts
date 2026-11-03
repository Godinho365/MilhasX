// Resumo de uma conta (titular × programa) num mês: vendas, rendimento e movimentações do mês,
// mais a situação de hoje (saldo, custo, CPFs e clube), como na Central de Contas da referência.
import { prisma } from "../db";
import { listSales } from "./sales";
import { beneficiaryUsage } from "./accounts";
import { clubActiveAccounts } from "./wallet";
import { cpmCents } from "@/domain/ledger";

/** "AAAA-MM" válido ou o mês atual (Brasília). */
export function monthOrCurrent(m: string | undefined, now = new Date()) {
  if (m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return m;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(now).slice(0, 7);
}

export function shiftMonth(m: string, delta: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y!, mo! - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export async function accountMonth(userId: string, accountId: string, month: string, now = new Date()) {
  const from = new Date(`${month}-01T00:00:00Z`);
  const next = new Date(`${shiftMonth(month, 1)}-01T00:00:00Z`);
  const lastDay = new Date(next.getTime() - 86_400_000);
  const acc = await prisma.account.findFirstOrThrow({ where: { id: accountId, userId }, select: { balance: true, costCents: true } });
  const [sales, entries, usage, clubs, firstClub] = await Promise.all([
    listSales(userId, { from, to: lastDay, accountId }),
    prisma.entry.findMany({ where: { accountId, occurredAt: { gte: from, lt: next } }, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }], take: 500 }),
    beneficiaryUsage(userId, now),
    clubActiveAccounts(userId, now),
    prisma.entry.findFirst({ where: { accountId, type: "CLUB" }, orderBy: { occurredAt: "asc" }, select: { occurredAt: true } }),
  ]);
  const live = sales; // reembolsada já entra só com a taxa no resultado
  const profitCents = live.reduce((t, s) => t + s.resultCents, 0);
  const investedCents = live.reduce((t, s) => t + s.investedCents, 0);
  const cpf = usage[accountId] ?? null;
  const cpfsFree = cpf?.limit != null ? Math.max(0, cpf.limit - cpf.used) : null;
  const clubActive = clubs.has(accountId);
  const clubMonths = firstClub ? Math.max(0, (now.getUTCFullYear() - firstClub.occurredAt.getUTCFullYear()) * 12 + now.getUTCMonth() - firstClub.occurredAt.getUTCMonth()) : null;
  const inPts = entries.filter((e) => e.points > 0).reduce((t, e) => t + e.points, 0);
  const outPts = entries.filter((e) => e.points < 0).reduce((t, e) => t + e.points, 0);
  return {
    month,
    sales: { count: live.length, profitCents, totalCents: live.reduce((t, s) => t + s.totalCents, 0), roePct: investedCents > 0 ? Math.round((profitCents / investedCents) * 10_000) / 100 : null },
    balance: acc.balance,
    cpmCents: cpmCents(acc.costCents, acc.balance),
    stockCents: acc.costCents,
    cpf,
    // milhas que cada CPF livre ainda pode receber, se o saldo fosse todo emitido
    perCpf: cpfsFree ? Math.floor(acc.balance / cpfsFree) : null,
    club: { active: clubActive, since: firstClub ? firstClub.occurredAt.toISOString().slice(0, 10) : null, months: clubActive ? clubMonths : null },
    entries: entries.map((e) => ({ id: e.id, occurredAt: e.occurredAt.toISOString().slice(0, 10), type: e.type, points: e.points, costCents: e.costCents, description: e.description, status: e.status })),
    totals: { inPts, outPts, costCents: entries.reduce((t, e) => t + e.costCents, 0) },
  };
}
export type AccountMonth = Awaited<ReturnType<typeof accountMonth>>;
