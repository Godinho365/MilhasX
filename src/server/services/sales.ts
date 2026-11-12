// Vendas de emissão: venda com itens (passagem, bagagem, assento, hospedagem, carro, outro),
// origem dos pontos (minha conta ou fornecedor), custos repassados, clientes e anexos.
import { randomUUID } from "node:crypto";
import { ANONYMOUS } from "@/domain/beneficiaries";
import { brDay } from "@/domain/brasilia";
import { partnerCommission } from "@/domain/team";
import type { Prisma } from "@prisma/client";
import { prisma, DomainError } from "../db";
import { assertFeature } from "./plan-limits";
import { withLedger, ownAccount } from "./ledger";
import { detectAttachment } from "./holder-files";

export const SALE_ITEM_KINDS = ["FLIGHT", "BAGGAGE", "SEAT", "HOTEL", "CAR", "OTHER"] as const;
export type SaleItemKind = (typeof SALE_ITEM_KINDS)[number];
export const SALE_ITEM_LABELS: Record<SaleItemKind, string> = {
  FLIGHT: "Passagem aérea",
  BAGGAGE: "Bagagem",
  SEAT: "Assento",
  HOTEL: "Hospedagem",
  CAR: "Aluguel de carro",
  OTHER: "Outro",
};
export const SALE_COST_TYPES = ["TAXA_EMBARQUE", "IOF", "BAGAGEM", "ASSENTO", "COMPLETAR_PONTOS", "OUTROS"] as const;
export const SALE_COST_LABELS: Record<(typeof SALE_COST_TYPES)[number], string> = {
  TAXA_EMBARQUE: "Taxa de embarque",
  IOF: "IOF",
  BAGAGEM: "Bagagem",
  ASSENTO: "Assento",
  COMPLETAR_PONTOS: "Completar pontos",
  OUTROS: "Outros",
};

export type SaleCost = { type: (typeof SALE_COST_TYPES)[number]; amountCents: number; cardId?: string | null };
export type SaleItemInput = {
  kind: SaleItemKind;
  issuedWith: "POINTS" | "CASH";
  points: number;
  salePriceCents: number;
  cashCostCents?: number;
  costs?: SaleCost[];
  clientType: "FINAL" | "AGENCY";
  customerIds?: string[];
  passengers?: number | null;
  reservation?: string | null;
  origin?: string | null;
  destination?: string | null;
  departureDate?: Date | null;
  returnDate?: Date | null;
  description?: string | null;
  observation?: string | null;
};
export type SaleInput = {
  origin: "OWN" | "SUPPLIER";
  accountId?: string | null;
  supplierAccountId?: string | null;
  occurredAt: Date;
  items: SaleItemInput[];
  idempotencyKey?: string | null;
};

const sumCosts = (costs: unknown) => (Array.isArray(costs) ? (costs as SaleCost[]).reduce((t, c) => t + (c.amountCents ?? 0), 0) : 0);

/** Resumo legível do item para listas e lançamentos ("Passagem aérea GRU → LIS"). */
export function itemSummary(i: { kind: string; origin?: string | null; destination?: string | null; description?: string | null }) {
  const label = SALE_ITEM_LABELS[i.kind as SaleItemKind] ?? "Item";
  if (i.description) return i.description;
  if (i.origin && i.destination) return `${label} ${i.origin} → ${i.destination}`;
  if (i.origin || i.destination) return `${label} ${i.origin ?? i.destination}`;
  return label;
}

type ItemForMath = { issuedWith: string; points: number; salePriceCents: number; cashCostCents: number; supplierCpmCents: number | null; costs: unknown; entry?: { costCents: number } | null };

/**
 * Números do item: o cliente paga o valor dos pontos + os custos repassados; o custo é o dos pontos
 * (custo médio que saiu da conta ou preço do fornecedor) + custos + o que foi pago em dinheiro.
 * Resultado = valor dos pontos − custo dos pontos − valor pago em dinheiro (os repassados se anulam).
 */
export function itemFinancials(i: ItemForMath, origin: string) {
  const pointsCostCents = i.issuedWith !== "POINTS" ? 0 : origin === "SUPPLIER" ? Math.round((i.points * (i.supplierCpmCents ?? 0)) / 1000) : Math.abs(i.entry?.costCents ?? 0);
  const passCents = sumCosts(i.costs);
  return {
    pointsCostCents,
    totalCents: i.salePriceCents + passCents,
    costCents: pointsCostCents + passCents + i.cashCostCents,
    resultCents: i.salePriceCents - pointsCostCents - i.cashCostCents,
  };
}

export function saleFinancials(s: { origin: string; items: ItemForMath[] }) {
  const parts = s.items.map((i) => itemFinancials(i, s.origin));
  const totalCents = parts.reduce((t, p) => t + p.totalCents, 0);
  const costCents = parts.reduce((t, p) => t + p.costCents, 0);
  const resultCents = parts.reduce((t, p) => t + p.resultCents, 0);
  const priced = s.items.reduce((t, i) => t + i.salePriceCents, 0);
  // Valor cobrado só pelos pontos (sem taxa de embarque e outros custos repassados): base do preço por milheiro
  const pointsValueCents = s.items.filter((i) => i.issuedWith === "POINTS").reduce((t, i) => t + i.salePriceCents, 0);
  // ROE: resultado sobre o que foi investido na emissão (custo dos pontos ou valor pago); custos repassados ficam de fora
  const investedCents = parts.reduce((t, p, k) => t + p.pointsCostCents + s.items[k].cashCostCents, 0);
  const milesCostCents = parts.reduce((t, p) => t + p.pointsCostCents, 0); // só o custo dos pontos usados
  return { totalCents, costCents, resultCents, pricedCents: priced, pointsValueCents, investedCents, milesCostCents, marginPct: priced > 0 ? Math.round((resultCents / priced) * 1000) / 10 : null, roePct: pct(resultCents, investedCents) };
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/** CPFs emitidos com pontos: os passageiros das passagens (sem o número, os clientes do item, ou 1) e de
 *  outros itens que informam passageiros, como a venda de milhas do CRM Milhas (uma emissão para o comprador). */
export function saleCpfs(items: { kind: string; issuedWith: string; passengers: number | null; customers: unknown[] }[]) {
  return items
    .filter((i) => i.issuedWith === "POINTS")
    .reduce((t, i) => t + (i.kind === "FLIGHT" ? (i.passengers ?? Math.max(1, i.customers.length)) : (i.passengers ?? 0)), 0);
}

function validate(input: SaleInput) {
  if (!input.items.length || input.items.length > 20) throw new DomainError(400, "A venda precisa ter entre 1 e 20 itens");
  if (input.origin === "OWN" && !input.accountId) throw new DomainError(400, "Selecione o programa");
  if (input.origin === "SUPPLIER" && !input.supplierAccountId) throw new DomainError(400, "Selecione a conta do fornecedor");
  input.items.forEach((it, n) => {
    const where = input.items.length > 1 ? ` (item ${n + 1})` : "";
    if (it.issuedWith === "POINTS" && (!Number.isInteger(it.points) || it.points <= 0)) throw new DomainError(400, `Informe os pontos da emissão${where}`);
    if (it.issuedWith === "CASH" && (it.cashCostCents ?? 0) < 0) throw new DomainError(400, `Valor pago inválido${where}`);
    if (it.salePriceCents < 0) throw new DomainError(400, `Valor da venda inválido${where}`);
    if (it.kind === "FLIGHT" && (!it.passengers || it.passengers < 1)) throw new DomainError(400, `Informe a quantidade de passageiros${where}`);
    if (it.departureDate && it.returnDate && it.returnDate < it.departureDate) throw new DomainError(400, `A volta precisa ser depois da ida${where}`);
  });
}

type Tx = Prisma.TransactionClient;

/** Confere clientes, cartões e a origem dos pontos; no fornecedor, já desconta o saldo dele. */
async function resolveOrigin(tx: Tx, userId: string, input: SaleInput) {
  const customerIds = [...new Set(input.items.flatMap((i) => i.customerIds ?? []))];
  const cardIds = [...new Set(input.items.flatMap((i) => (i.costs ?? []).map((c) => c.cardId)).filter((x): x is string => !!x))];
  const totalPoints = input.items.reduce((t, i) => t + (i.issuedWith === "POINTS" ? i.points : 0), 0);
  if (customerIds.length && (await tx.customer.count({ where: { id: { in: customerIds }, userId } })) !== customerIds.length) throw new DomainError(404, "Cliente não encontrado");
  if (cardIds.length && (await tx.creditCard.count({ where: { id: { in: cardIds }, userId } })) !== cardIds.length) throw new DomainError(404, "Cartão não encontrado");
  let accountId: string | null = null;
  let supplierCpm: number | null = null;
  if (input.origin === "OWN") {
    accountId = (await ownAccount(tx, userId, input.accountId!)).id;
  } else {
    const sa = await tx.supplierAccount.findFirst({ where: { id: input.supplierAccountId!, userId }, include: { supplier: true, program: true } });
    if (!sa) throw new DomainError(404, "Conta de fornecedor não encontrada");
    if (sa.balance < totalPoints) throw new DomainError(422, `Saldo insuficiente no fornecedor (${sa.balance.toLocaleString("pt-BR")} pontos)`);
    supplierCpm = sa.priceCpmCents;
    if (totalPoints) await tx.supplierAccount.update({ where: { id: sa.id }, data: { balance: { decrement: totalPoints } } });
  }
  return {
    accountId,
    supplierCpm,
    customerId: customerIds[0] ?? null,
    points: totalPoints,
    totalCents: input.items.reduce((t, i) => t + i.salePriceCents + sumCosts(i.costs), 0),
  };
}

/** Itens da venda: cada item emitido com pontos próprios sai da conta como um lançamento "Venda". */
async function writeItems(tx: Tx, userId: string, sale: { id: string; groupId: string | null }, input: SaleInput, accountId: string | null, supplierCpm: number | null, createdAt?: Date) {
  for (const [n, it] of input.items.entries()) {
    let entryId: string | null = null;
    if (input.origin === "OWN" && it.issuedWith === "POINTS") {
      const e = await tx.entry.create({
        data: {
          userId,
          accountId: accountId!,
          type: "SALE",
          points: -it.points,
          occurredAt: input.occurredAt,
          description: `Venda · ${itemSummary(it)}${it.reservation ? ` · ${it.reservation}` : ""}`,
          groupId: sale.groupId,
          createdAt, // na edição, mantém a ordem original no extrato (e o custo que sai da conta)
        },
      });
      entryId = e.id;
    }
    await tx.saleItem.create({
      data: {
        saleId: sale.id,
        position: n,
        kind: it.kind,
        issuedWith: it.issuedWith,
        points: it.issuedWith === "POINTS" ? it.points : 0,
        salePriceCents: it.salePriceCents,
        cashCostCents: it.issuedWith === "CASH" ? (it.cashCostCents ?? 0) : 0,
        supplierCpmCents: it.issuedWith === "POINTS" ? supplierCpm : null,
        costs: (it.costs ?? []) as unknown as Prisma.InputJsonValue,
        clientType: it.clientType,
        customers: it.customerIds?.length ? { connect: it.customerIds.map((id) => ({ id })) } : undefined,
        passengers: it.passengers ?? null,
        reservation: it.reservation?.trim() || null,
        origin: it.origin || null,
        destination: it.destination || null,
        departureDate: it.departureDate ?? null,
        returnDate: it.returnDate ?? null,
        description: it.description?.trim() || null,
        observation: it.observation?.trim() || null,
        entryId,
      },
    });
  }
  // Beneficiários: os clientes dos itens emitidos com pontos próprios contam no limite de CPFs da conta;
  // passageiros sem cliente nomeado entram como "Anônimo" (cada um ocupa uma vaga)
  if (input.origin === "OWN") {
    const emitted = input.items.filter((i) => i.issuedWith === "POINTS");
    const ids = [...new Set(emitted.flatMap((i) => i.customerIds ?? []))];
    const cs = ids.length ? await tx.customer.findMany({ where: { id: { in: ids }, userId }, select: { name: true, docNumber: true } }) : [];
    const anonymous = emitted.reduce((t, i) => {
      const pax = i.kind === "FLIGHT" ? (i.passengers ?? Math.max(1, i.customerIds?.length ?? 0)) : (i.passengers ?? 0);
      return t + Math.max(0, pax - (i.customerIds?.length ?? 0));
    }, 0);
    const rows = [
      ...cs.map((c) => ({ name: c.name, document: c.docNumber?.replace(/\D/g, "") || null })),
      ...Array.from({ length: anonymous }, () => ({ name: ANONYMOUS, document: null })),
    ];
    if (rows.length) await tx.accountBeneficiary.createMany({ data: rows.map((r) => ({ userId, accountId: accountId!, saleId: sale.id, ...r, usedAt: input.occurredAt })) });
  }
}

export async function createSale(userId: string, input: SaleInput) {
  validate(input);
  if (input.origin === "SUPPLIER") await assertFeature(userId, "suppliers");
  const groupId = input.idempotencyKey ? `sale:${userId}:${input.idempotencyKey}` : `sale:${randomUUID()}`;
  const existing = await prisma.sale.findUnique({ where: { groupId } });
  if (existing) return { sale: existing, duplicated: true };
  const sale = await withLedger(userId, async (tx) => {
    const o = await resolveOrigin(tx, userId, input);
    const created = await tx.sale.create({
      data: {
        userId,
        origin: input.origin,
        accountId: o.accountId,
        supplierAccountId: input.origin === "SUPPLIER" ? input.supplierAccountId! : null,
        customerId: o.customerId,
        groupId,
        points: o.points,
        totalCents: o.totalCents,
        occurredAt: input.occurredAt,
      },
    });
    await writeItems(tx, userId, created, input, o.accountId, o.supplierCpm);
    return created;
  });
  return { sale, duplicated: false };
}

/** Edita a venda inteira: desfaz os lançamentos, o saldo do fornecedor e os beneficiários dela e grava de novo.
 *  A venda (id e anexos) continua a mesma; tudo numa transação só, então ou muda tudo ou nada. */
export async function updateSale(userId: string, id: string, input: SaleInput) {
  const sale = await updateSaleRows(userId, id, input);
  if (sale.partnerId) await refreshPartnerCommission(userId, sale.id);
  return sale;
}

async function updateSaleRows(userId: string, id: string, input: SaleInput) {
  validate(input);
  if (input.origin === "SUPPLIER") await assertFeature(userId, "suppliers");
  return withLedger(userId, async (tx) => {
    const old = await tx.sale.findFirst({ where: { id, userId } });
    if (!old) throw new DomainError(404, "Venda não encontrada");
    if (old.refundedAt) throw new DomainError(409, "Venda reembolsada: desfaça o reembolso para editar");
    const groupId = old.groupId ?? `sale:${randomUUID()}`;
    const first = old.groupId ? await tx.entry.findFirst({ where: { userId, groupId: old.groupId }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }) : null;
    if (old.groupId) await tx.entry.deleteMany({ where: { userId, groupId: old.groupId } });
    if (old.origin === "SUPPLIER" && old.supplierAccountId && old.points) {
      await tx.supplierAccount.updateMany({ where: { id: old.supplierAccountId, userId }, data: { balance: { increment: old.points } } });
    }
    await tx.accountBeneficiary.deleteMany({ where: { saleId: old.id, userId } });
    await tx.saleItem.deleteMany({ where: { saleId: old.id } });
    const o = await resolveOrigin(tx, userId, input);
    const sale = await tx.sale.update({
      where: { id: old.id },
      data: {
        origin: input.origin,
        accountId: o.accountId,
        supplierAccountId: input.origin === "SUPPLIER" ? input.supplierAccountId! : null,
        customerId: o.customerId,
        groupId,
        points: o.points,
        totalCents: o.totalCents,
        occurredAt: input.occurredAt,
      },
    });
    await writeItems(tx, userId, sale, input, o.accountId, o.supplierCpm, first?.createdAt);
    return sale;
  });
}

const saleInclude = {
  account: { include: { program: { select: { name: true, color: true } }, holder: { select: { name: true } } } },
  supplierAccount: { include: { program: { select: { name: true, color: true } }, supplier: { select: { name: true } } } },
  items: { include: { entry: { select: { costCents: true } }, customers: { select: { id: true, name: true } } }, orderBy: { position: "asc" as const } },
  _count: { select: { attachments: true } },
  partner: { select: { id: true, name: true } },
  finAccount: { select: { name: true } },
} satisfies Prisma.SaleInclude;

type SaleRow = Prisma.SaleGetPayload<{ include: typeof saleInclude }>;

/**
 * Venda reembolsada: as milhas voltam para a conta e a taxa de embarque e os outros repasses voltam para o
 * cliente, então nada disso entra no faturamento. Fica só a taxa de administração, que é toda lucro.
 */
export function refundedFinancials(feeCents: number) {
  return { totalCents: feeCents, costCents: 0, resultCents: feeCents, pricedCents: feeCents, pointsValueCents: 0, investedCents: 0, milesCostCents: 0, marginPct: feeCents > 0 ? 100 : null, roePct: null };
}

export const REFUND_WINDOW_MS = 24 * 3_600_000;
const BR_OFFSET_MS = 3 * 3_600_000; // meia-noite em Brasília = 03:00 UTC (sem horário de verão)

/**
 * Até quando dá para reembolsar: 24 horas depois da emissão. A venda do CRM Milhas guarda o horário; a
 * lançada à mão só tem o dia, então vale a hora em que foi registrada (se foi no mesmo dia) ou o início do
 * dia em Brasília (o prazo acaba no fim do dia da venda).
 */
export function refundDeadline(s: { occurredAt: Date; createdAt: Date }) {
  const dateOnly = s.occurredAt.getTime() % 86_400_000 === 0;
  const issuedAt = !dateOnly ? s.occurredAt : brDay(s.createdAt) === s.occurredAt.toISOString().slice(0, 10) ? s.createdAt : new Date(s.occurredAt.getTime() + BR_OFFSET_MS);
  return new Date(issuedAt.getTime() + REFUND_WINDOW_MS);
}

function present(s: SaleRow) {
  const sold = saleFinancials(s);
  const refunded = !!s.refundedAt;
  const f = refunded ? refundedFinancials(s.refundFeeCents) : sold;
  const commission = refunded || !s.partnerId ? 0 : s.partnerCommissionCents;
  const own = s.origin === "OWN";
  return {
    id: s.id,
    date: s.occurredAt.toISOString(),
    origin: s.origin,
    accountId: s.accountId,
    supplierAccountId: s.supplierAccountId,
    program: own ? (s.account ? `${s.account.program.name} ${s.account.holder.name}` : "Conta excluída") : s.supplierAccount ? `${s.supplierAccount.program.name} · ${s.supplierAccount.supplier.name}` : "Fornecedor excluído",
    color: (own ? s.account?.program.color : s.supplierAccount?.program.color) ?? "#60a5fa",
    programName: (own ? s.account?.program.name : s.supplierAccount?.program.name) ?? "Programa excluído",
    description: s.items.map(itemSummary).join(" + "),
    customers: [...new Map(s.items.flatMap((i) => i.customers).map((c) => [c.id, c.name])).values()],
    reservations: [...new Set(s.items.map((i) => i.reservation?.trim()).filter((r): r is string => !!r))],
    paidAt: s.paidAt?.toISOString() ?? null,
    finAccountId: s.finAccountId, // conta do Financeiro em que o pagamento entrou
    finAccount: s.finAccount?.name ?? null,
    tags: s.tags,
    // reembolsada: as milhas voltaram, então não contam como vendidas (os números da venda ficam em refund);
    // os CPFs continuam gastos na conta e são a base da taxa de administração
    points: refunded ? 0 : s.points,
    cpfs: saleCpfs(s.items),
    ...f,
    // comissão do parceiro (guardada quando o parceiro foi escolhido ou a venda editada) sai do lucro
    ...(commission ? { resultCents: f.resultCents - commission, marginPct: pct(f.resultCents - commission, f.pricedCents), roePct: pct(f.resultCents - commission, f.investedCents) } : {}),
    partner: s.partner ? { id: s.partner.id, name: s.partner.name, commissionCents: commission } : null,
    issuerIds: s.issuerIds, // quem emitiu (Equipe); vários = resultado rateado em partes iguais
    refundUntil: refunded ? null : refundDeadline(s).toISOString(),
    refund: refunded
      ? {
          date: s.refundedAt!.toISOString(),
          feeCents: s.refundFeeCents,
          points: s.points,
          totalCents: sold.totalCents,
          resultCents: sold.resultCents,
          taxCents: s.items.reduce((t, i) => t + sumCosts(i.costs), 0), // taxa de embarque e repasses que a companhia estorna
          milesReceivedAt: s.refundMilesReceivedAt?.toISOString() ?? null,
          taxReceivedAt: s.refundTaxReceivedAt?.toISOString() ?? null,
        }
      : null,
    attachments: s._count.attachments,
    items: s.items.map((i) => ({
      id: i.id,
      kind: i.kind,
      label: SALE_ITEM_LABELS[i.kind as SaleItemKind] ?? i.kind,
      issuedWith: i.issuedWith,
      points: i.points,
      salePriceCents: i.salePriceCents,
      cashCostCents: i.cashCostCents,
      costs: (Array.isArray(i.costs) ? i.costs : []) as SaleCost[],
      clientType: i.clientType,
      customers: i.customers.map((c) => c.name),
      customerIds: i.customers.map((c) => c.id),
      passengers: i.passengers,
      reservation: i.reservation,
      origin: i.origin,
      destination: i.destination,
      departureDate: i.departureDate?.toISOString() ?? null,
      returnDate: i.returnDate?.toISOString() ?? null,
      description: i.description,
      observation: i.observation,
      ...itemFinancials(i, s.origin),
    })),
  };
}
export type SaleView = ReturnType<typeof present>;

export type SaleFilter = { q?: string; from?: Date; to?: Date; programId?: string; customerId?: string; pago?: "sim" | "nao"; tag?: string; sort?: "occurredAt" | "points" | "totalCents"; order?: "asc" | "desc"; holderId?: string; accountId?: string };

/** Dia da venda (AAAA-MM-DD): a venda só com data fica à meia-noite UTC; a do CRM tem hora e vale o dia em Brasília. */
export const saleDay = (at: Date) => (at.getTime() % 86_400_000 === 0 ? at.toISOString().slice(0, 10) : brDay(at));

/** Filtro por dia: from e to são dias inteiros (to inclui o dia todo, até 23:59 em Brasília). */
export async function listSales(userId: string, f: SaleFilter = {}) {
  const fromDay = f.from?.toISOString().slice(0, 10);
  const toDay = f.to?.toISOString().slice(0, 10);
  const where: Prisma.SaleWhereInput = {
    userId,
    accountId: f.accountId,
    // janela um pouco maior no banco; o corte exato pelo dia da venda é feito abaixo
    occurredAt: f.from || f.to ? { gte: f.from && new Date(`${fromDay}T00:00:00Z`), lt: f.to && new Date(new Date(`${toDay}T00:00:00Z`).getTime() + 86_400_000 + BR_OFFSET_MS) } : undefined,
    items: f.customerId ? { some: { customers: { some: { id: f.customerId } } } } : undefined,
    paidAt: f.pago === "sim" ? { not: null } : f.pago === "nao" ? null : undefined,
    tags: f.tag ? { has: f.tag } : undefined,
    OR: f.programId || f.holderId
      ? [
          { account: { programId: f.programId, holderId: f.holderId } },
          ...(f.holderId ? [] : [{ supplierAccount: { programId: f.programId } }]),
        ]
      : undefined,
    AND: f.q
      ? [{ OR: [
          { items: { some: { OR: [{ description: { contains: f.q, mode: "insensitive" } }, { reservation: { contains: f.q, mode: "insensitive" } }, { origin: { contains: f.q, mode: "insensitive" } }, { destination: { contains: f.q, mode: "insensitive" } }] } } },
          { items: { some: { customers: { some: { name: { contains: f.q, mode: "insensitive" } } } } } },
        ] }]
      : undefined,
  };
  const rows = await prisma.sale.findMany({ where, include: saleInclude, orderBy: [{ [f.sort ?? "occurredAt"]: f.order ?? "desc" }, { createdAt: "desc" }], take: 500 });
  return rows.filter((r) => (!fromDay || saleDay(r.occurredAt) >= fromDay) && (!toDay || saleDay(r.occurredAt) <= toDay)).map(present);
}

export async function getSale(userId: string, id: string) {
  const s = await prisma.sale.findFirst({ where: { id, userId }, include: saleInclude });
  if (!s) throw new DomainError(404, "Venda não encontrada");
  return present(s);
}

/** Exclui a venda: os lançamentos "Venda" voltam os pontos à conta; o saldo do fornecedor é devolvido. */
export async function deleteSale(userId: string, id: string) {
  return withLedger(userId, async (tx) => {
    const s = await tx.sale.findFirst({ where: { id, userId } });
    if (!s) throw new DomainError(404, "Venda não encontrada");
    if (s.groupId) await tx.entry.deleteMany({ where: { userId, groupId: s.groupId } });
    // reembolsada com as milhas já estornadas: o saldo do fornecedor já voltou
    if (s.origin === "SUPPLIER" && s.supplierAccountId && s.points && !s.refundMilesReceivedAt) {
      await tx.supplierAccount.updateMany({ where: { id: s.supplierAccountId, userId }, data: { balance: { increment: s.points } } });
    }
    await tx.sale.delete({ where: { id: s.id } });
    return { ok: true };
  });
}

/* ---------------- Reembolso ---------------- */

/**
 * Reembolsa a venda. As milhas ficam bloqueadas esperando o estorno da companhia (lançamento "Reembolso de
 * venda" a receber); a taxa de embarque e os repasses também. Cada estorno é marcado depois (receiveRefund).
 * Os CPFs usados continuam usados. No faturamento fica só a taxa de administração cobrada do cliente.
 */
export async function refundSale(userId: string, id: string, input: { feeCents: number; date: Date }) {
  if (!Number.isInteger(input.feeCents) || input.feeCents < 0) throw new DomainError(400, "Taxa de administração inválida");
  return withLedger(userId, async (tx) => {
    const s = await tx.sale.findFirst({ where: { id, userId } });
    if (!s) throw new DomainError(404, "Venda não encontrada");
    if (s.refundedAt) throw new DomainError(409, "Essa venda já foi reembolsada");
    // o prazo de 24 h (cancelamento sem custo da LATAM) é só informativo (refundDeadline/refundUntil); dá para
    // registrar o reembolso de qualquer venda, inclusive as com mais de 24 h (a companhia pode cobrar ou negar)
    // compara só o dia: dá para reembolsar no mesmo dia (a venda do CRM Milhas guarda também o horário)
    const day = (d: Date) => d.toISOString().slice(0, 10);
    if (day(input.date) < day(s.occurredAt)) throw new DomainError(400, "O reembolso não pode ser antes da venda");
    const at = input.date < s.occurredAt ? s.occurredAt : input.date;
    const debits = s.groupId ? await tx.entry.findMany({ where: { userId, groupId: s.groupId, type: "SALE" } }) : [];
    for (const d of debits) {
      await tx.entry.create({
        data: { userId, accountId: d.accountId, type: "SALE_REFUND", status: "PENDING", points: -d.points, occurredAt: at, description: d.description.replace(/^Venda/, "Reembolso"), groupId: s.groupId },
      });
    }
    // sem taxa de embarque nem repasses não há estorno de taxa para esperar
    const items = await tx.saleItem.findMany({ where: { saleId: s.id }, select: { costs: true } });
    const hasTax = items.some((i) => sumCosts(i.costs) > 0);
    return tx.sale.update({ where: { id: s.id }, data: { refundedAt: at, refundFeeCents: input.feeCents, refundMilesReceivedAt: s.points ? null : at, refundTaxReceivedAt: hasTax ? null : at } });
  });
}

/** Desfaz o reembolso: as milhas saem de novo e a venda volta a contar no faturamento. */
export async function undoRefund(userId: string, id: string) {
  return withLedger(userId, async (tx) => {
    const s = await tx.sale.findFirst({ where: { id, userId } });
    if (!s) throw new DomainError(404, "Venda não encontrada");
    if (!s.refundedAt) throw new DomainError(409, "Essa venda não foi reembolsada");
    if (s.groupId) await tx.entry.deleteMany({ where: { userId, groupId: s.groupId, type: "SALE_REFUND" } });
    if (s.origin === "SUPPLIER" && s.supplierAccountId && s.points && s.refundMilesReceivedAt) {
      const sa = await tx.supplierAccount.findFirst({ where: { id: s.supplierAccountId, userId }, select: { balance: true } });
      if (sa && sa.balance < s.points) throw new DomainError(422, "O fornecedor não tem mais saldo para desfazer o reembolso");
      await tx.supplierAccount.updateMany({ where: { id: s.supplierAccountId, userId }, data: { balance: { decrement: s.points } } });
    }
    return tx.sale.update({ where: { id: s.id }, data: { refundedAt: null, refundFeeCents: 0, refundMilesReceivedAt: null, refundTaxReceivedAt: null } });
  });
}

/**
 * Estorno recebido da companhia. Milhas: o lançamento a receber é confirmado na data do estorno e entra no
 * saldo (no fornecedor, o saldo dele volta). Taxa: a taxa de embarque e os repasses voltaram para o cartão.
 */
export async function receiveRefund(userId: string, id: string, input: { kind: "miles" | "tax"; date: Date }) {
  return withLedger(userId, async (tx) => {
    const s = await tx.sale.findFirst({ where: { id, userId } });
    if (!s) throw new DomainError(404, "Venda não encontrada");
    if (!s.refundedAt) throw new DomainError(409, "Essa venda não foi reembolsada");
    if (input.date.toISOString().slice(0, 10) < s.refundedAt.toISOString().slice(0, 10)) throw new DomainError(400, "O estorno não pode ser antes do reembolso");
    const at = input.date < s.refundedAt ? s.refundedAt : input.date;
    if (input.kind === "tax") {
      if (s.refundTaxReceivedAt) throw new DomainError(409, "O estorno da taxa já foi marcado");
      return tx.sale.update({ where: { id: s.id }, data: { refundTaxReceivedAt: at } });
    }
    if (s.refundMilesReceivedAt) throw new DomainError(409, "O estorno das milhas já foi marcado");
    if (s.groupId) await tx.entry.updateMany({ where: { userId, groupId: s.groupId, type: "SALE_REFUND", status: "PENDING" }, data: { status: "CONFIRMED", occurredAt: at } });
    if (s.origin === "SUPPLIER" && s.supplierAccountId && s.points) {
      await tx.supplierAccount.updateMany({ where: { id: s.supplierAccountId, userId }, data: { balance: { increment: s.points } } });
    }
    return tx.sale.update({ where: { id: s.id }, data: { refundMilesReceivedAt: at } });
  });
}

/* ---------------- Anexos ---------------- */

export const SALE_MAX_FILES = 10;
export const SALE_MAX_TOTAL = 10 * 1024 * 1024;

async function ownSale(userId: string, saleId: string) {
  const s = await prisma.sale.findFirst({ where: { id: saleId, userId }, select: { id: true } });
  if (!s) throw new DomainError(404, "Venda não encontrada");
}

export async function listSaleAttachments(userId: string, saleId: string) {
  await ownSale(userId, saleId);
  return prisma.saleAttachment.findMany({ where: { saleId, userId }, select: { id: true, name: true, mime: true, size: true }, orderBy: { createdAt: "asc" } });
}

export async function addSaleAttachment(userId: string, saleId: string, name: string, buf: Buffer) {
  await ownSale(userId, saleId);
  if (buf.length === 0) throw new DomainError(400, "Arquivo vazio");
  const mime = detectAttachment(buf);
  if (!mime) throw new DomainError(415, "Envie PNG, JPEG, WEBP, HEIC ou PDF");
  const agg = await prisma.saleAttachment.aggregate({ where: { saleId }, _count: true, _sum: { size: true } });
  if (agg._count >= SALE_MAX_FILES) throw new DomainError(409, `No máximo ${SALE_MAX_FILES} arquivos por venda`);
  if ((agg._sum.size ?? 0) + buf.length > SALE_MAX_TOTAL) throw new DomainError(413, "Os anexos da venda passam de 10 MB");
  const clean = name.replace(/[\\/]/g, "_").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120) || "arquivo";
  return prisma.saleAttachment.create({ data: { saleId, userId, name: clean, mime, size: buf.length, data: new Uint8Array(buf) }, select: { id: true, name: true, mime: true, size: true } });
}

export async function getSaleAttachment(userId: string, saleId: string, id: string) {
  const a = await prisma.saleAttachment.findFirst({ where: { id, saleId, userId } });
  if (!a) throw new DomainError(404, "Anexo não encontrado");
  return { name: a.name, mime: a.mime, data: Buffer.from(a.data) };
}

export async function deleteSaleAttachment(userId: string, saleId: string, id: string) {
  const { count } = await prisma.saleAttachment.deleteMany({ where: { id, saleId, userId } });
  if (!count) throw new DomainError(404, "Anexo não encontrado");
}

/** Conta do Financeiro que recebe as vendas quando nenhuma é escolhida: a primeira ativa (ou nenhuma). */
export async function defaultFinAccountId(userId: string) {
  const a = await prisma.finAccount.findFirst({ where: { userId, archived: false }, orderBy: { createdAt: "asc" }, select: { id: true } });
  return a?.id ?? null;
}

/** Cliente pagou (com a data e a conta em que o dinheiro entrou) ou volta para "a receber" (sai da conta).
 *  Sem conta informada (undefined), fica a que a venda já tinha, ou a conta padrão; null = fora das contas. */
export async function setSalePaid(userId: string, id: string, input: { paid: boolean; date?: Date; accountId?: string | null }) {
  const s = await prisma.sale.findFirst({ where: { id, userId }, select: { id: true, occurredAt: true, finAccountId: true } });
  if (!s) throw new DomainError(404, "Venda não encontrada");
  const date = input.date ?? new Date(`${brDay()}T00:00:00Z`);
  if (input.paid && date.toISOString().slice(0, 10) < saleDay(s.occurredAt)) throw new DomainError(400, "O pagamento não pode ser antes da venda");
  if (input.paid && input.accountId && !(await prisma.finAccount.count({ where: { id: input.accountId, userId } }))) throw new DomainError(404, "Conta não encontrada");
  const finAccountId = !input.paid ? null : input.accountId !== undefined ? input.accountId : s.finAccountId ?? (await defaultFinAccountId(userId));
  await prisma.sale.update({ where: { id: s.id }, data: { paidAt: input.paid ? date : null, finAccountId } });
  return getSale(userId, s.id);
}

/** Troca as etiquetas da venda (sem repetir, na ordem digitada). */
export async function setSaleTags(userId: string, id: string, tags: string[]) {
  const s = await prisma.sale.findFirst({ where: { id, userId }, select: { id: true } });
  if (!s) throw new DomainError(404, "Venda não encontrada");
  const seen = new Set<string>();
  const clean = tags.map((t) => t.trim().replace(/\s+/g, " ")).filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
  await prisma.sale.update({ where: { id: s.id }, data: { tags: clean } });
  return getSale(userId, s.id);
}

/** Todas as etiquetas já usadas, para sugerir e filtrar. */
export async function saleTags(userId: string) {
  const rows = await prisma.sale.findMany({ where: { userId, NOT: { tags: { isEmpty: true } } }, select: { tags: true } });
  return [...new Set(rows.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/* ---------------- Parceiro (comissão) ---------------- */

/** Recalcula e guarda a comissão do parceiro da venda pelos números atuais dela. */
async function refreshPartnerCommission(userId: string, saleId: string) {
  const row = await prisma.sale.findFirst({ where: { id: saleId, userId }, include: { ...saleInclude, partner: { select: { id: true, name: true, mode: true, value: true } } } });
  if (!row) return;
  const cents = row.partner ? partnerCommission(row.partner.mode, row.partner.value, saleFinancials(row)) : 0;
  await prisma.sale.update({ where: { id: saleId }, data: { partnerCommissionCents: cents } });
}

/** Liga (ou tira, com null) o parceiro da venda e guarda a comissão pela regra dele. */
export async function setSalePartner(userId: string, saleId: string, partnerId: string | null) {
  const sale = await prisma.sale.findFirst({ where: { id: saleId, userId }, select: { id: true } });
  if (!sale) throw new DomainError(404, "Venda não encontrada");
  if (partnerId && !(await prisma.partner.findFirst({ where: { id: partnerId, userId, active: true }, select: { id: true } }))) throw new DomainError(404, "Parceiro não encontrado");
  await prisma.sale.update({ where: { id: saleId }, data: { partnerId, partnerCommissionCents: 0 } });
  if (partnerId) await refreshPartnerCommission(userId, saleId);
  return getSale(userId, saleId);
}

/** Venda feita por um membro da equipe (com login próprio) fica em nome dele, se ninguém foi escolhido como
 *  emissor: entra nas metas e na comissão dele. */
export async function creditIssuer(userId: string, saleId: string | null | undefined, memberId: string | null) {
  if (!saleId || !memberId) return;
  await prisma.sale.updateMany({ where: { id: saleId, userId, issuerIds: { isEmpty: true } }, data: { issuerIds: [memberId] } });
}

/** Quem emitiu a venda (membros da Equipe). Com mais de um, as métricas dividem o resultado em partes iguais. */
export async function setSaleIssuers(userId: string, saleId: string, memberIds: string[]) {
  const sale = await prisma.sale.findFirst({ where: { id: saleId, userId }, select: { id: true } });
  if (!sale) throw new DomainError(404, "Venda não encontrada");
  const ids = [...new Set(memberIds)];
  if (ids.length > 10) throw new DomainError(400, "No máximo 10 emissores por venda");
  if (ids.length && (await prisma.teamMember.count({ where: { userId, id: { in: ids } } })) !== ids.length) throw new DomainError(404, "Membro da equipe não encontrado");
  await prisma.sale.update({ where: { id: saleId }, data: { issuerIds: ids } });
  return getSale(userId, saleId);
}
