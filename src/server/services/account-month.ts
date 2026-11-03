// Resumo de contas (titular × programa) num período: vendas, rendimento e movimentações do período,
// mais a situação de hoje (saldo, custo, CPFs e clube), como na Central de Contas da referência.
// Serve uma conta só ou todas as contas de um programa (visão "Todos os titulares").
import { prisma } from "../db";
import { listSales } from "./sales";
import { beneficiaryUsage } from "./accounts";
import { clubActiveAccounts } from "./wallet";
import { cpmCents } from "@/domain/ledger";
import { brDay } from "@/domain/brasilia";
import { monthRange, type DayRange } from "@/lib/day-range";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Período da URL (?de=&ate= ou ?periodo=tudo); sem nada, o mês atual. */
export function periodFromQuery(q: { de?: string; ate?: string; periodo?: string }, now = new Date()): DayRange {
  if (q.periodo === "tudo") return null;
  if (q.de && q.ate && DAY.test(q.de) && DAY.test(q.ate)) return q.de <= q.ate ? { from: q.de, to: q.ate } : { from: q.ate, to: q.de };
  return monthRange(brDay(now));
}

export async function accountsPeriod(userId: string, accountIds: string[], range: DayRange, now = new Date()) {
  const from = range ? new Date(`${range.from}T00:00:00Z`) : undefined;
  const until = range ? new Date(new Date(`${range.to}T00:00:00Z`).getTime() + 86_400_000) : undefined;
  const accs = await prisma.account.findMany({ where: { id: { in: accountIds }, userId }, select: { id: true, balance: true, costCents: true, holder: { select: { id: true, name: true } } } });
  const ids = accs.map((a) => a.id);
  const [salesLists, entries, usage, clubs, firstClubs, pending] = await Promise.all([
    Promise.all(ids.map((id) => listSales(userId, { from, to: range ? new Date(`${range.to}T00:00:00Z`) : undefined, accountId: id }))),
    prisma.entry.findMany({ where: { accountId: { in: ids }, occurredAt: from ? { gte: from, lt: until } : undefined }, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }], take: 500 }),
    beneficiaryUsage(userId, now),
    clubActiveAccounts(userId, now),
    prisma.entry.groupBy({ by: ["accountId"], where: { accountId: { in: ids }, type: "CLUB" }, _min: { occurredAt: true } }),
    prisma.entry.groupBy({ by: ["accountId"], where: { accountId: { in: ids }, status: "PENDING", points: { gt: 0 } }, _sum: { points: true } }),
  ]);
  const months = (d: Date) => Math.max(0, (now.getUTCFullYear() - d.getUTCFullYear()) * 12 + now.getUTCMonth() - d.getUTCMonth());
  const rows = accs.map((a, i) => {
    const sales = salesLists[i]!;
    const profitCents = sales.reduce((t, s) => t + s.resultCents, 0);
    const investedCents = sales.reduce((t, s) => t + s.investedCents, 0);
    const first = firstClubs.find((c) => c.accountId === a.id)?._min.occurredAt ?? null;
    const active = clubs.has(a.id);
    return {
      id: a.id, holderId: a.holder.id, holder: a.holder.name, balance: a.balance, stockCents: a.costCents, cpmCents: cpmCents(a.costCents, a.balance),
      pendingPoints: pending.find((p) => p.accountId === a.id)?._sum.points ?? 0,
      cpf: usage[a.id] ?? null,
      club: { active, since: first ? first.toISOString().slice(0, 10) : null, months: active && first ? months(first) : null },
      sales: { count: sales.length, profitCents, investedCents, totalCents: sales.reduce((t, s) => t + s.totalCents, 0) },
    };
  });
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((t, r) => t + f(r), 0);
  const profitCents = sum((r) => r.sales.profitCents);
  const investedCents = sum((r) => r.sales.investedCents);
  const balance = sum((r) => r.balance);
  const stockCents = sum((r) => r.stockCents);
  const limited = rows.filter((r) => r.cpf?.limit != null);
  const cpf = limited.length ? { used: limited.reduce((t, r) => t + r.cpf!.used, 0), limit: limited.reduce((t, r) => t + r.cpf!.limit!, 0) } : null;
  const cpfsFree = cpf ? Math.max(0, cpf.limit - cpf.used) : null;
  const holderOf = new Map(rows.map((r) => [r.id, r.holder]));
  return {
    range,
    rows,
    sales: { count: sum((r) => r.sales.count), profitCents, totalCents: sum((r) => r.sales.totalCents), roePct: investedCents > 0 ? Math.round((profitCents / investedCents) * 10_000) / 100 : null },
    balance, stockCents, cpmCents: cpmCents(stockCents, balance), pendingPoints: sum((r) => r.pendingPoints),
    cpf,
    // milhas que cada CPF livre ainda pode receber, se o saldo fosse todo emitido
    perCpf: cpfsFree ? Math.floor(balance / cpfsFree) : null,
    entries: entries.map((e) => ({ id: e.id, accountId: e.accountId, holder: holderOf.get(e.accountId) ?? "", occurredAt: e.occurredAt.toISOString().slice(0, 10), type: e.type, points: e.points, costCents: e.costCents, description: e.description, status: e.status })),
  };
}
export type AccountsPeriod = Awaited<ReturnType<typeof accountsPeriod>>;
