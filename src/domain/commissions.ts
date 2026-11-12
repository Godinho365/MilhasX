// Metas e comissões: o cálculo da comissão de cada membro da equipe, sem banco (testável).
// Uma regra diz como o membro ganha: % do faturamento, % do lucro, R$ por venda ou R$ por mil milhas; sobre as
// vendas que ele emitiu (em venda com vários emissores, a parte dele) ou sobre as da agência toda (gestor); por mês
// ou trimestre, a partir de uma data. Faixas (retroativas): a maior faixa atingida no período vale para a base toda.

export const COMMISSION_KINDS = {
  SALE_PCT: "% do faturamento",
  PROFIT_PCT: "% do lucro",
  FIXED: "R$ por venda",
  PER_K_MILES: "R$ por mil milhas",
} as const;
export type CommissionKind = keyof typeof COMMISSION_KINDS;
export const COMMISSION_BASES = { INDIVIDUAL: "Vendas que ele emitiu", TEAM: "Vendas da agência toda" } as const;
export type CommissionBase = keyof typeof COMMISSION_BASES;
export type CommissionPeriod = "MONTH" | "QUARTER";

/** Faixa: a partir de `min` (no medidor da regra: centavos, vendas ou milhas), vale `value`. */
export type Tier = { min: number; value: number };
export type Rule = { kind: CommissionKind; value: number; base: CommissionBase; tiers: Tier[]; period: CommissionPeriod; startsAt: Date };

/** O que a regra mede: faturamento e lucro em centavos, vendas (podem ser frações, na venda rateada) e milhas. */
export type Stats = { revenue: number; profit: number; sales: number; miles: number };
export const emptyStats = (): Stats => ({ revenue: 0, profit: 0, sales: 0, miles: 0 });

/** Venda como o cálculo precisa: emissores, total, resultado (lucro) e pontos; reembolsada não conta. */
export type SaleLite = { occurredAt: string | Date; issuerIds: string[]; totalCents: number; resultCents: number; points: number; refunded: boolean };

/** Números do membro nas vendas: as que ele emitiu (a parte dele, rateada) ou todas (base da agência). */
export function statsFor(sales: SaleLite[], memberId: string | null, base: CommissionBase): Stats {
  const s = emptyStats();
  for (const v of sales) {
    if (v.refunded) continue;
    let share = 1;
    if (base === "INDIVIDUAL") {
      if (!memberId || !v.issuerIds.includes(memberId)) continue;
      share = 1 / v.issuerIds.length;
    }
    s.revenue += v.totalCents * share;
    s.profit += v.resultCents * share;
    s.sales += share;
    s.miles += v.points * share;
  }
  return s;
}

/** O medidor da regra (para as faixas e para mostrar): faturamento, lucro, nº de vendas ou milhas. */
export function measure(kind: CommissionKind, s: Stats) {
  return kind === "SALE_PCT" ? s.revenue : kind === "PROFIT_PCT" ? s.profit : kind === "FIXED" ? s.sales : s.miles;
}

/** O valor que vale: o da maior faixa atingida, ou o da regra. */
export function effectiveValue(rule: Pick<Rule, "kind" | "value" | "tiers">, s: Stats) {
  const m = measure(rule.kind, s);
  const hit = [...rule.tiers].sort((a, b) => b.min - a.min).find((t) => m >= t.min);
  return hit ? hit.value : rule.value;
}

/** Comissão (centavos) da regra no período. % em centésimos (10% = 1000); R$ em centavos. Lucro negativo = 0. */
export function commissionFor(rule: Pick<Rule, "kind" | "value" | "tiers">, s: Stats) {
  const v = effectiveValue(rule, s);
  const cents =
    rule.kind === "SALE_PCT" ? (s.revenue * v) / 10_000
    : rule.kind === "PROFIT_PCT" ? (Math.max(0, s.profit) * v) / 10_000
    : rule.kind === "FIXED" ? s.sales * v
    : (s.miles * v) / 1000;
  return Math.max(0, Math.round(cents));
}

/** Primeiro dia do período que contém a data (UTC). */
export function periodStartOf(period: CommissionPeriod, d: Date) {
  const m = period === "QUARTER" ? Math.floor(d.getUTCMonth() / 3) * 3 : d.getUTCMonth();
  return new Date(Date.UTC(d.getUTCFullYear(), m, 1));
}
/** Primeiro dia do período seguinte. */
export function periodNext(period: CommissionPeriod, start: Date) {
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + (period === "QUARTER" ? 3 : 1), 1));
}
/** Os períodos da regra, do início dela até o período atual (inclusive). */
export function periodsUntil(period: CommissionPeriod, startsAt: Date, now: Date) {
  const out: Date[] = [];
  for (let p = periodStartOf(period, startsAt); p <= now && out.length < 240; p = periodNext(period, p)) out.push(p);
  return out;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const periodLabel = (period: CommissionPeriod, start: Date) =>
  period === "QUARTER" ? `${Math.floor(start.getUTCMonth() / 3) + 1}º tri/${start.getUTCFullYear()}` : `${MONTHS[start.getUTCMonth()]}/${start.getUTCFullYear()}`;

/** Descrição curta da regra: "5% do lucro · vendas que ele emitiu · mensal (faixas)". */
export function describeRule(r: Pick<Rule, "kind" | "value" | "base" | "tiers" | "period">) {
  const money = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const pct = (v: number) => `${(v / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  const val = r.kind === "SALE_PCT" ? `${pct(r.value)} do faturamento` : r.kind === "PROFIT_PCT" ? `${pct(r.value)} do lucro` : r.kind === "FIXED" ? `${money(r.value)} por venda` : `${money(r.value)} por mil milhas`;
  return `${val} · ${r.base === "TEAM" ? "vendas da agência" : "vendas que emitiu"} · ${r.period === "QUARTER" ? "trimestral" : "mensal"}${r.tiers.length ? ` · ${r.tiers.length} ${r.tiers.length === 1 ? "faixa" : "faixas"}` : ""}`;
}
