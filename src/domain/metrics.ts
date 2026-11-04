// Métricas (Menu principal › Métricas): os números do mês da agência em três abas — Vendas, Equipe e
// Contas. Funções puras sobre as vendas já calculadas (mesma conta de lucro da tela de Vendas), para o
// servidor e para os testes. Valores em centavos; datas como AAAA-MM-DD (dia da venda em Brasília).

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DAY_MS = 86_400_000;

export const METRICS_TABS = ["vendas", "equipe", "contas"] as const;
export type MetricsTab = (typeof METRICS_TABS)[number];

/** Blocos de cada aba que o usuário pode esconder em "Personalizar". */
export const METRICS_BLOCKS: Record<MetricsTab, { key: string; label: string }[]> = {
  vendas: [
    { key: "vendas.cards", label: "Cartões de números" },
    { key: "vendas.evolucao", label: "Evolução diária" },
    { key: "vendas.mix", label: "Mix de produtos" },
    { key: "vendas.recebivel", label: "Saúde do recebível" },
    { key: "vendas.carteira", label: "Carteira de clientes" },
    { key: "vendas.cotacao", label: "Cotação → emissão" },
    { key: "vendas.clientes", label: "Top 5 clientes" },
    { key: "vendas.etiquetas", label: "Top 5 etiquetas" },
  ],
  equipe: [
    { key: "equipe.cards", label: "Cartões de números" },
    { key: "equipe.evolucao", label: "Evolução diária da equipe" },
    { key: "equipe.ranking", label: "Ranking de emissores" },
    { key: "equipe.tabela", label: "Resultado por emissor" },
  ],
  contas: [
    { key: "contas.cards", label: "Cartões de números" },
    { key: "contas.ranking", label: "Ranking de programas" },
    { key: "contas.cpm", label: "CPM pago × CPM de mercado" },
    { key: "contas.cota", label: "Uso da cota de CPF" },
    { key: "contas.distribuicao", label: "Distribuição do investimento" },
    { key: "contas.roi", label: "ROI por programa" },
    { key: "contas.compilado", label: "Compilado por programa" },
  ],
};
export const METRICS_BLOCK_KEYS = new Set(Object.values(METRICS_BLOCKS).flat().map((b) => b.key));

// ---------------- Período ----------------

export type MetricsWindow = {
  month: string; // AAAA-MM
  label: string; // "Novembro de 2026"
  from: string; to: string; // dias do período (no mês corrente, até hoje)
  prevFrom: string; prevTo: string; // mesmo trecho do mês anterior, para comparar
  days: number;
  current: boolean;
  prevMonth: string; nextMonth: string | null; // navegação (não passa do mês corrente)
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); // m: 0-11
const shiftMonth = (month: string, by: number) => {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};

/**
 * Mês escolhido (AAAA-MM) e o trecho de comparação. No mês corrente vale do dia 1 até hoje e compara com
 * os mesmos dias do mês anterior (03/11 → 01/10 a 03/10); um mês passado compara com o mês anterior inteiro.
 */
export function metricsWindow(month: string | undefined | null, today: string): MetricsWindow {
  const cur = today.slice(0, 7);
  const m = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month <= cur ? month : cur;
  const y = Number(m.slice(0, 4)), mi = Number(m.slice(5, 7)) - 1;
  const current = m === cur;
  const endDay = current ? Number(today.slice(8, 10)) : lastDay(y, mi);
  const prev = shiftMonth(m, -1);
  const py = Number(prev.slice(0, 4)), pmi = Number(prev.slice(5, 7)) - 1;
  const prevEnd = current ? Math.min(endDay, lastDay(py, pmi)) : lastDay(py, pmi);
  return {
    month: m, label: `${MONTHS[mi]} de ${y}`,
    from: `${m}-01`, to: `${m}-${String(endDay).padStart(2, "0")}`,
    prevFrom: `${prev}-01`, prevTo: `${prev}-${String(prevEnd).padStart(2, "0")}`,
    days: endDay, current,
    prevMonth: prev, nextMonth: current ? null : shiftMonth(m, 1),
  };
}

/** Dias de um período (AAAA-MM-DD, inclusive). */
export function daysBetween(from: string, to: string) {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`) && out.length < 400; t += DAY_MS) out.push(iso(new Date(t)));
  return out;
}

// ---------------- Vendas ----------------

/** O que as métricas leem de cada venda (o formato de SaleView, da tela de Vendas). */
export type MetricSale = {
  id: string;
  date: string; // ISO; o dia é o AAAA-MM-DD do começo
  day: string; // dia da venda (AAAA-MM-DD, Brasília)
  totalCents: number; resultCents: number; pricedCents: number; costCents: number; milesCostCents: number;
  paidAt: string | null;
  refunded: boolean;
  tags: string[];
  customers: { id: string; name: string }[];
  issuerIds: string[];
  accountId: string | null;
  programName: string;
  color: string;
  items: { kind: string; label: string; totalCents: number; resultCents: number; costs: { type: string; amountCents: number }[] }[];
};

const pct1 = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((t, x) => t + f(x), 0);
const passCosts = (s: MetricSale) => sum(s.items, (i) => sum(i.costs, (c) => c.amountCents));
const iofOf = (s: MetricSale) => sum(s.items, (i) => sum(i.costs.filter((c) => c.type === "IOF"), (c) => c.amountCents));

export type SalesKpis = {
  count: number; activeCount: number;
  profitCents: number; netProfitCents: number; expensesCents: number;
  revenueCents: number; marginPct: number | null; ticketCents: number | null;
  receivableCents: number; receivedCents: number;
  milesCostCents: number; feesCents: number; costCents: number;
  dailyAvg: number; iofCents: number; iofPct: number | null; cancelPct: number | null;
};

/**
 * Cartões da aba Vendas. Reembolsada: entra só a taxa de administração (como na tela de Vendas), não conta no
 * ticket nem no a receber, e conta na taxa de cancelamento. Lucro líquido = lucro − despesas do Financeiro.
 */
export function salesKpis(sales: MetricSale[], days: number, expensesCents = 0): SalesKpis {
  const active = sales.filter((s) => !s.refunded);
  const revenue = sum(sales, (s) => s.totalCents);
  const profit = sum(sales, (s) => s.resultCents);
  const priced = sum(sales, (s) => s.pricedCents);
  const iof = sum(active, iofOf);
  return {
    count: sales.length, activeCount: active.length,
    profitCents: profit, netProfitCents: profit - expensesCents, expensesCents,
    revenueCents: revenue, marginPct: pct1(profit, priced),
    ticketCents: active.length ? Math.round(sum(active, (s) => s.totalCents) / active.length) : null,
    receivableCents: sum(active.filter((s) => !s.paidAt), (s) => s.totalCents),
    receivedCents: sum(sales.filter((s) => s.paidAt), (s) => s.totalCents),
    milesCostCents: sum(active, (s) => s.milesCostCents),
    feesCents: sum(active, passCosts),
    costCents: sum(sales, (s) => s.costCents),
    dailyAvg: days > 0 ? Math.round((sales.length / days) * 10) / 10 : 0,
    iofCents: iof, iofPct: pct1(iof, revenue),
    cancelPct: pct1(sales.length - active.length, sales.length),
  };
}

/** Variação % de um número em relação ao período anterior (null quando não há base para comparar). */
export const growthPct = (now: number, before: number) => (before ? Math.round(((now - before) / Math.abs(before)) * 1000) / 10 : null);

/** Faturamento, lucro e nº de vendas de cada dia do período (dias sem venda aparecem zerados). */
export function dailySeries(sales: MetricSale[], from: string, to: string) {
  const rows = new Map(daysBetween(from, to).map((d) => [d, { day: d, revenue: 0, profit: 0, count: 0 }]));
  for (const s of sales) {
    const r = rows.get(s.day);
    if (!r) continue;
    r.revenue += s.totalCents;
    r.profit += s.resultCents;
    r.count++;
  }
  return [...rows.values()];
}

/** Mix de produtos: faturamento e lucro por tipo de item (passagem, bagagem, hospedagem...). */
export function productMix(sales: MetricSale[]) {
  const m = new Map<string, { kind: string; label: string; revenueCents: number; profitCents: number; count: number }>();
  for (const s of sales) {
    if (s.refunded) continue;
    for (const i of s.items) {
      const r = m.get(i.kind) ?? { kind: i.kind, label: i.label, revenueCents: 0, profitCents: 0, count: 0 };
      r.revenueCents += i.totalCents;
      r.profitCents += i.resultCents;
      r.count++;
      m.set(i.kind, r);
    }
  }
  const rows = [...m.values()].filter((r) => r.revenueCents || r.profitCents);
  const revenue = sum(rows, (r) => r.revenueCents), profit = sum(rows, (r) => r.profitCents);
  return rows
    .map((r) => ({ ...r, revenueShare: pct1(r.revenueCents, revenue) ?? 0, profitShare: pct1(r.profitCents, profit) ?? 0, marginPct: pct1(r.profitCents, r.revenueCents) }))
    .sort((a, b) => b.revenueCents - a.revenueCents);
}

export const AGING_BUCKETS = [
  { key: "0-7", label: "Até 7 dias", max: 7 },
  { key: "8-15", label: "8 a 15 dias", max: 15 },
  { key: "16-30", label: "16 a 30 dias", max: 30 },
  { key: "31-60", label: "31 a 60 dias", max: 60 },
  { key: "60+", label: "Mais de 60 dias", max: Infinity },
] as const;

/**
 * Saúde do recebível: tudo o que ainda não foi recebido (de qualquer mês), por há quanto tempo a venda está em
 * aberto. As vendas não têm data de vencimento: a idade conta a partir do dia da venda.
 */
export function receivableAging(openSales: MetricSale[], today: string) {
  const t = Date.parse(`${today}T00:00:00Z`);
  const buckets = AGING_BUCKETS.map((b) => ({ key: b.key, label: b.label, cents: 0, count: 0 }));
  let total = 0, oldest: number | null = null;
  for (const s of openSales) {
    if (s.refunded || s.paidAt || s.totalCents <= 0) continue;
    const age = Math.max(0, Math.round((t - Date.parse(`${s.day}T00:00:00Z`)) / DAY_MS));
    const b = buckets[AGING_BUCKETS.findIndex((x) => age <= x.max)]!;
    b.cents += s.totalCents;
    b.count++;
    total += s.totalCents;
    oldest = oldest == null ? age : Math.max(oldest, age);
  }
  return { totalCents: total, count: sum(buckets, (b) => b.count), oldestDays: oldest, buckets, overdue30Cents: sum(buckets.slice(3), (b) => b.cents) };
}

/** Faturamento por cliente (a venda com vários clientes é dividida em partes iguais). */
function revenueByCustomer(sales: MetricSale[]) {
  const m = new Map<string, { id: string; name: string; revenueCents: number; profitCents: number; count: number }>();
  for (const s of sales) {
    if (!s.customers.length) continue;
    const n = s.customers.length;
    for (const c of s.customers) {
      const r = m.get(c.id) ?? { id: c.id, name: c.name, revenueCents: 0, profitCents: 0, count: 0 };
      r.revenueCents += Math.round(s.totalCents / n);
      r.profitCents += Math.round(s.resultCents / n);
      r.count++;
      m.set(c.id, r);
    }
  }
  return [...m.values()].sort((a, b) => b.revenueCents - a.revenueCents);
}

/**
 * Carteira de clientes: quanto veio de cliente novo (primeira compra no período), de quem já comprava antes e
 * de vendas sem cliente; e o peso dos 3 maiores no faturamento. `returning` = clientes com venda antes do período.
 */
export function customerPortfolio(sales: MetricSale[], returning: Set<string>) {
  const rows = revenueByCustomer(sales);
  const revenue = sum(sales, (s) => s.totalCents);
  const fresh = rows.filter((r) => !returning.has(r.id)), old = rows.filter((r) => returning.has(r.id));
  const noCustomer = sum(sales.filter((s) => !s.customers.length), (s) => s.totalCents);
  const top3 = sum(rows.slice(0, 3), (r) => r.revenueCents);
  return {
    customers: rows.length,
    newCount: fresh.length, newCents: sum(fresh, (r) => r.revenueCents),
    returningCount: old.length, returningCents: sum(old, (r) => r.revenueCents),
    noCustomerCents: noCustomer,
    top3Pct: pct1(top3, revenue),
  };
}

export const topCustomers = (sales: MetricSale[], n = 5) => revenueByCustomer(sales).slice(0, n);

/** Etiquetas mais usadas nas vendas do período (nº de vendas e faturamento). */
export function topTags(sales: MetricSale[], n = 5) {
  const m = new Map<string, { tag: string; count: number; revenueCents: number }>();
  for (const s of sales) for (const t of s.tags) {
    const r = m.get(t) ?? { tag: t, count: 0, revenueCents: 0 };
    r.count++;
    r.revenueCents += s.totalCents;
    m.set(t, r);
  }
  return [...m.values()].sort((a, b) => b.count - a.count || b.revenueCents - a.revenueCents).slice(0, n);
}

/** Pedido do CRM Passagens criado no período: emitido (tem reserva), perdido (arquivado) ou em aberto. */
export type MetricOrder = { issued: boolean; lost: boolean; valueCents: number | null };

/** Cotação → emissão: das cotações criadas no período, quantas viraram venda e quanto ficou na mesa (perdidas). */
export function quoteConversion(orders: MetricOrder[]) {
  const issued = orders.filter((o) => o.issued), lost = orders.filter((o) => !o.issued && o.lost);
  const open = orders.length - issued.length - lost.length;
  return {
    total: orders.length, issued: issued.length, lost: lost.length, open,
    conversionPct: pct1(issued.length, orders.length),
    issuedCents: sum(issued, (o) => o.valueCents ?? 0),
    lostCents: sum(lost, (o) => o.valueCents ?? 0),
    lostWithValue: lost.filter((o) => o.valueCents).length,
  };
}

// ---------------- Equipe ----------------

export type TeamRow = { id: string; name: string; color: string; issues: number; revenueCents: number; profitCents: number; pricedCents: number; ticketCents: number | null; avgProfitCents: number | null; marginPct: number | null; prevProfitCents: number; profitGrowthPct: number | null };

/** Resultado de cada emissor: a venda com N emissores conta 1/N para cada um (emissões, faturamento e lucro). */
export function teamRows(sales: MetricSale[], prevSales: MetricSale[], members: { id: string; name: string; color: string }[]) {
  const acc = (list: MetricSale[]) => {
    const m = new Map<string, { issues: number; revenue: number; profit: number; priced: number }>();
    for (const s of list) {
      const ids = s.issuerIds.filter((id) => members.some((x) => x.id === id));
      if (!ids.length) continue;
      const share = 1 / ids.length;
      for (const id of ids) {
        const r = m.get(id) ?? { issues: 0, revenue: 0, profit: 0, priced: 0 };
        r.issues += share;
        r.revenue += s.totalCents * share;
        r.profit += s.resultCents * share;
        r.priced += s.pricedCents * share;
        m.set(id, r);
      }
    }
    return m;
  };
  const now = acc(sales), before = acc(prevSales);
  return members
    .map((mb): TeamRow => {
      const r = now.get(mb.id) ?? { issues: 0, revenue: 0, profit: 0, priced: 0 };
      const prevProfit = Math.round(before.get(mb.id)?.profit ?? 0);
      const issues = Math.round(r.issues * 100) / 100;
      return {
        id: mb.id, name: mb.name, color: mb.color, issues,
        revenueCents: Math.round(r.revenue), profitCents: Math.round(r.profit), pricedCents: Math.round(r.priced),
        ticketCents: r.issues > 0 ? Math.round(r.revenue / r.issues) : null,
        avgProfitCents: r.issues > 0 ? Math.round(r.profit / r.issues) : null,
        marginPct: pct1(r.profit, r.priced),
        prevProfitCents: prevProfit, profitGrowthPct: growthPct(Math.round(r.profit), prevProfit),
      };
    })
    .filter((r) => r.issues > 0 || r.prevProfitCents)
    .sort((a, b) => b.profitCents - a.profitCents);
}

/** Vendas e lucro da equipe por dia: só vendas com emissor; filtrando emissores, conta a parte deles na venda. */
export function teamDaily(sales: MetricSale[], memberIds: string[], from: string, to: string, only: string[] | null = null) {
  const rows = new Map(daysBetween(from, to).map((d) => [d, { day: d, revenue: 0, profit: 0, count: 0 }]));
  for (const s of sales) {
    const ids = s.issuerIds.filter((id) => memberIds.includes(id));
    if (!ids.length) continue;
    const w = only ? ids.filter((id) => only.includes(id)).length / ids.length : 1;
    const r = rows.get(s.day);
    if (!r || !w) continue;
    r.revenue += Math.round(s.totalCents * w);
    r.profit += Math.round(s.resultCents * w);
    r.count += w;
  }
  return [...rows.values()];
}

/** Cartões da aba Equipe (só as vendas com emissor contam). */
export function teamKpis(rows: TeamRow[], sales: MetricSale[]) {
  const active = rows.filter((r) => r.issues > 0);
  const revenue = sum(active, (r) => r.revenueCents), profit = sum(active, (r) => r.profitCents), priced = sum(active, (r) => r.pricedCents);
  const issues = sum(active, (r) => r.issues);
  const byRevenue = [...active].sort((a, b) => b.revenueCents - a.revenueCents);
  return {
    revenueCents: revenue,
    ticketCents: issues > 0 ? Math.round(revenue / issues) : null,
    marginPct: pct1(profit, priced),
    issuers: active.length,
    avgIssues: active.length ? Math.round((issues / active.length) * 10) / 10 : 0,
    avgProfitCents: active.length ? Math.round(profit / active.length) : null,
    top3Pct: pct1(sum(byRevenue.slice(0, 3), (r) => r.revenueCents), revenue),
    withoutIssuer: sales.filter((s) => !s.issuerIds.length).length,
  };
}

// ---------------- Contas ----------------

export type MetricAccount = {
  id: string; programId: string; programName: string; holderName: string; color: string;
  balance: number; costCents: number; marketValueCpmCents: number; club: boolean;
  cpf: { used: number; limit: number } | null;
};

const cpmOf = (cents: number, points: number) => (points > 0 ? Math.round((cents * 1000) / points) : null);

/**
 * Aba Contas: o que está investido (custo do saldo de hoje), o valor de mercado desse saldo e o resultado das
 * vendas do período feitas com as próprias contas, por programa.
 */
export function accountsMetrics(accounts: MetricAccount[], sales: MetricSale[]) {
  const ownSales = sales.filter((s) => s.accountId && accounts.some((a) => a.id === s.accountId));
  const programs = new Map<string, {
    programId: string; name: string; color: string; accounts: number; balance: number; investedCents: number; projectedCents: number; marketCpmCents: number;
    revenueCents: number; profitCents: number; pricedCents: number; milesCostCents: number; cpfUsed: number; cpfLimit: number;
  }>();
  for (const a of accounts) {
    const p = programs.get(a.programId) ?? { programId: a.programId, name: a.programName, color: a.color, accounts: 0, balance: 0, investedCents: 0, projectedCents: 0, marketCpmCents: a.marketValueCpmCents, revenueCents: 0, profitCents: 0, pricedCents: 0, milesCostCents: 0, cpfUsed: 0, cpfLimit: 0 };
    p.accounts++;
    p.balance += a.balance;
    p.investedCents += a.costCents;
    p.projectedCents += Math.round((a.balance * a.marketValueCpmCents) / 1000);
    if (a.cpf) { p.cpfUsed += a.cpf.used; p.cpfLimit += a.cpf.limit; }
    programs.set(a.programId, p);
  }
  const programOf = new Map(accounts.map((a) => [a.id, a.programId]));
  for (const s of ownSales) {
    const p = programs.get(programOf.get(s.accountId!)!)!;
    p.revenueCents += s.totalCents;
    p.profitCents += s.resultCents;
    p.pricedCents += s.pricedCents;
    p.milesCostCents += s.milesCostCents;
  }
  const invested = sum(accounts, (a) => a.costCents);
  // Projeção só com as contas cujo programa tem valor de mercado (sem ele, a conta não entra na comparação)
  const priced2 = accounts.filter((a) => a.balance > 0 && a.marketValueCpmCents > 0);
  const hasMarket = priced2.length > 0;
  const projected = sum(priced2, (a) => Math.round((a.balance * a.marketValueCpmCents) / 1000));
  const projectedBase = sum(priced2, (a) => a.costCents);
  const profit = sum(ownSales, (s) => s.resultCents), priced = sum(ownSales, (s) => s.pricedCents);
  const rows = [...programs.values()].map((p) => ({
    ...p,
    paidCpmCents: cpmOf(p.investedCents, p.balance),
    marketCpmCents: p.marketCpmCents || null,
    marginPct: pct1(p.profitCents, p.pricedCents),
    roiPct: pct1(p.profitCents, p.milesCostCents),
    investedShare: pct1(p.investedCents, invested) ?? 0,
    cpfPct: p.cpfLimit > 0 ? Math.min(100, Math.round((p.cpfUsed / p.cpfLimit) * 100)) : null,
  })).sort((a, b) => b.investedCents - a.investedCents);
  return {
    kpis: {
      profitCents: profit, revenueCents: sum(ownSales, (s) => s.totalCents), marginPct: pct1(profit, priced),
      investedCents: invested,
      projectedCents: hasMarket ? projected : null,
      projectedProfitCents: hasMarket ? projected - projectedBase : null,
      projectedPct: hasMarket ? pct1(projected - projectedBase, projectedBase) : null,
      unpricedAccounts: accounts.filter((a) => a.balance > 0 && !a.marketValueCpmCents).length,
      accounts: accounts.length, clubAccounts: accounts.filter((a) => a.club).length,
    },
    programs: rows,
  };
}
