// Espaço das contas (milhas × CPFs livres) e sugestão de conta para emitir uma negociação do CRM Milhas.
import { prisma, DomainError } from "../db";
import { beneficiaryUsage } from "./accounts";
import { saleCpfs } from "./sales";
import { DEFAULT_PTS_PER_CPF, accountSpace, capacityPotential, emissionFit, rankForEmission } from "@/domain/capacity";

const OPEN_STAGES = ["NEW", "NEGOTIATION", "AWAITING", "ISSUED"] as const;

/** Milhas por emissão (CPF) nas vendas com pontos dos últimos 12 meses; sem vendas, 30 mil. */
export async function emissionAverage(userId: string, now = new Date()) {
  const since = new Date(now.getTime() - 365 * 86_400_000);
  const items = await prisma.saleItem.findMany({
    where: { issuedWith: "POINTS", sale: { userId, occurredAt: { gte: since } } },
    select: { kind: true, issuedWith: true, points: true, salePriceCents: true, passengers: true, customers: { select: { id: true } } },
  });
  const cpfs = items.reduce((t, i) => t + saleCpfs([i]), 0);
  const points = items.filter((i) => saleCpfs([i]) > 0).reduce((t, i) => t + i.points, 0);
  // preço médio do milheiro vendido (valor dos pontos ÷ pontos), para o potencial de faturamento
  const soldPts = items.reduce((t, i) => t + i.points, 0);
  const soldCents = items.reduce((t, i) => t + i.salePriceCents, 0);
  return {
    ptsPerCpf: cpfs > 0 ? Math.round(points / cpfs) : DEFAULT_PTS_PER_CPF,
    sample: cpfs,
    fromHistory: cpfs > 0,
    saleCpmCents: soldPts > 0 ? Math.round((soldCents * 1000) / soldPts) : null,
  };
}

/** Contas com limite de CPFs: saldo, reservado em negociações abertas, CPFs livres, capacidade e espaço. */
export async function accountsCapacity(userId: string, opts: { exceptDealId?: string } = {}) {
  const [usage, avg, accounts, deals] = await Promise.all([
    beneficiaryUsage(userId),
    emissionAverage(userId),
    prisma.account.findMany({ where: { userId, archived: false }, select: { id: true, balance: true, costCents: true, nickname: true, holderId: true, program: { select: { name: true, code: true } }, holder: { select: { name: true } } } }),
    prisma.milesDeal.findMany({ where: { userId, archivedAt: null, saleId: null, stage: { in: [...OPEN_STAGES] }, accountId: { not: null }, NOT: opts.exceptDealId ? { id: opts.exceptDealId } : undefined }, select: { accountId: true, points: true } }),
  ]);
  const reservedBy = new Map<string, number>();
  for (const d of deals) reservedBy.set(d.accountId!, (reservedBy.get(d.accountId!) ?? 0) + (d.points ?? 0));
  const rows = accounts
    .filter((a) => usage[a.id]?.limit != null)
    .map((a) => {
      const u = usage[a.id]!;
      const load = { balance: a.balance, reserved: reservedBy.get(a.id) ?? 0, cpfFree: Math.max(0, (u.limit ?? 0) - u.used), ptsPerCpf: avg.ptsPerCpf };
      const space = accountSpace(load);
      const costCpmCents = a.balance > 0 && a.costCents > 0 ? Math.round((a.costCents * 1000) / a.balance) : null;
      return { id: a.id, label: a.nickname || `${a.program.name} ${a.holder.name}`, holderId: a.holderId, program: a.program.name, programCode: a.program.code, holder: a.holder.name, cpfUsed: u.used, cpfLimit: u.limit!, load, ...space, costCpmCents, ...capacityPotential(space.capacity, avg.saleCpmCents, costCpmCents) };
    })
    .sort((a, b) => a.program.localeCompare(b.program) || a.holder.localeCompare(b.holder));
  return { avg, rows };
}

/** Para a negociação: em cada conta, quantos CPFs novos a emissão ocupa (passageiro que já é beneficiário
 *  na janela não conta), como fica o saldo e se sobra milha sem CPF. Em ordem de sugestão. */
export async function dealAccountFit(userId: string, dealId: string) {
  const d = await prisma.milesDeal.findFirst({ where: { id: dealId, userId } });
  if (!d) throw new DomainError(404, "Negociação não encontrada");
  const points = d.points ?? 0;
  const pax = (Array.isArray(d.passengersData) ? d.passengersData : []) as { name: string; cpf?: string }[];
  const named = pax.map((p) => (p.cpf ?? "").replace(/\D/g, "")).filter(Boolean);
  const cpfsNeeded = Math.max(d.passengers ?? 0, pax.length, 1);
  const all = await accountsCapacity(userId, { exceptDealId: d.id });
  const avg = all.avg;
  // só contas do programa da emissão: o da conta já escolhida ou o do link do pedido
  const chosen = d.accountId ? all.rows.find((r) => r.id === d.accountId)?.programCode : null;
  const host = d.orderLink?.match(/latamairlines|smiles|voeazul|tudoazul/i)?.[0].toLowerCase();
  const code = chosen ?? (host === "latamairlines" ? "LATAM" : host === "smiles" ? "SMILES" : host ? "AZUL" : null);
  const rows = code ? all.rows.filter((r) => r.programCode === code) : all.rows;
  const since = new Date(Date.now() - 365 * 86_400_000);
  const known = await prisma.accountBeneficiary.findMany({ where: { userId, accountId: { in: rows.map((r) => r.id) }, usedAt: { gte: since }, document: { in: named.length ? named : ["-"] } }, select: { accountId: true, document: true } });
  const list = rows.map((r) => {
    const already = named.filter((cpf) => known.some((k) => k.accountId === r.id && k.document === cpf));
    const fit = emissionFit(r.load, points, cpfsNeeded - already.length);
    return { ...r, already: already.length, fit };
  });
  return { avg, points, cpfsNeeded, accounts: rankForEmission(list, points, cpfsNeeded) };
}
