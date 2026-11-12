// Visão geral: os números de cada bloco do painel (só dos blocos que a pessoa mostra e pode ver).
import { prisma } from "../db";
import { calendarEvents, type Access } from "./calendar";
import { salesMetrics } from "./metrics";
import { financeOverview } from "./finance";
import { listDeals } from "./miles-deals";
import { commissionsOverview } from "./commissions";
import { walletSummary } from "./wallet";
import { brDay } from "@/domain/brasilia";
import { addDays } from "@/domain/calendar";
import { DEAL_STAGES, DEAL_STAGE_LABELS } from "@/domain/miles-deals";
import type { WidgetKey } from "@/domain/overview";

const day = (d: Date) => d.toISOString().slice(0, 10);

async function agenda(userId: string, a: Access, today: string) {
  return { today, events: await calendarEvents(userId, { from: today, to: addDays(today, 6) }, a) };
}

async function tarefas(userId: string, today: string) {
  const rows = await prisma.task.findMany({
    where: { userId, status: { not: "DONE" } },
    select: { id: true, title: true, dueDate: true, dueTime: true, priority: true, memberIds: true, boardId: true, status: true },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: 200,
  });
  return {
    today,
    tasks: rows.map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate ? day(t.dueDate) : null, dueTime: t.dueTime, priority: t.priority, memberIds: t.memberIds, boardId: t.boardId, doing: t.status === "DOING" })),
  };
}

async function kpis(userId: string) {
  const m = await salesMetrics(userId, {});
  const pick = (k: typeof m.kpis) => ({ revenueCents: k.revenueCents, profitCents: k.profitCents, count: k.count, ticketCents: k.ticketCents, marginPct: k.marginPct });
  return { from: m.window.from, to: m.window.to, now: pick(m.kpis), prev: pick(m.prev) };
}

async function financeiro(userId: string, today: string) {
  const o = await financeOverview(userId, today.slice(0, 7), "caixa");
  return {
    cashCents: o.balance.cash, receivableCents: o.balance.receivable, payableCents: o.balance.payable + o.balance.toPayBills,
    toPay: o.toPay.slice(0, 4).map((t) => ({ id: t.id, description: t.description, dueDate: t.dueDate, amountCents: t.amountCents, overdue: t.overdue })),
  };
}

async function emissoes(userId: string) {
  const deals = await listDeals(userId);
  return {
    stages: DEAL_STAGES.map((s) => {
      const list = deals.filter((d) => d.stage === s);
      return { key: s, label: DEAL_STAGE_LABELS[s], count: list.length, valueCents: list.reduce((t, d) => t + (d.chargeCents ?? 0), 0) };
    }),
  };
}

async function metas(userId: string) {
  const o = await commissionsOverview(userId);
  return o.totals;
}

async function milhas(userId: string) {
  const w = await walletSummary(userId);
  return { balance: w.totals.balance, marketValueCents: w.totals.marketValueCents, pendingPoints: w.totals.pendingPoints, accounts: w.accounts.filter((x) => !x.archived).length };
}

async function clientes(userId: string, today: string) {
  const month = new Date(`${today.slice(0, 7)}-01T03:00:00Z`); // meia-noite de Brasília
  const [total, newMonth, interests] = await Promise.all([
    prisma.customer.count({ where: { userId } }),
    prisma.customer.count({ where: { userId, createdAt: { gte: month } } }),
    prisma.travelInterest.count({ where: { userId, status: { in: ["NEW", "SEARCHING", "OFFER_SENT"] } } }),
  ]);
  return { total, newMonth, interests };
}

export type OverviewData = {
  agenda?: Awaited<ReturnType<typeof agenda>>;
  tarefas?: Awaited<ReturnType<typeof tarefas>>;
  kpis?: Awaited<ReturnType<typeof kpis>>;
  financeiro?: Awaited<ReturnType<typeof financeiro>>;
  emissoes?: Awaited<ReturnType<typeof emissoes>>;
  metas?: Awaited<ReturnType<typeof metas>>;
  milhas?: Awaited<ReturnType<typeof milhas>>;
  clientes?: Awaited<ReturnType<typeof clientes>>;
};

/** Os dados dos blocos pedidos (a página já filtrou pela função). Um bloco que falha não derruba os outros. */
export async function overviewData(userId: string, widgets: WidgetKey[], a: Access): Promise<OverviewData> {
  const today = brDay();
  const jobs: Partial<Record<WidgetKey, () => Promise<unknown>>> = {
    agenda: () => agenda(userId, a, today), tarefas: () => tarefas(userId, today), kpis: () => kpis(userId), financeiro: () => financeiro(userId, today),
    emissoes: () => emissoes(userId), metas: () => metas(userId), milhas: () => milhas(userId), clientes: () => clientes(userId, today),
  };
  const keys = widgets.filter((w) => jobs[w]);
  const results = await Promise.allSettled(keys.map((k) => jobs[k]!()));
  const out: Record<string, unknown> = {};
  keys.forEach((k, i) => { const r = results[i]!; if (r.status === "fulfilled") out[k] = r.value; });
  return out as OverviewData;
}
