// Compra parcelada e antecipação: a 1ª parcela é paga normal e as outras n−1 podem ser quitadas
// com desconto (como na Livelo). O custo que entra no CPM é o que de fato sai do bolso.

/** payoffCents: valor para quitar as n−1 parcelas; null antecipando = estimado pela taxa da antecipação. */
export type PaymentPlan = { installments: number; anticipate: boolean; payoffCents: number | null };

export type PlanResult = {
  firstCents: number; // 1ª parcela (fica com o centavo que sobra da divisão)
  installmentCents: number; // valor de cada uma das outras parcelas
  restCents: number; // soma das n−1 parcelas que podem ser antecipadas
  payoffCents: number | null; // valor para quitar as n−1 parcelas (o informado ou o estimado)
  estimated: boolean; // o valor para quitar foi estimado pela taxa da antecipação
  effectiveCents: number; // custo real: o total, ou 1ª parcela + valor pago para quitar
  discountCents: number;
  discountPct: number | null; // desconto sobre as parcelas antecipadas
  discountTotalPct: number | null; // desconto sobre a compra toda
  monthlyRatePct: number | null; // taxa ao mês equivalente ao desconto
};

const round2 = (v: number) => Math.round(v * 100) / 100;

/** As parcelas restantes (vencendo nos meses 1..count) trazidas a valor presente pela taxa ao mês i. */
function presentValue(installmentCents: number, count: number, i: number) {
  return Array.from({ length: count }, (_, k) => installmentCents / (1 + i) ** (k + 1)).reduce((t, v) => t + v, 0);
}

/** Taxa mensal i tal que as parcelas restantes (meses 1..k) trazidas a valor presente dão o valor de quitação. */
function impliedMonthlyRate(installmentCents: number, count: number, payoffCents: number) {
  const pv = (i: number) => presentValue(installmentCents, count, i);
  if (payoffCents >= pv(0)) return 0;
  let lo = 0, hi = 1;
  for (let it = 0; it < 80; it++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > payoffCents) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Taxa ao mês da antecipação real da Livelo: R$ 3.080 em 12x, as 11 parcelas de R$ 256,66 quitadas por
 *  R$ 2.685,75 (≈ 0,84% ao mês). Sem o valor para quitar, a antecipação é estimada com ela. */
export const ANTICIPATION_MONTHLY_RATE = impliedMonthlyRate(25_666, 11, 268_575);

/** Valor para quitar estimado: as parcelas restantes trazidas a valor presente pela taxa da antecipação. */
export const estimatedPayoffCents = (installmentCents: number, count: number, rate = ANTICIPATION_MONTHLY_RATE) =>
  Math.round(presentValue(installmentCents, count, rate));

export function planCost(totalCents: number, plan: PaymentPlan): PlanResult {
  const n = Math.max(1, Math.floor(plan.installments));
  const installmentCents = Math.floor(totalCents / n);
  const restCents = installmentCents * (n - 1);
  const firstCents = totalCents - restCents;
  const base = { firstCents, installmentCents, restCents, payoffCents: null, estimated: false, effectiveCents: totalCents, discountCents: 0, discountPct: null, discountTotalPct: null, monthlyRatePct: null };
  if (n === 1 || !plan.anticipate) return base;
  const estimated = plan.payoffCents == null;
  const payoffCents = plan.payoffCents ?? estimatedPayoffCents(installmentCents, n - 1);
  if (payoffCents < 0 || payoffCents > restCents) return base;
  const discountCents = restCents - payoffCents;
  return {
    ...base,
    payoffCents,
    estimated,
    effectiveCents: firstCents + payoffCents,
    discountCents,
    discountPct: restCents > 0 ? round2((discountCents / restCents) * 100) : null,
    discountTotalPct: totalCents > 0 ? round2((discountCents / totalCents) * 100) : null,
    monthlyRatePct: restCents > 0 ? round2((estimated ? ANTICIPATION_MONTHLY_RATE : impliedMonthlyRate(installmentCents, n - 1, payoffCents)) * 100) : null,
  };
}

/** Aplica o custo real às linhas de custo, na proporção de cada uma (a última fica com o arredondamento). */
export function scaleCosts<T extends { amountCents: number }>(items: T[], effectiveCents: number): T[] {
  const total = items.reduce((t, c) => t + c.amountCents, 0);
  if (total <= 0 || effectiveCents === total) return items;
  let used = 0;
  return items.map((c, i) => {
    const v = i === items.length - 1 ? effectiveCents - used : Math.round((c.amountCents * effectiveCents) / total);
    used += v;
    return { ...c, amountCents: v };
  });
}
