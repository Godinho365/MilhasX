// Calculadoras rápidas: contas puras, sem banco. Valores em centavos, pontos inteiros, percentuais em número (80 = 80%).

const cpmOf = (costCents: number, points: number) => (points > 0 ? Math.round((costCents * 1000) / points) : null);
const costOf = (points: number, cpmCents: number) => Math.round((points * cpmCents) / 1000);

/** Converte um valor em dólar para reais com o dólar turismo e o IOF (rateMilli = R$ por US$ × 1000, iof em %). */
export function usdToBrlCents(usdCents: number, rateMilli: number, iofPct: number) {
  return Math.round(((usdCents * rateMilli) / 1000) * (1 + iofPct / 100));
}

export type QuoteInput = { points: number; cpmCents: number; boardingCents: number; otherCents: number; saleCents?: number | null };

/** Comparador de cotações: custo dos pontos + taxas = custo final; com venda, o lucro e a margem. */
export function quoteCost(q: QuoteInput) {
  const pointsCostCents = costOf(q.points, q.cpmCents);
  const feesCents = q.boardingCents + q.otherCents;
  const totalCents = pointsCostCents + feesCents;
  const profitCents = q.saleCents ? q.saleCents - totalCents : null;
  const marginPct = q.saleCents && profitCents != null ? Math.round((profitCents / q.saleCents) * 1000) / 10 : null;
  return { pointsCostCents, feesCents, totalCents, profitCents, marginPct };
}

/** Índice da cotação de menor custo final entre as preenchidas (null se nenhuma tiver pontos ou taxas). */
export function cheapestQuote(quotes: QuoteInput[]) {
  let best: number | null = null;
  quotes.forEach((q, i) => {
    if (q.points <= 0 && q.boardingCents + q.otherCents <= 0) return;
    if (best === null || quoteCost(q).totalCents < quoteCost(quotes[best]!).totalCents) best = i;
  });
  return best;
}

export type Partnership = { fromId: string; toId: string; fromUnits: number; toUnits: number };
export type Route = { path: string[]; ratio: number; legs: Partnership[] };

/**
 * Rotas de transferência até o destino: diretas e com uma escala (origem → intermediário → destino).
 * ratio = pontos que chegam no destino para cada 1 ponto da origem.
 */
export function routesTo(partners: Partnership[], toId: string, maxStops = 1): Route[] {
  const out: Route[] = [];
  const walk = (at: string, legs: Partnership[], seen: Set<string>) => {
    for (const p of partners) {
      if (p.toId !== at || seen.has(p.fromId) || p.fromUnits <= 0 || p.toUnits <= 0) continue;
      const chain = [p, ...legs];
      out.push({ path: [p.fromId, ...chain.map((l) => l.toId)], ratio: chain.reduce((r, l) => (r * l.toUnits) / l.fromUnits, 1), legs: chain });
      if (chain.length <= maxStops) walk(p.fromId, chain, new Set([...seen, p.fromId]));
    }
  };
  walk(toId, [], new Set([toId]));
  return out.sort((a, b) => a.legs.length - b.legs.length || b.ratio - a.ratio);
}

export type ClubInput = {
  miles: number; // milhas do plano por mês, sem bônus
  monthlyCents: number;
  months: number;
  signupBonus?: number; // milhas ao assinar (mês 1)
  bonusMiles?: { miles: number; months: number }; // milhas extras por X meses
  bonusPct?: { pct: number; months: number }; // % extra sobre as milhas do plano por X meses
  bonusEvery?: { miles: number; every: number }; // bônus de permanência a cada X meses
  discountCents?: number; // desconto fixo todo mês
  discountPct?: number; // desconto % todo mês
  discountCentsFor?: { cents: number; months: number };
  discountPctFor?: { pct: number; months: number };
};

/** Simulador de assinatura: mês a mês, milhas recebidas, valor pago e CPM acumulado. */
export function projectClub(c: ClubInput) {
  const months = Math.max(1, Math.min(120, Math.floor(c.months)));
  const rows = [];
  let totalMiles = 0;
  let totalPaid = 0;
  for (let m = 1; m <= months; m++) {
    let bonus = 0;
    if (m === 1 && c.signupBonus) bonus += c.signupBonus;
    if (c.bonusMiles && m <= c.bonusMiles.months) bonus += c.bonusMiles.miles;
    if (c.bonusPct && m <= c.bonusPct.months) bonus += Math.round((c.miles * c.bonusPct.pct) / 100);
    if (c.bonusEvery && c.bonusEvery.every > 0 && m % c.bonusEvery.every === 0) bonus += c.bonusEvery.miles;
    let pct = c.discountPct ?? 0;
    if (c.discountPctFor && m <= c.discountPctFor.months) pct += c.discountPctFor.pct;
    let fixed = c.discountCents ?? 0;
    if (c.discountCentsFor && m <= c.discountCentsFor.months) fixed += c.discountCentsFor.cents;
    const paid = Math.max(0, Math.round((c.monthlyCents * (100 - Math.min(100, pct))) / 100) - fixed);
    const miles = c.miles + bonus;
    totalMiles += miles;
    totalPaid += paid;
    rows.push({ month: m, base: c.miles, bonus, miles, paidCents: paid, cpmCents: cpmOf(paid, miles), totalMiles, totalPaidCents: totalPaid });
  }
  return { rows, totalMiles, totalPaidCents: totalPaid, avgCpmCents: cpmOf(totalPaid, totalMiles) };
}

/** Transferência bonificada: milhas recebidas, pointsback (volta para a origem) e o novo CPM no destino. */
export function bonusTransfer(i: { points: number; bonusPct: number; pointsbackPct?: number; cpmCents?: number }) {
  const bonus = Math.floor((i.points * i.bonusPct) / 100);
  const received = i.points + bonus;
  const pointsback = Math.floor((i.points * (i.pointsbackPct ?? 0)) / 100);
  const costCents = i.cpmCents ? costOf(i.points, i.cpmCents) : null;
  // o pointsback devolve pontos na origem: valem o mesmo CPM pago e abatem o custo
  const netCostCents = costCents != null && i.cpmCents ? costCents - costOf(pointsback, i.cpmCents) : null;
  return { bonus, received, pointsback, costCents, netCostCents, finalCpmCents: netCostCents != null ? cpmOf(netCostCents, received) : null };
}

/** Custo do milheiro numa compra direta de milhas. */
export function directCpm(miles: number, totalCents: number) {
  return cpmOf(totalCents, miles);
}

/**
 * Limite de bonificação: quanto transferir para usar todo o bônus máximo da promoção sem desperdiçar.
 * Paridade origem:destino (ex.: 1:1, 3:1). Retorna os pontos que saem da origem e os que chegam no destino.
 */
export function bonusLimit(i: { maxBonus: number; bonusPct: number; parityFrom?: number; parityTo?: number }) {
  if (i.bonusPct <= 0 || i.maxBonus <= 0) return null;
  const pf = i.parityFrom || 1;
  const pt = i.parityTo || 1;
  const destBase = Math.floor((i.maxBonus * 100) / i.bonusPct); // pontos que chegam antes do bônus
  const origin = Math.ceil((destBase * pf) / pt);
  return { origin, destBase, bonus: i.maxBonus, received: destBase + i.maxBonus };
}

/** "Bug do carrinho": compra paga em pontos + dinheiro e depois transferida com bônus. */
export function cartBug(i: { miles: number; bonusPct: number; pointsUsed: number; pointsCpmCents?: number; cashCents: number }) {
  const received = i.miles + Math.floor((i.miles * i.bonusPct) / 100);
  const pointsCostCents = i.pointsCpmCents ? costOf(i.pointsUsed, i.pointsCpmCents) : 0;
  const costCents = pointsCostCents + i.cashCents;
  return { received, pointsCostCents, costCents, cpmWithoutBonusCents: cpmOf(costCents, i.miles), finalCpmCents: cpmOf(costCents, received) };
}
