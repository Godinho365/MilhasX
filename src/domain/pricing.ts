// Milheiro sugerido na negociação (CRM Milhas): a partir do custo médio da conta, o preço que dá cada ROE
// (lucro ÷ custo dos pontos), além do mínimo sem prejuízo e da sua média de venda.

export const roeOf = (saleCpmCents: number, costCpmCents: number) =>
  costCpmCents > 0 ? Math.round(((saleCpmCents - costCpmCents) / costCpmCents) * 1000) / 10 : null;

/** Milheiro que dá o ROE pedido sobre o custo: custo × (1 + ROE). */
export const priceForRoe = (costCpmCents: number, roePct: number) => Math.round(costCpmCents * (1 + roePct / 100));

export type PriceOption = { key: string; label: string; cpmCents: number; roePct: number | null; profitCents: number; profitPerCpfCents: number | null };

export function priceOptions(i: { costCpmCents: number; avgSaleCpmCents: number | null; points: number; cpfs: number; roeTargets?: number[] }): PriceOption[] {
  const opt = (key: string, label: string, cpm: number): PriceOption => {
    const profitCents = Math.round(((cpm - i.costCpmCents) * i.points) / 1000);
    return { key, label, cpmCents: cpm, roePct: roeOf(cpm, i.costCpmCents), profitCents, profitPerCpfCents: i.cpfs > 0 ? Math.round(profitCents / i.cpfs) : null };
  };
  const list = [opt("zero", "Sem prejuízo", i.costCpmCents)];
  if (i.avgSaleCpmCents) list.push(opt("avg", "Sua média", i.avgSaleCpmCents));
  for (const r of i.roeTargets ?? [10, 15, 20]) list.push(opt(`roe${r}`, `ROE ${r}%`, priceForRoe(i.costCpmCents, r)));
  return list.sort((a, b) => a.cpmCents - b.cpmCents);
}
