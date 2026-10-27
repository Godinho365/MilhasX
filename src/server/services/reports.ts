// Relatórios: período, filtros e os dados de cada aba (Visão Geral, Compras, Cartões, Economia, Evolução, Vendas, Bens e Direitos).
import type { Prisma, EntryType } from "@prisma/client";
import { prisma } from "../db";
import { ENTRY_LABELS } from "@/domain/ledger";
import { listSales as listSalesView } from "./sales";

export const REPORT_TABS = ["overview", "purchases", "credit-cards", "savings", "evolution", "sales", "assets"] as const;
export type ReportTab = (typeof REPORT_TABS)[number];

export type PeriodKey = "3m" | "6m" | "12m" | "ytd" | "all" | "custom";
export type Period = { key: PeriodKey; from?: Date; to?: Date };

const isoDay = /^\d{4}-\d{2}-\d{2}$/;

/** Período da URL: 3M/6M/12M contam meses inteiros para trás; "ytd" é o ano corrente; "custom" usa de/até. */
export function resolvePeriod(sp: { periodo?: string; de?: string; ate?: string }, now = new Date()): Period {
  const key = (["3m", "6m", "12m", "ytd", "all", "custom"] as const).find((k) => k === sp.periodo) ?? "3m";
  if (key === "all") return { key };
  if (key === "ytd") return { key, from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)) };
  if (key === "custom") {
    const from = sp.de && isoDay.test(sp.de) ? new Date(`${sp.de}T00:00:00Z`) : undefined;
    const to = sp.ate && isoDay.test(sp.ate) ? new Date(`${sp.ate}T23:59:59.999Z`) : undefined;
    return { key, from, to };
  }
  const months = key === "3m" ? 3 : key === "6m" ? 6 : 12;
  return { key, from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, now.getUTCDate())) };
}

export type ReportFilter = { userId: string; holderId?: string; programId?: string; period: Period };

const dateRange = (p: Period) => (p.from || p.to ? { gte: p.from, lte: p.to } : undefined);
const accountWhere = (f: ReportFilter) => (f.holderId || f.programId ? { holderId: f.holderId, programId: f.programId } : undefined);
const entryWhere = (f: ReportFilter, extra: Prisma.EntryWhereInput = {}): Prisma.EntryWhereInput => ({
  userId: f.userId,
  status: "CONFIRMED",
  occurredAt: dateRange(f.period),
  account: accountWhere(f),
  ignored: false,
  ...extra,
});
const monthKey = (d: Date) => d.toISOString().slice(0, 7);

/** Meses do período (para gráficos mensais); "Tudo" começa no primeiro lançamento. */
function monthsBetween(from: Date, to: Date) {
  const out: string[] = [];
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  while (d <= to && out.length < 120) {
    out.push(monthKey(d));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}
async function periodMonths(f: ReportFilter) {
  const to = f.period.to ?? new Date();
  let from = f.period.from;
  if (!from) {
    const first = await prisma.entry.findFirst({ where: { userId: f.userId, account: accountWhere(f) }, orderBy: { occurredAt: "asc" }, select: { occurredAt: true } });
    from = first?.occurredAt ?? to;
  }
  return monthsBetween(from, to);
}

/* ---------------- Visão Geral ---------------- */

export async function overviewReport(f: ReportFilter) {
  // Acúmulo = créditos que trazem pontos novos (transferência recebida não conta: os pontos já existiam)
  const credits = await prisma.entry.findMany({
    where: entryWhere(f, { points: { gt: 0 }, type: { notIn: ["TRANSFER_IN"] } }),
    select: { type: true, points: true, account: { select: { program: { select: { id: true, name: true, color: true } }, holder: { select: { name: true } } } } },
  });
  const byType = new Map<EntryType, number>();
  const byAccount = new Map<string, { name: string; color: string; value: number }>();
  for (const c of credits) {
    byType.set(c.type, (byType.get(c.type) ?? 0) + c.points);
    const name = `${c.account.program.name} ${c.account.holder.name}`;
    const cur = byAccount.get(name) ?? { name, color: c.account.program.color, value: 0 };
    cur.value += c.points;
    byAccount.set(name, cur);
  }
  return {
    byCategory: [...byType.entries()].map(([t, value]) => ({ name: ENTRY_LABELS[t], value })).sort((a, b) => b.value - a.value),
    byProgram: [...byAccount.values()].sort((a, b) => b.value - a.value),
  };
}

/* ---------------- Compras ---------------- */

const PURCHASE_STATUS: Record<string, string> = { PENDING: "Aguardando entrega", DELIVERED: "Aguardando pontos", RECEIVED: "Pontos recebidos" };
const PURCHASE_COST_LABELS: Record<string, string> = { DIFERENCA_PRECO: "Diferença de preço", FRETE: "Frete", TAXAS: "Taxas", OUTROS: "Outros", MARKUP: "Markup", IOF: "IOF" };

const bump = <K>(m: Map<K, { name: string; value: number; color?: string }>, key: K, name: string, value: number, color?: string) => {
  const cur = m.get(key) ?? { name, value: 0, color };
  cur.value += value;
  m.set(key, cur);
};
const desc = <T extends { value: number }>(m: Map<unknown, T>) => [...m.values()].filter((x) => x.value).sort((a, b) => b.value - a.value);

/**
 * Compras em parceiros: as acompanhadas em Compras (com status) e os lançamentos diretos de
 * "Compra em parceiro" que não vieram de uma compra acompanhada.
 */
export async function purchasesReport(f: ReportFilter) {
  const [tracked, direct] = await Promise.all([
    prisma.bonusPurchase.findMany({
      where: { userId: f.userId, purchasedAt: dateRange(f.period), account: accountWhere(f), status: { not: "CANCELED" } },
      select: { storeName: true, amountCents: true, expectedPoints: true, status: true, costs: true, extraCostCents: true, account: { select: { program: { select: { id: true, name: true, color: true } } } } },
    }),
    prisma.entry.findMany({
      where: entryWhere(f, { type: "PARTNER_PURCHASE", bonusPurchase: { is: null } }),
      select: { points: true, inputCostCents: true, storeId: true, description: true, costs: { select: { type: true, amountCents: true } }, account: { select: { program: { select: { id: true, name: true, color: true } } } } },
    }),
  ]);
  const storeNames = new Map((await prisma.store.findMany({ where: { id: { in: direct.map((e) => e.storeId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
  const byStore = new Map<string, { name: string; value: number }>();
  const byProgram = new Map<string, { name: string; value: number; color?: string }>();
  const byStatus = new Map<string, { name: string; value: number }>();
  const byCost = new Map<string, { name: string; value: number }>();
  const multiplier = new Map<string, { name: string; points: number; spent: number }>();
  let points = 0, extra = 0;
  for (const b of tracked) {
    points += b.expectedPoints;
    bump(byStore, b.storeName, b.storeName, b.expectedPoints);
    bump(byProgram, b.account.program.id, b.account.program.name, b.expectedPoints, b.account.program.color);
    bump(byStatus, b.status, PURCHASE_STATUS[b.status] ?? b.status, b.expectedPoints);
    const costs = (Array.isArray(b.costs) ? b.costs : []) as { type?: string; amountCents?: number }[];
    if (costs.length) for (const c of costs) bump(byCost, c.type ?? "OUTROS", PURCHASE_COST_LABELS[c.type ?? ""] ?? "Outros", c.amountCents ?? 0);
    else if (b.extraCostCents) bump(byCost, "OUTROS", "Outros", b.extraCostCents);
    extra += b.extraCostCents;
    const m = multiplier.get(b.storeName) ?? { name: b.storeName, points: 0, spent: 0 };
    m.points += b.expectedPoints;
    m.spent += b.amountCents;
    multiplier.set(b.storeName, m);
  }
  let directPoints = 0;
  for (const e of direct) {
    const store = (e.storeId && storeNames.get(e.storeId)) || "Sem loja";
    points += e.points;
    directPoints += e.points;
    bump(byStore, store, store, e.points);
    bump(byProgram, e.account.program.id, e.account.program.name, e.points, e.account.program.color);
    for (const c of e.costs) bump(byCost, c.type, PURCHASE_COST_LABELS[c.type] ?? c.type, c.amountCents);
    extra += e.costs.length ? e.costs.reduce((t, c) => t + c.amountCents, 0) : e.inputCostCents;
  }
  const trackedPoints = points - directPoints;
  return {
    totals: { points, extraCents: extra, cpmCents: points > 0 && extra > 0 ? Math.round((extra * 1000) / points) : null, count: tracked.length + direct.length, partners: byStore.size },
    byStore: desc(byStore),
    byProgram: desc(byProgram),
    byStatus: ["PENDING", "DELIVERED", "RECEIVED"].map((k) => byStatus.get(k)).filter((x): x is { name: string; value: number } => !!x && x.value > 0),
    origin: [{ name: "Acompanhamento de compras", value: trackedPoints }, { name: "Lançamento direto", value: directPoints }].filter((x) => x.value > 0),
    byCost: desc(byCost),
    // Multiplicador médio ponderado: pontos ÷ reais gastos (só compras acompanhadas têm o valor)
    multiplier: [...multiplier.values()].filter((m) => m.spent > 0).map((m) => ({ name: m.name, value: Math.round((m.points / (m.spent / 100)) * 100) / 100 })).sort((a, b) => b.value - a.value),
  };
}

/* ---------------- Cartões ---------------- */

const INVOICE_STATUS: Record<string, string> = { OPEN: "Abertas", CLOSED: "Fechadas", RECEIVED: "Recebidas" };

export async function cardsReport(f: ReportFilter) {
  const months = await periodMonths(f);
  const [cards, fees] = await Promise.all([
    prisma.creditCard.findMany({
      where: { userId: f.userId, account: accountWhere(f) },
      include: {
        account: { include: { program: { select: { id: true, name: true, color: true } } } },
        invoices: { where: { closingDate: dateRange(f.period) }, include: { entry: { select: { status: true, points: true } } }, orderBy: { closingDate: "asc" } },
      },
      orderBy: { name: "asc" },
    }),
    // Anuidade: custos do tipo "Anuidade" lançados no período
    prisma.entryCost.findMany({ where: { type: "ANUIDADE", entry: entryWhere(f) }, select: { amountCents: true, entry: { select: { occurredAt: true } } } }),
  ]);
  const byStatus = new Map<string, { name: string; value: number }>();
  const byProgram = new Map<string, { name: string; value: number; color?: string }>();
  const invoices: { id: string; label: string; expected: number; received: number }[] = [];
  let invoiced = 0, received = 0, pending = 0, count = 0, receivedInvoiced = 0;
  const top = cards.map((c) => {
    let pts = 0, amount = 0;
    for (const i of c.invoices) {
      count++;
      invoiced += i.amountCents;
      amount += i.amountCents;
      const got = i.entry?.status === "CONFIRMED" ? i.entry.points : 0;
      // Recebida = fechada e com os pontos já confirmados
      const status = i.status === "OPEN" ? "OPEN" : got ? "RECEIVED" : "CLOSED";
      if (status !== "RECEIVED") pending++;
      else receivedInvoiced += i.amountCents;
      received += got;
      pts += got;
      bump(byStatus, status, INVOICE_STATUS[status]!, 1);
      if (got) bump(byProgram, c.account.program.id, c.account.program.name, got, c.account.program.color);
      invoices.push({ id: i.id, label: `${c.name} · ${i.closingDate.toISOString().slice(5, 7)}/${i.closingDate.toISOString().slice(2, 4)}`, expected: i.expectedPoints, received: got });
    }
    return { id: c.id, name: c.name, color: c.account.program.color, points: pts, invoicedCents: amount };
  });
  const monthlyFees = new Map(months.map((m) => [m, { month: m, fee: 0 }]));
  for (const x of fees) {
    const m = monthlyFees.get(monthKey(x.entry.occurredAt));
    if (m) m.fee += x.amountCents;
  }
  const feeTotal = fees.reduce((t, x) => t + x.amountCents, 0);
  return {
    totals: { receivedPoints: received, invoicedCents: invoiced, invoices: count, pending, feeCents: feeTotal, pointsPerReal: receivedInvoiced > 0 ? Math.round((received / (receivedInvoiced / 100)) * 100) / 100 : 0 },
    byStatus: ["OPEN", "CLOSED", "RECEIVED"].map((k) => byStatus.get(k)).filter((x): x is { name: string; value: number } => !!x),
    byProgram: desc(byProgram),
    top: top.filter((t) => t.invoicedCents > 0 || t.points > 0).sort((a, b) => b.points - a.points || b.invoicedCents - a.invoicedCents),
    invoices,
    fees: [...monthlyFees.values()],
  };
}

/* ---------------- Economia ---------------- */

type RedemptionDetails = { cashReferenceCents?: number | null };

/** Economia dos resgates: valor em dinheiro informado − (custo dos pontos usados + custos pagos no resgate). */
export async function savingsReport(f: ReportFilter) {
  const debits = await prisma.entry.findMany({
    where: entryWhere(f, { type: { in: ["FLIGHT_REDEMPTION", "CAR_RENTAL", "HOTEL_REDEMPTION", "PRODUCT_REDEMPTION", "OTHER_DEBIT"] } }),
    include: { costs: { select: { amountCents: true } }, account: { include: { program: { select: { id: true, name: true, color: true } }, holder: { select: { name: true } } } } },
    orderBy: { occurredAt: "desc" },
  });
  const rows = debits
    .map((e) => {
      const cash = (e.details as RedemptionDetails | null)?.cashReferenceCents ?? null;
      const pointsCost = Math.abs(e.costCents);
      const fees = e.costs.reduce((t, c) => t + c.amountCents, 0);
      const points = Math.abs(e.points);
      return {
        id: e.id,
        date: e.occurredAt.toISOString(),
        description: e.description,
        type: ENTRY_LABELS[e.type],
        programId: e.account.program.id,
        program: e.account.program.name,
        account: `${e.account.program.name} ${e.account.holder.name}`,
        color: e.account.program.color,
        points,
        cashCents: cash,
        pointsCostCents: pointsCost,
        feesCents: fees,
        savingCents: cash != null ? cash - pointsCost - fees : null,
        valueCpmCents: cash != null && points > 0 ? Math.round(((cash - fees) * 1000) / points) : null,
      };
    })
    .filter((r) => r.cashCents != null); // só resgates com valor de referência entram
  const byProgram = new Map<string, { name: string; value: number; color?: string }>();
  const byType = new Map<string, { name: string; value: number }>();
  for (const r of rows) {
    bump(byProgram, r.programId, r.program, r.savingCents ?? 0, r.color);
    bump(byType, r.type, r.type, r.savingCents ?? 0);
  }
  return {
    totals: { savingCents: rows.reduce((t, r) => t + (r.savingCents ?? 0), 0), redemptions: rows.length },
    byProgram: [...byProgram.values()].filter((x) => x.value > 0).sort((a, b) => b.value - a.value),
    byType: [...byType.values()].filter((x) => x.value > 0).sort((a, b) => b.value - a.value),
    rows,
  };
}

/* ---------------- Evolução ---------------- */

/** Saldo e CPM de cada conta ao fim de cada mês, créditos e débitos por mês e por categoria. */
export async function evolutionReport(f: ReportFilter) {
  const months = await periodMonths(f);
  const entries = await prisma.entry.findMany({
    where: { userId: f.userId, status: "CONFIRMED", account: accountWhere(f), occurredAt: f.period.to ? { lte: f.period.to } : undefined },
    select: { occurredAt: true, points: true, costCents: true, type: true, ignored: true, groupId: true, account: { select: { id: true, program: { select: { name: true, color: true } }, holder: { select: { name: true } } } } },
    orderBy: { occurredAt: "asc" },
  });
  const accounts = new Map<string, { id: string; name: string; color: string }>();
  for (const e of entries) accounts.set(e.account.id, { id: e.account.id, name: `${e.account.program.name} ${e.account.holder.name}`, color: e.account.program.color });
  const balance = new Map<string, number>();
  const cost = new Map<string, number>();
  const from = f.period.from;
  let i = 0;
  const points: Record<string, number | string>[] = [];
  const cpm: Record<string, number | string>[] = [];
  const flows = new Map(months.map((m) => [m, { month: m, credits: 0, debits: 0 }]));
  const creditCats = new Map(months.map((m) => [m, { month: m } as Record<string, number | string>]));
  const debitCats = new Map(months.map((m) => [m, { month: m } as Record<string, number | string>]));
  const creditTotals = new Map<string, number>();
  const debitTotals = new Map<string, number>();
  let credits = 0, debits = 0;
  for (const m of months) {
    const end = new Date(`${m}-01T00:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() + 1);
    for (; i < entries.length && entries[i]!.occurredAt < end; i++) {
      const e = entries[i]!;
      balance.set(e.account.id, (balance.get(e.account.id) ?? 0) + e.points);
      cost.set(e.account.id, (cost.get(e.account.id) ?? 0) + e.costCents);
      // Fluxos só do período; transferências entre contas contam dos dois lados, como movimento
      if (e.ignored || (from && e.occurredAt < from)) continue;
      const fl = flows.get(m)!;
      const label = ENTRY_LABELS[e.type];
      if (e.points > 0) {
        fl.credits += e.points;
        credits += e.points;
        const row = creditCats.get(m)!;
        row[label] = Number(row[label] ?? 0) + e.points;
        creditTotals.set(label, (creditTotals.get(label) ?? 0) + e.points);
      } else if (e.points < 0) {
        fl.debits += -e.points;
        debits += -e.points;
        const row = debitCats.get(m)!;
        row[label] = Number(row[label] ?? 0) - e.points;
        debitTotals.set(label, (debitTotals.get(label) ?? 0) - e.points);
      }
    }
    const pRow: Record<string, number | string> = { month: m };
    const cRow: Record<string, number | string> = { month: m };
    for (const a of accounts.values()) {
      const b = balance.get(a.id) ?? 0;
      pRow[a.id] = b;
      cRow[a.id] = b > 0 ? Math.round(((cost.get(a.id) ?? 0) * 1000) / b) : 0;
    }
    points.push(pRow);
    cpm.push(cRow);
  }
  const series = (t: Map<string, number>) => [...t.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  const last = points.at(-1);
  return {
    totals: { delta: credits - debits, credits, debits },
    accounts: [...accounts.values()],
    points,
    cpm,
    flows: [...flows.values()],
    lastBalance: [...accounts.values()].map((a) => ({ ...a, value: Number(last?.[a.id] ?? 0) })).filter((a) => a.value),
    lastCpm: [...accounts.values()].map((a) => ({ ...a, value: Number(cpm.at(-1)?.[a.id] ?? 0) })).filter((a) => a.value),
    creditCats: { data: [...creditCats.values()], series: series(creditTotals) },
    debitCats: { data: [...debitCats.values()], series: series(debitTotals) },
  };
}

/* ---------------- Vendas ---------------- */

export async function salesReport(f: ReportFilter) {
  const sales = await listSalesView(f.userId, { from: f.period.from, to: f.period.to, programId: f.programId, holderId: f.holderId });
  sales.sort((a, b) => a.date.localeCompare(b.date));
  const months = await periodMonths(f);
  const monthly = new Map(months.map((m) => [m, { month: m, revenue: 0, profit: 0 }]));
  const count = new Map<string, { name: string; value: number; color?: string }>();
  const revenueBy = new Map<string, { name: string; value: number; color?: string }>();
  const profitBy = new Map<string, { name: string; value: number; color?: string }>();
  const beneficiaries = new Map<string, { name: string; value: number; count: number }>();
  let revenue = 0, profit = 0, points = 0, priced = 0;
  for (const s of sales) {
    revenue += s.totalCents;
    profit += s.resultCents;
    points += s.points;
    priced += s.pricedCents;
    const m = monthly.get(s.date.slice(0, 7));
    if (m) {
      m.revenue += s.totalCents;
      m.profit += s.resultCents;
    }
    bump(count, s.programName, s.programName, 1, s.color);
    bump(revenueBy, s.programName, s.programName, s.totalCents, s.color);
    bump(profitBy, s.programName, s.programName, s.resultCents, s.color);
    // Beneficiários: os clientes da venda (a receita é dividida entre eles)
    const names = s.customers.length ? s.customers : ["Sem cliente"];
    for (const n of names) {
      const b = beneficiaries.get(n) ?? { name: n, value: 0, count: 0 };
      b.value += Math.round(s.totalCents / names.length);
      b.count++;
      beneficiaries.set(n, b);
    }
  }
  return {
    totals: { count: sales.length, revenueCents: revenue, profitCents: profit, points, marginPct: priced > 0 ? Math.round((profit / priced) * 1000) / 10 : 0 },
    monthly: [...monthly.values()],
    count: desc(count),
    revenue: desc(revenueBy),
    profit: [...profitBy.values()].filter((x) => x.value).sort((a, b) => b.value - a.value),
    beneficiaries: [...beneficiaries.values()].sort((a, b) => b.value - a.value).slice(0, 10),
  };
}

/* ---------------- Bens e Direitos ---------------- */

/**
 * Para a declaração do Imposto de Renda: posição de cada conta em 31/12 de cada ano com lançamentos
 * e a posição atual (saldo, CPM e custo de aquisição = soma dos lançamentos confirmados até a data).
 */
export async function assetsReport(f: Omit<ReportFilter, "period">) {
  const scope = accountWhere({ ...f, period: { key: "all" } });
  const where = { userId: f.userId, status: "CONFIRMED" as const, account: scope };
  const first = await prisma.entry.findFirst({ where, orderBy: { occurredAt: "asc" }, select: { occurredAt: true } });
  const thisYear = new Date().getUTCFullYear();
  const years: number[] = [];
  for (let y = first ? first.occurredAt.getUTCFullYear() : thisYear; y < thisYear; y++) years.push(y);
  const cuts = [...years.map((y) => ({ key: String(y), label: `31/12/${y}`, at: new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999)) })), { key: "atual", label: "Posição atual", at: null as Date | null }];
  const [accounts, ...sums] = await Promise.all([
    prisma.account.findMany({ where: { userId: f.userId, ...(scope ?? {}) }, include: { program: { select: { name: true, color: true } }, holder: { select: { name: true } } } }),
    ...cuts.map((c) => prisma.entry.groupBy({ by: ["accountId"], where: c.at ? { ...where, occurredAt: { lte: c.at } } : where, _sum: { points: true, costCents: true } })),
  ]);
  const maps = sums.map((s) => new Map(s.map((x) => [x.accountId, { points: x._sum.points ?? 0, costCents: x._sum.costCents ?? 0 }])));
  const cell = (v?: { points: number; costCents: number }) => ({ points: v?.points ?? 0, costCents: v?.costCents ?? 0, cpmCents: v && v.points > 0 ? Math.round((v.costCents * 1000) / v.points) : 0 });
  const rows = accounts
    .map((a) => ({ id: a.id, account: `${a.program.name} ${a.holder.name}`, program: a.program.name, holder: a.holder.name, color: a.program.color, cells: maps.map((m) => cell(m.get(a.id))) }))
    .filter((r) => r.cells.some((c) => c.points || c.costCents))
    .sort((a, b) => a.account.localeCompare(b.account));
  const totals = cuts.map((_, i) => {
    const pts = rows.reduce((t, r) => t + r.cells[i]!.points, 0);
    const cost = rows.reduce((t, r) => t + r.cells[i]!.costCents, 0);
    return { points: pts, costCents: cost, cpmCents: pts > 0 ? Math.round((cost * 1000) / pts) : 0 };
  });
  return { cuts: cuts.map(({ key, label }) => ({ key, label })), rows, totals };
}

/* ---------------- Exportar ---------------- */

const reais = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2));

/** CSV da aba atual (mesmos filtros da tela). */
export async function exportReportCsv(tab: ReportTab, f: ReportFilter): Promise<{ name: string; rows: string[][] }> {
  switch (tab) {
    case "overview": {
      const r = await overviewReport(f);
      return { name: "visao-geral", rows: [["grupo", "nome", "pontos"], ...r.byCategory.map((x) => ["categoria", x.name, String(x.value)]), ...r.byProgram.map((x) => ["programa", x.name, String(x.value)])] };
    }
    case "purchases": {
      const r = await purchasesReport(f);
      return { name: "compras", rows: [["grupo", "nome", "valor"], ...r.byStore.map((x) => ["parceiro_pontos", x.name, String(x.value)]), ...r.byProgram.map((x) => ["programa_pontos", x.name, String(x.value)]), ...r.byStatus.map((x) => ["status_pontos", x.name, String(x.value)]), ...r.byCost.map((x) => ["custo_extra_reais", x.name, reais(x.value)]), ...r.multiplier.map((x) => ["pontos_por_real", x.name, String(x.value)])] };
    }
    case "credit-cards": {
      const r = await cardsReport(f);
      return { name: "cartoes", rows: [["fatura", "pontos_previstos", "pontos_recebidos"], ...r.invoices.map((i) => [i.label, String(i.expected), String(i.received)])] };
    }
    case "savings": {
      const r = await savingsReport(f);
      return { name: "economia", rows: [["data", "resgate", "tipo", "conta", "pontos", "dinheiro_reais", "custo_reais", "economia_reais"], ...r.rows.map((x) => [x.date.slice(0, 10), x.description, x.type, x.account, String(x.points), reais(x.cashCents), reais(x.pointsCostCents + x.feesCents), reais(x.savingCents)])] };
    }
    case "evolution": {
      const r = await evolutionReport(f);
      return { name: "evolucao", rows: [["mes", ...r.accounts.map((a) => a.name), "creditos", "debitos"], ...r.points.map((row, i) => [String(row.month), ...r.accounts.map((a) => String(row[a.id] ?? 0)), String(r.flows[i]!.credits), String(r.flows[i]!.debits)])] };
    }
    case "sales": {
      const r = await salesReport(f);
      return { name: "vendas", rows: [["mes", "receita_reais", "lucro_reais"], ...r.monthly.map((m) => [m.month, reais(m.revenue), reais(m.profit)])] };
    }
    case "assets": {
      const r = await assetsReport(f);
      return { name: "bens-e-direitos", rows: [["titular", "programa", ...r.cuts.flatMap((c) => [`saldo_${c.key}`, `cpm_${c.key}_reais`, `custo_${c.key}_reais`])], ...r.rows.map((x) => [x.holder, x.program, ...x.cells.flatMap((c) => [String(c.points), reais(c.cpmCents), reais(c.costCents)])])] };
    }
  }
}
