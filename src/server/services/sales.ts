// Vendas de emissão: venda com itens (passagem, bagagem, assento, hospedagem, carro, outro),
// origem dos pontos (minha conta ou fornecedor), custos repassados, clientes e anexos.
import { randomUUID } from "node:crypto";
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
  return { totalCents, costCents, resultCents, pricedCents: priced, pointsValueCents, marginPct: priced > 0 ? Math.round((resultCents / priced) * 1000) / 10 : null };
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

export async function createSale(userId: string, input: SaleInput) {
  validate(input);
  if (input.origin === "SUPPLIER") await assertFeature(userId, "suppliers");
  const groupId = input.idempotencyKey ? `sale:${userId}:${input.idempotencyKey}` : `sale:${randomUUID()}`;
  const existing = await prisma.sale.findUnique({ where: { groupId } });
  if (existing) return { sale: existing, duplicated: true };
  const customerIds = [...new Set(input.items.flatMap((i) => i.customerIds ?? []))];
  const cardIds = [...new Set(input.items.flatMap((i) => (i.costs ?? []).map((c) => c.cardId)).filter((x): x is string => !!x))];
  const totalPoints = input.items.reduce((t, i) => t + (i.issuedWith === "POINTS" ? i.points : 0), 0);
  const totalCents = input.items.reduce((t, i) => t + i.salePriceCents + sumCosts(i.costs), 0);

  const sale = await withLedger(userId, async (tx) => {
    if (customerIds.length && (await tx.customer.count({ where: { id: { in: customerIds }, userId } })) !== customerIds.length) throw new DomainError(404, "Cliente não encontrado");
    if (cardIds.length && (await tx.creditCard.count({ where: { id: { in: cardIds }, userId } })) !== cardIds.length) throw new DomainError(404, "Cartão não encontrado");
    let accountId: string | null = null;
    let supplierCpm: number | null = null;
    let programLabel = "";
    if (input.origin === "OWN") {
      const acc = await ownAccount(tx, userId, input.accountId!);
      accountId = acc.id;
      programLabel = `${acc.program.name} ${acc.holder.name}`;
    } else {
      const sa = await tx.supplierAccount.findFirst({ where: { id: input.supplierAccountId!, userId }, include: { supplier: true, program: true } });
      if (!sa) throw new DomainError(404, "Conta de fornecedor não encontrada");
      if (sa.balance < totalPoints) throw new DomainError(422, `Saldo insuficiente no fornecedor (${sa.balance.toLocaleString("pt-BR")} pontos)`);
      supplierCpm = sa.priceCpmCents;
      programLabel = `${sa.program.name} · ${sa.supplier.name}`;
      if (totalPoints) await tx.supplierAccount.update({ where: { id: sa.id }, data: { balance: { decrement: totalPoints } } });
    }
    const created = await tx.sale.create({
      data: {
        userId,
        origin: input.origin,
        accountId,
        supplierAccountId: input.origin === "SUPPLIER" ? input.supplierAccountId! : null,
        customerId: customerIds[0] ?? null,
        groupId,
        points: totalPoints,
        totalCents,
        occurredAt: input.occurredAt,
      },
    });
    for (const [n, it] of input.items.entries()) {
      let entryId: string | null = null;
      // Pontos próprios: cada item emitido com pontos sai da conta como um lançamento "Venda"
      if (input.origin === "OWN" && it.issuedWith === "POINTS") {
        const e = await tx.entry.create({
          data: {
            userId,
            accountId: accountId!,
            type: "SALE",
            points: -it.points,
            occurredAt: input.occurredAt,
            description: `Venda · ${itemSummary(it)}${it.reservation ? ` · ${it.reservation}` : ""}`,
            groupId,
          },
        });
        entryId = e.id;
      }
      await tx.saleItem.create({
        data: {
          saleId: created.id,
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
    void programLabel;
    // Beneficiários: os clientes dos itens emitidos com pontos próprios contam no limite de CPFs da conta
    if (input.origin === "OWN") {
      const ids = [...new Set(input.items.filter((i) => i.issuedWith === "POINTS").flatMap((i) => i.customerIds ?? []))];
      if (ids.length) {
        const cs = await tx.customer.findMany({ where: { id: { in: ids }, userId }, select: { name: true, docNumber: true } });
        await tx.accountBeneficiary.createMany({ data: cs.map((c) => ({ userId, accountId: accountId!, saleId: created.id, name: c.name, document: c.docNumber?.replace(/\D/g, "") || null, usedAt: input.occurredAt })) });
      }
    }
    return created;
  });
  return { sale, duplicated: false };
}

const saleInclude = {
  account: { include: { program: { select: { name: true, color: true } }, holder: { select: { name: true } } } },
  supplierAccount: { include: { program: { select: { name: true, color: true } }, supplier: { select: { name: true } } } },
  items: { include: { entry: { select: { costCents: true } }, customers: { select: { id: true, name: true } } }, orderBy: { position: "asc" as const } },
  _count: { select: { attachments: true } },
} satisfies Prisma.SaleInclude;

type SaleRow = Prisma.SaleGetPayload<{ include: typeof saleInclude }>;

function present(s: SaleRow) {
  const f = saleFinancials(s);
  const own = s.origin === "OWN";
  return {
    id: s.id,
    date: s.occurredAt.toISOString(),
    origin: s.origin,
    program: own ? (s.account ? `${s.account.program.name} ${s.account.holder.name}` : "Conta excluída") : s.supplierAccount ? `${s.supplierAccount.program.name} · ${s.supplierAccount.supplier.name}` : "Fornecedor excluído",
    color: (own ? s.account?.program.color : s.supplierAccount?.program.color) ?? "#60a5fa",
    programName: (own ? s.account?.program.name : s.supplierAccount?.program.name) ?? "Programa excluído",
    description: s.items.map(itemSummary).join(" + "),
    customers: [...new Map(s.items.flatMap((i) => i.customers).map((c) => [c.id, c.name])).values()],
    points: s.points,
    ...f,
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

export type SaleFilter = { q?: string; from?: Date; to?: Date; programId?: string; customerId?: string; sort?: "occurredAt" | "points" | "totalCents"; order?: "asc" | "desc"; holderId?: string };

export async function listSales(userId: string, f: SaleFilter = {}) {
  const where: Prisma.SaleWhereInput = {
    userId,
    occurredAt: f.from || f.to ? { gte: f.from, lte: f.to } : undefined,
    items: f.customerId ? { some: { customers: { some: { id: f.customerId } } } } : undefined,
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
  return rows.map(present);
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
    if (s.origin === "SUPPLIER" && s.supplierAccountId && s.points) {
      await tx.supplierAccount.updateMany({ where: { id: s.supplierAccountId, userId }, data: { balance: { increment: s.points } } });
    }
    await tx.sale.delete({ where: { id: s.id } });
    return { ok: true };
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
