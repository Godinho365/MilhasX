// Cartão de crédito: pontos estimados da fatura e a anuidade que entra no custo (CPM) desses pontos.
// A anuidade é cobrada em 12 parcelas mensais; a parcela do mês some quando a fatura atinge o gasto
// que isenta (ex.: R$ 8.000/mês).

export function expectedCardPoints(amountCents: number, pointsPerDollarX100: number, dollarRateCents: number) {
  if (dollarRateCents <= 0) return 0;
  return Math.floor((amountCents / dollarRateCents) * (pointsPerDollarX100 / 100));
}

export type FeeRule = { annualFeeCents: number; feeWaiverCents: number | null };

/** Parcela da anuidade cobrada numa fatura (zero se o gasto do mês isenta). */
export function invoiceFeeCents(card: FeeRule, amountCents: number) {
  if (card.annualFeeCents <= 0) return 0;
  if (card.feeWaiverCents != null && card.feeWaiverCents > 0 && amountCents >= card.feeWaiverCents) return 0;
  return Math.round(card.annualFeeCents / 12);
}

/** Custo da anuidade por milheiro (R$ por 1.000 pontos), em centavos. */
export const feeCpmCents = (feeCents: number, points: number) => (feeCents > 0 && points > 0 ? Math.round((feeCents * 1000) / points) : 0);

/** Simulação de um mês: pontos, parcela da anuidade e CPM para um gasto. */
export function simulateMonth(card: FeeRule & { pointsPerDollar: number; dollarRateCents: number }, spendCents: number) {
  const points = expectedCardPoints(spendCents, card.pointsPerDollar, card.dollarRateCents);
  const fee = invoiceFeeCents(card, spendCents);
  return { points, feeCents: fee, cpmCents: feeCpmCents(fee, points), waived: card.annualFeeCents > 0 && fee === 0 };
}
