// Potencial de lucro de um programa: aplica o histórico de vendas (preço do milheiro e pontos por CPF)
// ao estoque atual (saldo, custo médio e CPFs livres). O que acabar primeiro — pontos ou CPFs — é o gargalo.

export type PotentialInput = {
  stockPoints: number;
  stockCostCents: number;
  cpfFree: number | null; // null = programa sem limite de CPFs
  hist: { points: number; pointsValueCents: number; cpfs: number; sales: number };
};

export type Potential = {
  saleCpmCents: number | null; // preço médio de venda do milheiro no histórico
  costCpmCents: number; // custo médio atual do estoque = preço mínimo sem prejuízo
  profitPerMilCents: number | null;
  profitPerCpfCents: number | null; // lucro por emissão: lucro/milheiro × pontos por CPF do histórico
  ptsPerCpf: number | null;
  emissions: number | null; // emissões que o estoque (ou os CPFs) ainda permitem
  usedPoints: number;
  bottleneck: "PONTOS" | "CPFS" | null;
  profitCents: number | null;
  revenueCents: number | null;
  roePct: number | null;
  marginPct: number | null;
};

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

export function programPotential(i: PotentialInput): Potential {
  const costCpmCents = i.stockPoints > 0 ? Math.round((i.stockCostCents * 1000) / i.stockPoints) : 0;
  const saleCpm = i.hist.points > 0 && i.hist.pointsValueCents > 0 ? (i.hist.pointsValueCents * 1000) / i.hist.points : null;
  const ptsPerCpf = i.hist.cpfs > 0 ? i.hist.points / i.hist.cpfs : null;
  let usedPoints = i.stockPoints;
  let bottleneck: Potential["bottleneck"] = saleCpm == null ? null : "PONTOS";
  if (saleCpm != null && ptsPerCpf != null && i.cpfFree != null && i.cpfFree * ptsPerCpf < i.stockPoints) {
    usedPoints = Math.round(i.cpfFree * ptsPerCpf);
    bottleneck = "CPFS";
  }
  if (saleCpm == null) {
    return { saleCpmCents: null, costCpmCents, profitPerMilCents: null, profitPerCpfCents: null, ptsPerCpf: ptsPerCpf && Math.round(ptsPerCpf), emissions: null, usedPoints, bottleneck, profitCents: null, revenueCents: null, roePct: null, marginPct: null };
  }
  const revenueCents = Math.round((usedPoints * saleCpm) / 1000);
  const investedCents = Math.round((usedPoints * costCpmCents) / 1000);
  const profitCents = revenueCents - investedCents;
  return {
    saleCpmCents: Math.round(saleCpm),
    costCpmCents,
    profitPerMilCents: Math.round(saleCpm - costCpmCents),
    profitPerCpfCents: ptsPerCpf ? Math.round(((saleCpm - costCpmCents) * ptsPerCpf) / 1000) : null,
    ptsPerCpf: ptsPerCpf && Math.round(ptsPerCpf),
    emissions: ptsPerCpf ? Math.round((usedPoints / ptsPerCpf) * 10) / 10 : null, // 1 casa: 2,5 emissões não vira 3
    usedPoints,
    bottleneck,
    profitCents,
    revenueCents,
    roePct: pct(profitCents, investedCents),
    marginPct: pct(profitCents, revenueCents),
  };
}
