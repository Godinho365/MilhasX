// Simuladores (cálculos puros, valores em centavos; CPM = custo por milheiro em centavos)

const cpm = (costCents: number, points: number) => (points > 0 ? Math.round((costCents * 1000) / points) : null);
const valueOf = (points: number, cpmCents: number) => Math.round((points * cpmCents) / 1000);

/** Estado da conta usada no simulador: saldo e custo de aquisição (para o CPM antes/depois). */
export type AccountState = { balance: number; costCents: number };

export const SIMULATOR_KINDS = ["bonificada", "store-comparison", "pontos", "transfer", "flight", "hotel", "sale", "supplier-ranking"] as const;
export type SimulatorKind = (typeof SIMULATOR_KINDS)[number];

export const KIND_LABELS: Record<SimulatorKind, string> = {
  bonificada: "Compra Bonificada",
  "store-comparison": "Pontos vs Cashback",
  pontos: "Compra de Pontos",
  transfer: "Transferência",
  flight: "Passagem Aérea",
  hotel: "Hospedagem",
  sale: "Venda",
  "supplier-ranking": "Melhor fornecedor",
};

/** Compra bonificada: gastar `valueCents` numa loja que dá `pointsPerReal` pts/R$. */
export function simulateBonusPurchase(input: { valueCents: number; pointsPerReal: number; extraCostCents: number; account?: AccountState }) {
  const points = Math.floor((input.valueCents / 100) * input.pointsPerReal);
  const totalCostCents = input.valueCents + input.extraCostCents;
  // O produto tem valor: o custo dos pontos é só o extra pago (frete, markup, diferença de preço)
  const cpmExtraCents = cpm(input.extraCostCents, points);
  const cpmTotalCents = cpm(totalCostCents, points);
  const a = input.account;
  return {
    points,
    totalCostCents,
    cpmExtraCents,
    cpmTotalCents,
    accountCpmBefore: a ? cpm(a.costCents, a.balance) : null,
    accountCpmAfter: a ? cpm(a.costCents + input.extraCostCents, a.balance + points) : null,
  };
}

/** Pontos vs cashback: custo efetivo de cada loja, dado quanto vale o milheiro. */
export function simulateStoreComparison(input: { milheiroCents: number; pointsPriceCents: number; pointsPerReal: number; cashbackPriceCents: number; cashbackPercent: number }) {
  const points = Math.floor((input.pointsPriceCents / 100) * input.pointsPerReal);
  const pointsValueCents = valueOf(points, input.milheiroCents);
  const pointsEffectiveCents = input.pointsPriceCents - pointsValueCents;
  const cashbackCents = Math.round((input.cashbackPriceCents * input.cashbackPercent) / 100);
  const cashbackEffectiveCents = input.cashbackPriceCents - cashbackCents;
  const diff = cashbackEffectiveCents - pointsEffectiveCents;
  // Valor do milheiro em que as duas opções empatam
  const breakEvenCpmCents = points > 0 ? Math.round(((input.pointsPriceCents - cashbackEffectiveCents) * 1000) / points) : null;
  return {
    points,
    pointsValueCents,
    pointsEffectiveCents,
    cashbackCents,
    cashbackEffectiveCents,
    winner: diff > 0 ? ("points" as const) : diff < 0 ? ("cashback" as const) : ("tie" as const),
    savingCents: Math.abs(diff),
    breakEvenCpmCents,
  };
}

/** Compra de pontos: CPM da compra e como fica o CPM da conta. */
export function simulateBuyPoints(input: { points: number; costCents: number; account?: AccountState; marketCpmCents?: number }) {
  const a = input.account;
  const purchaseCpm = cpm(input.costCents, input.points);
  return {
    purchaseCpmCents: purchaseCpm,
    accountCpmBefore: a ? cpm(a.costCents, a.balance) : null,
    accountCpmAfter: a ? cpm(a.costCents + input.costCents, a.balance + input.points) : null,
    newBalance: (a?.balance ?? 0) + input.points,
    // Positivo: comprou abaixo do valor de mercado
    vsMarketCents: input.marketCpmCents && purchaseCpm != null ? input.marketCpmCents - purchaseCpm : null,
  };
}

/**
 * Transferência com paridade, bônus, taxas e compra no carrinho — mesma regra do lançamento real:
 * pontos que chegam = floor(pontos × destino / origem) + bônus; custo levado = custo médio da origem
 * (ou, com "aplicar todos os comprados", a compra inteira + o restante pelo custo antigo) + taxas.
 */
export function simulateTransfer(input: {
  points: number;
  bonusPercent: number;
  parityFrom?: number;
  parityTo?: number;
  feeCents?: number;
  source: AccountState;
  destination?: AccountState;
  purchase?: { points: number; priceCents: number; applyAll: boolean } | null;
}) {
  const pf = Math.max(1, input.parityFrom ?? 1);
  const pt = Math.max(1, input.parityTo ?? 1);
  const base = Math.floor((input.points * pt) / pf);
  const bonusPoints = Math.floor((base * input.bonusPercent) / 100);
  const totalPoints = base + bonusPoints;
  const buy = input.purchase && input.purchase.points > 0 ? input.purchase : null;
  const srcBalance = input.source.balance + (buy?.points ?? 0);
  const srcCost = input.source.costCents + (buy?.priceCents ?? 0);
  const enough = input.points <= srcBalance;
  let carried = 0;
  if (input.points > 0 && srcBalance > 0) {
    const pts = Math.min(input.points, srcBalance);
    if (buy?.applyAll) {
      const pp = Math.min(buy.points, pts);
      const rest = pts - pp;
      const restBalance = srcBalance - pp;
      carried = buy.priceCents + (rest > 0 && restBalance > 0 ? Math.round(((srcCost - buy.priceCents) * rest) / restBalance) : 0);
    } else carried = Math.round((srcCost * pts) / srcBalance);
  }
  const costCents = carried + (input.feeCents ?? 0);
  const d = input.destination;
  return {
    basePoints: base,
    bonusPoints,
    totalPoints,
    costCents,
    sourceCpmCents: cpm(srcCost, srcBalance),
    destCpmCents: cpm(costCents, totalPoints),
    destAccountCpmAfter: d ? cpm(d.costCents + costCents, d.balance + totalPoints) : null,
    enough,
    sourceBalanceAfter: srcBalance - input.points,
  };
}

/** Passagem aérea: pontos de ida e volta valorizados pelo CPM da conta, mais as taxas. */
export function simulateFlight(input: { outboundPoints: number; returnPoints: number; taxesCents: number; account: AccountState }) {
  const points = input.outboundPoints + input.returnPoints;
  const accountCpm = cpm(input.account.costCents, input.account.balance) ?? 0;
  const pointsCostCents = valueOf(points, accountCpm);
  return {
    points,
    accountCpmCents: accountCpm,
    pointsCostCents,
    totalCostCents: pointsCostCents + input.taxesCents,
    enough: points <= input.account.balance,
    balanceAfter: input.account.balance - points,
  };
}

/** Hospedagem: desconto aplicado sobre os pontos da reserva. */
export function simulateHotel(input: { points: number; discountPercent: number; taxesCents: number; account: AccountState }) {
  const discount = Math.min(Math.max(input.discountPercent, 0), 100);
  const points = Math.ceil((input.points * (100 - discount)) / 100);
  const accountCpm = cpm(input.account.costCents, input.account.balance) ?? 0;
  const pointsCostCents = valueOf(points, accountCpm);
  return {
    points,
    savedPoints: input.points - points,
    accountCpmCents: accountCpm,
    pointsCostCents,
    totalCostCents: pointsCostCents + input.taxesCents,
    enough: points <= input.account.balance,
    balanceAfter: input.account.balance - points,
  };
}

/** Venda: lucro sobre o custo dos pontos (CPM da conta ou preço combinado com o fornecedor). */
export function simulateSale(input: { points: number; saleCents: number; extraCostsCents: number; costCpmCents: number }) {
  const pointsCostCents = valueOf(input.points, input.costCpmCents);
  const profitCents = input.saleCents - pointsCostCents - input.extraCostsCents;
  return {
    points: input.points,
    pointsCostCents,
    profitCents,
    marginPct: input.saleCents > 0 ? Math.round((profitCents / input.saleCents) * 1000) / 10 : null,
    saleCpmCents: cpm(input.saleCents, input.points),
  };
}

/** Venda de milhas a um preço por milheiro (usada em Vendas): valor líquido e lucro sobre o custo médio. */
export function simulateMilesSale(input: { points: number; priceCpmCents: number; feesCents: number; avgCpmCents: number }) {
  const grossCents = valueOf(input.points, input.priceCpmCents);
  const netCents = grossCents - input.feesCents;
  const costCents = valueOf(input.points, input.avgCpmCents);
  return { grossCents, netCents, costCents, profitCents: netCents - costCents };
}

export type SupplierOption = { id: string; supplier: string; identifier: string | null; balance: number; priceCpmCents: number; cpfAvailable: number | null };

/**
 * Melhor fornecedor para uma emissão: só serve quem tem saldo e CPFs disponíveis (quando informado);
 * entre esses, o mais barato primeiro.
 */
export function rankSuppliers(options: SupplierOption[], points: number, cpfCount: number) {
  return options
    .map((o) => {
      const reasons: string[] = [];
      if (o.balance < points) reasons.push("Saldo insuficiente");
      if (o.cpfAvailable != null && o.cpfAvailable < cpfCount) reasons.push("CPFs insuficientes");
      return { ...o, costCents: valueOf(points, o.priceCpmCents), eligible: reasons.length === 0, reasons };
    })
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.costCents - b.costCents);
}

/** Título curto da simulação salva em "Recentes" (ex.: "Livelo → LATAM PASS · 2 mil pts"). */
export function simulationTitle(parts: { from?: string; to?: string; label?: string; points?: number }) {
  const pts = parts.points ? ` · ${parts.points >= 1000 ? `${Math.round(parts.points / 100) / 10} mil`.replace(".", ",") : parts.points} pts` : "";
  if (parts.from && parts.to) return `${parts.from} → ${parts.to}${pts}`;
  return `${parts.label ?? "Simulação"}${pts}`;
}
