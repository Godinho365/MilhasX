// Espaço de cada conta: quantas milhas ela ainda consegue emitir com os CPFs livres, para não sobrar saldo
// "encalhado" (milhas sem CPF para usar). A média de milhas por emissão vem do histórico de vendas.

export const DEFAULT_PTS_PER_CPF = 30_000;

export type AccountLoad = { balance: number; reserved: number; cpfFree: number; ptsPerCpf: number };

/** Capacidade = CPFs livres × milhas por emissão; espaço = capacidade − saldo − milhas já reservadas.
 *  Espaço negativo = já há milhas demais para os CPFs que restam. */
export function accountSpace(a: AccountLoad) {
  const capacity = a.cpfFree * a.ptsPerCpf;
  const available = a.balance - a.reserved;
  return {
    capacity,
    space: capacity - available,
    emissionsLeft: a.ptsPerCpf > 0 ? Math.round((Math.max(0, available) / a.ptsPerCpf) * 10) / 10 : 0,
  };
}

/** Sobras: saldo livre que não paga nem uma emissão média (emissões < 1); o custo é o dessas milhas
 *  pelo custo médio da conta. Sem saldo livre não há sobra. */
export function accountLeftover(a: AccountLoad, emissionsLeft: number, costCpmCents: number | null) {
  const available = a.balance - a.reserved;
  if (available <= 0 || emissionsLeft >= 1) return null;
  return { points: available, costCents: costCpmCents == null ? null : Math.round((available * costCpmCents) / 1000) };
}

/** Sobra depois de uma emissão: o que fica na conta e não paga outra emissão média, com o custo dessas
 *  milhas pelo custo médio da conta. */
export function leftoverAfter(balanceAfter: number, ptsPerCpf: number, costCpmCents: number | null) {
  if (balanceAfter <= 0 || balanceAfter >= ptsPerCpf) return null;
  return { points: balanceAfter, costCents: costCpmCents == null ? null : Math.round((balanceAfter * costCpmCents) / 1000) };
}

/** Quanto a conta ainda fatura e lucra se usar todos os CPFs livres (capacidade) pelo preço médio de venda;
 *  o custo é o médio atual da conta (as milhas que ainda vão entrar podem custar diferente). */
export function capacityPotential(capacity: number, saleCpmCents: number | null, costCpmCents: number | null) {
  if (saleCpmCents == null || capacity <= 0) return { revenueCents: null, profitCents: null };
  const revenueCents = Math.round((capacity * saleCpmCents) / 1000);
  return { revenueCents, profitCents: costCpmCents == null ? null : revenueCents - Math.round((capacity * costCpmCents) / 1000) };
}

/** Até quantos pontos de origem transferir para caber no espaço (paridade e bônus aplicados). */
export function maxTransferForSpace(space: number, parityFrom: number, parityTo: number, bonusPct: number) {
  const perPoint = (parityTo / parityFrom) * (1 + bonusPct / 100);
  return space > 0 && perPoint > 0 ? Math.floor(space / perPoint) : 0;
}

export type EmissionFit = {
  enough: boolean; // saldo livre cobre a emissão
  newCpfs: number; // CPFs novos que a emissão ocupa (passageiro que já é beneficiário não conta)
  balanceAfter: number;
  cpfAfter: number;
  excessAfter: number; // milhas além do que os CPFs restantes conseguem emitir (> 0 = encalhe)
  cpfShort: boolean; // não há CPFs livres para os passageiros novos
};

export function emissionFit(a: AccountLoad, points: number, newCpfs: number): EmissionFit {
  const available = a.balance - a.reserved;
  const balanceAfter = available - points;
  const cpfAfter = a.cpfFree - newCpfs;
  return {
    enough: balanceAfter >= 0,
    newCpfs,
    balanceAfter,
    cpfAfter,
    excessAfter: balanceAfter - Math.max(0, cpfAfter) * a.ptsPerCpf,
    cpfShort: cpfAfter < 0,
  };
}

/** Ordem de sugestão: dá para emitir (saldo e CPFs) primeiro; depois a que gasta menos CPFs novos;
 *  então, emissão "pesada" (mais milhas que a média por CPF) vai para a conta com milhas sobrando e a
 *  "leve" para a conta com CPFs sobrando, para nenhuma ficar com milhas presas. */
export function rankForEmission<T extends { fit: EmissionFit; load: AccountLoad }>(list: T[], points: number, cpfsNeeded: number) {
  const heavy = cpfsNeeded > 0 ? points / cpfsNeeded >= (list[0]?.load.ptsPerCpf ?? DEFAULT_PTS_PER_CPF) : true;
  const excessNow = (x: T) => x.load.balance - x.load.reserved - x.load.cpfFree * x.load.ptsPerCpf;
  return [...list].sort((a, b) => {
    const okA = a.fit.enough && !a.fit.cpfShort, okB = b.fit.enough && !b.fit.cpfShort;
    if (okA !== okB) return okA ? -1 : 1;
    if (a.fit.newCpfs !== b.fit.newCpfs) return a.fit.newCpfs - b.fit.newCpfs;
    return heavy ? excessNow(b) - excessNow(a) : excessNow(a) - excessNow(b);
  });
}
