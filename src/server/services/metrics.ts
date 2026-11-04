// Métricas (Menu principal › Métricas): carrega vendas, pedidos do CRM, despesas e contas do mês escolhido e
// entrega os números de cada aba. As contas ficam em domain/metrics.ts (puras e testadas).
import { prisma } from "../db";
import { brDay } from "@/domain/brasilia";
import { resolveProposal } from "@/domain/proposal";
import {
  METRICS_BLOCK_KEYS, metricsWindow, salesKpis, dailySeries, productMix, receivableAging, customerPortfolio, topCustomers, topTags,
  quoteConversion, teamRows, teamKpis, teamDaily, accountsMetrics, type MetricSale, type MetricsWindow,
} from "@/domain/metrics";
import { listSales, saleDay, saleTags, type SaleView } from "./sales";
import { beneficiaryUsage } from "./accounts";
import { clubActiveAccounts } from "./wallet";

const BR_OFFSET_MS = 3 * 3_600_000;
/** Instantes do período no horário de Brasília (do começo do primeiro dia ao fim do último). */
const brRange = (from: string, to: string) => ({ gte: new Date(Date.parse(`${from}T00:00:00Z`) + BR_OFFSET_MS), lt: new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000 + BR_OFFSET_MS) });
const day = (d: string) => new Date(`${d}T00:00:00Z`);

export function toMetricSale(s: SaleView): MetricSale {
  const customers = new Map<string, string>();
  for (const i of s.items) i.customerIds.forEach((id, k) => customers.set(id, i.customers[k] ?? ""));
  return {
    id: s.id, date: s.date, day: saleDay(new Date(s.date)),
    totalCents: s.totalCents, resultCents: s.resultCents, pricedCents: s.pricedCents, costCents: s.costCents, milesCostCents: s.milesCostCents,
    paidAt: s.paidAt, refunded: !!s.refund, tags: s.tags,
    customers: [...customers].map(([id, name]) => ({ id, name })),
    issuerIds: s.issuerIds, accountId: s.origin === "OWN" ? s.accountId : null,
    programName: s.programName, color: s.color,
    items: s.items.map((i) => ({ kind: i.kind, label: i.label, totalCents: i.totalCents, resultCents: i.resultCents, costs: i.costs })),
  };
}

type Scope = { month?: string; holderId?: string };

async function windowSales(userId: string, w: MetricsWindow, f: { holderId?: string; customerId?: string; tag?: string }) {
  const [now, prev] = await Promise.all([
    listSales(userId, { from: day(w.from), to: day(w.to), holderId: f.holderId, customerId: f.customerId, tag: f.tag }),
    listSales(userId, { from: day(w.prevFrom), to: day(w.prevTo), holderId: f.holderId, customerId: f.customerId, tag: f.tag }),
  ]);
  return { now: now.map(toMetricSale), prev: prev.map(toMetricSale) };
}

/** Despesas do Financeiro com competência no período (para o lucro líquido). */
async function expenses(userId: string, from: string, to: string) {
  const r = await prisma.finTransaction.aggregate({ where: { userId, type: "EXPENSE", competence: { gte: day(from), lte: day(to) } }, _sum: { amountCents: true } });
  return r._sum.amountCents ?? 0;
}

/* ---------------- Vendas ---------------- */

export async function salesMetrics(userId: string, opts: Scope & { customerId?: string; tag?: string }, now = new Date()) {
  const today = brDay(now);
  const w = metricsWindow(opts.month, today);
  const f = { holderId: opts.holderId, customerId: opts.customerId, tag: opts.tag };
  const [sales, open, expNow, expPrev, orders, customers, tags] = await Promise.all([
    windowSales(userId, w, f),
    listSales(userId, { pago: "nao", holderId: f.holderId, customerId: f.customerId, tag: f.tag }),
    expenses(userId, w.from, w.to),
    expenses(userId, w.prevFrom, w.prevTo),
    prisma.travelOrder.findMany({ where: { userId, createdAt: brRange(w.from, w.to), customerId: f.customerId }, select: { locator: true, reservation: true, archivedAt: true, proposal: true, budgetCents: true } }),
    prisma.customer.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    saleTags(userId),
  ]);
  // Clientes do período que já compravam antes dele
  const ids = [...new Set(sales.now.flatMap((s) => s.customers.map((c) => c.id)))];
  const before = ids.length
    ? await prisma.sale.findMany({ where: { userId, occurredAt: { lt: brRange(w.from, w.from).gte }, items: { some: { customers: { some: { id: { in: ids } } } } } }, select: { items: { select: { customers: { select: { id: true } } } } } })
    : [];
  const returning = new Set(before.flatMap((s) => s.items.flatMap((i) => i.customers.map((c) => c.id))).filter((id) => ids.includes(id)));
  const kpis = salesKpis(sales.now, w.days, expNow);
  const prev = salesKpis(sales.prev, w.days, expPrev);
  return {
    window: w,
    kpis, prev,
    daily: dailySeries(sales.now, w.from, w.to),
    mix: productMix(sales.now),
    aging: receivableAging(open.map(toMetricSale), today),
    portfolio: customerPortfolio(sales.now, returning),
    topCustomers: topCustomers(sales.now),
    topTags: topTags(sales.now),
    conversion: quoteConversion(orders.map((o) => {
      const p = o.proposal ? resolveProposal(o.proposal) : null;
      return { issued: !!o.locator || o.reservation != null, lost: !!o.archivedAt, valueCents: p?.pixCents ?? p?.cardTotalCents ?? o.budgetCents ?? null };
    })),
    filters: { customers, tags },
  };
}

/* ---------------- Equipe ---------------- */

export async function teamMetrics(userId: string, opts: Scope & { memberId?: string }, now = new Date()) {
  const w = metricsWindow(opts.month, brDay(now));
  const [sales, members] = await Promise.all([
    windowSales(userId, w, { holderId: opts.holderId }),
    prisma.teamMember.findMany({ where: { userId }, select: { id: true, name: true, color: true, active: true, issuer: true }, orderBy: { name: "asc" } }),
  ]);
  const chosen = opts.memberId && members.some((m) => m.id === opts.memberId) ? [opts.memberId] : null;
  const ids = members.map((m) => m.id);
  const rows = teamRows(sales.now, sales.prev, members.filter((m) => !chosen || chosen.includes(m.id)));
  return {
    window: w,
    kpis: teamKpis(rows, sales.now),
    prev: teamKpis(teamRows(sales.prev, [], members.filter((m) => !chosen || chosen.includes(m.id))), sales.prev),
    daily: teamDaily(sales.now, ids, w.from, w.to, chosen),
    rows,
    members: members.map((m) => ({ id: m.id, name: m.name, active: m.active, issuer: m.issuer })),
    memberId: chosen?.[0] ?? null,
  };
}

/* ---------------- Contas ---------------- */

export async function accountMetrics(userId: string, opts: Scope & { programId?: string }, now = new Date()) {
  const w = metricsWindow(opts.month, brDay(now));
  const [accounts, clubs, cpf, sales, programs] = await Promise.all([
    prisma.account.findMany({
      where: { userId, archived: false, holderId: opts.holderId, programId: opts.programId },
      select: { id: true, programId: true, balance: true, costCents: true, program: { select: { name: true, color: true, marketValueCpmCents: true } }, holder: { select: { name: true } } },
    }),
    clubActiveAccounts(userId, now),
    beneficiaryUsage(userId, now),
    listSales(userId, { from: day(w.from), to: day(w.to), holderId: opts.holderId, programId: opts.programId }),
    prisma.account.findMany({ where: { userId, archived: false, holderId: opts.holderId }, select: { program: { select: { id: true, name: true } } }, distinct: ["programId"] }),
  ]);
  const m = accountsMetrics(
    accounts.map((a) => ({
      id: a.id, programId: a.programId, programName: a.program.name, holderName: a.holder.name, color: a.program.color,
      balance: a.balance, costCents: a.costCents, marketValueCpmCents: a.program.marketValueCpmCents, club: clubs.has(a.id),
      cpf: cpf[a.id]?.limit != null ? { used: cpf[a.id]!.used, limit: cpf[a.id]!.limit! } : null,
    })),
    sales.map(toMetricSale),
  );
  return { window: w, ...m, programOptions: programs.map((p) => p.program).sort((a, b) => a.name.localeCompare(b.name)), programId: opts.programId ?? null };
}

/* ---------------- Personalizar ---------------- */

export async function metricsHidden(userId: string) {
  const p = await prisma.userPreference.findUnique({ where: { userId }, select: { metricsHidden: true } });
  return (p?.metricsHidden ?? []).filter((k) => METRICS_BLOCK_KEYS.has(k));
}

export async function saveMetricsHidden(userId: string, hidden: string[]) {
  const keys = [...new Set(hidden)].filter((k) => METRICS_BLOCK_KEYS.has(k));
  await prisma.userPreference.upsert({ where: { userId }, create: { userId, metricsHidden: keys }, update: { metricsHidden: keys } });
  return keys;
}
