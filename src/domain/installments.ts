// Compra parcelada e antecipação: a 1ª parcela é paga normal e as outras n−1 podem ser quitadas
// com desconto (como na Livelo). O custo que entra no CPM é o que de fato sai do bolso.

export type PaymentPlan = { installments: number; anticipate: boolean; payoffCents: number | null };

export type PlanResult = {
  firstCents: number; // 1ª parcela (fica com o centavo que sobra da divisão)
  installmentCents: number; // valor de cada uma das outras parcelas
  restCents: number; // soma das n−1 parcelas que podem ser antecipadas
  effectiveCents: number; // custo real: o total, ou 1ª parcela + valor pago para quitar
  discountCents: number;
  discountPct: number | null; // desconto sobre as parcelas antecipadas
  discountTotalPct: number | null; // desconto sobre a compra toda
  monthlyRatePct: number | null; // taxa ao mês equivalente ao desconto
};

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Taxa mensal i tal que as parcelas restantes (meses 1..k) trazidas a valor presente dão o valor de quitação. */
function impliedMonthlyRate(installmentCents: number, count: number, payoffCents: number) {
  const pv = (i: number) => Array.from({ length: count }, (_, k) => installmentCents / (1 + i) ** (k + 1)).reduce((t, v) => t + v, 0);
  if (payoffCents >= pv(0)) return 0;
  let lo = 0, hi = 1;
  for (let it = 0; it < 80; it++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > payoffCents) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function planCost(totalCents: number, plan: PaymentPlan): PlanResult {
  const n = Math.max(1, Math.floor(plan.installments));
  const installmentCents = Math.floor(totalCents / n);
  const restCents = installmentCents * (n - 1);
  const firstCents = totalCents - restCents;
  const base = { firstCents, installmentCents, restCents, effectiveCents: totalCents, discountCents: 0, discountPct: null, discountTotalPct: null, monthlyRatePct: null };
  if (n === 1 || !plan.anticipate || plan.payoffCents == null || plan.payoffCents < 0 || plan.payoffCents > restCents) return base;
  const discountCents = restCents - plan.payoffCents;
  return {
    ...base,
    effectiveCents: firstCents + plan.payoffCents,
    discountCents,
    discountPct: restCents > 0 ? round2((discountCents / restCents) * 100) : null,
    discountTotalPct: totalCents > 0 ? round2((discountCents / totalCents) * 100) : null,
    monthlyRatePct: round2(impliedMonthlyRate(installmentCents, n - 1, plan.payoffCents) * 100),
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
