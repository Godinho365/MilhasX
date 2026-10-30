import { createHash, randomBytes } from "node:crypto";
import { Prisma, type MilesDealStage } from "@prisma/client";
import { prisma, DomainError } from "../db";
import { createSale } from "./sales";
import { dealChargeCents, dealProfitCents, dealTotalCents, type BuyerType, type Passenger } from "@/domain/miles-deals";

// CRM Milhas: Kanban das negociações de venda de milhas. Ao chegar em "Pago" a negociação vira uma
// venda em Vendas (baixa dos pontos da conta escolhida); depois disso não volta de etapa nem muda os
// dados da venda — para reabrir, exclua a venda em Vendas.

export type DealInput = {
  buyerType: BuyerType;
  customerId?: string | null;
  customerName: string;
  customerPhone?: string | null;
  accountId?: string | null;
  points?: number | null;
  saleCpmCents?: number | null;
  profitCents?: number | null; // lucro informado à mão; vazio = estimado pelo CPM da conta
  passengers?: number | null;
  taxesCents?: number | null; // taxas da emissão, pagas por mim e cobradas do comprador
  orderLink?: string | null;
  locator?: string | null;
  notes?: string | null;
};

const include = { account: { select: { id: true, balance: true, costCents: true, nickname: true, program: { select: { name: true } }, holder: { select: { name: true } } } } } as const;
type Row = Prisma.MilesDealGetPayload<{ include: typeof include }>;

const view = (d: Row) => {
  const costCpmCents = d.account && d.account.balance > 0 ? Math.round((d.account.costCents * 1000) / d.account.balance) : null;
  const estimatedProfitCents = dealProfitCents(d.points, d.saleCpmCents, costCpmCents);
  return {
    id: d.id,
    number: d.number,
    buyerType: d.buyerType as BuyerType,
    customerId: d.customerId,
    customerName: d.customerName,
    customerPhone: d.customerPhone,
    stage: d.stage,
    position: d.position,
    accountId: d.accountId,
    accountLabel: d.account ? d.account.nickname || `${d.account.program.name} · ${d.account.holder.name}` : null,
    points: d.points,
    saleCpmCents: d.saleCpmCents,
    passengers: d.passengers,
    taxesCents: d.taxesCents,
    orderLink: d.orderLink,
    locator: d.locator,
    shareToken: d.shareToken,
    passengersData: (Array.isArray(d.passengersData) ? d.passengersData : []) as Passenger[],
    passengersAt: d.passengersAt?.toISOString() ?? null,
    chargeCents: dealChargeCents(d.points, d.saleCpmCents, d.taxesCents),
    notes: d.notes,
    saleId: d.saleId,
    totalCents: dealTotalCents(d.points, d.saleCpmCents),
    costCpmCents,
    estimatedProfitCents,
    profitManual: d.profitCents != null,
    profitCents: d.profitCents ?? estimatedProfitCents,
    createdAt: d.createdAt.toISOString(),
  };
};
export type DealView = ReturnType<typeof view>;

async function checkRefs(userId: string, input: DealInput) {
  if (!input.customerName.trim()) throw new DomainError(400, "Informe o comprador");
  if (input.customerId && !(await prisma.customer.findFirst({ where: { id: input.customerId, userId }, select: { id: true } }))) throw new DomainError(404, "Cliente não encontrado");
  if (input.accountId && !(await prisma.account.findFirst({ where: { id: input.accountId, userId }, select: { id: true } }))) throw new DomainError(404, "Conta não encontrada");
}
const data = (input: DealInput) => ({
  buyerType: input.buyerType,
  customerId: input.customerId || null,
  customerName: input.customerName.trim(),
  customerPhone: input.customerPhone?.trim() || null,
  accountId: input.accountId || null,
  points: input.points || null,
  saleCpmCents: input.saleCpmCents || null,
  profitCents: input.profitCents ?? null,
  passengers: input.passengers || null,
  taxesCents: input.taxesCents ?? null,
  orderLink: input.orderLink?.trim() || null,
  locator: input.locator?.trim().toUpperCase() || null,
  notes: input.notes?.trim() || null,
});

async function own(userId: string, id: string) {
  const d = await prisma.milesDeal.findFirst({ where: { id, userId } });
  if (!d) throw new DomainError(404, "Negociação não encontrada");
  return d;
}

/** Uma negociação atualizada (a janela aberta busca de novo para ver os passageiros que o comprador enviou). */
export async function getDeal(userId: string, id: string) {
  const d = await prisma.milesDeal.findFirst({ where: { id, userId }, include });
  if (!d) throw new DomainError(404, "Negociação não encontrada");
  return view(d);
}

export async function listDeals(userId: string) {
  const rows = await prisma.milesDeal.findMany({ where: { userId, archivedAt: null }, include, orderBy: [{ position: "asc" }, { createdAt: "desc" }] });
  return rows.map(view);
}

export async function createDeal(userId: string, input: DealInput) {
  await checkRefs(userId, input);
  // Número sequencial por usuário; repete se duas negociações chegarem juntas
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const last = await tx.milesDeal.aggregate({ where: { userId }, _max: { number: true } });
        return view(await tx.milesDeal.create({ data: { userId, number: (last._max.number ?? 0) + 1, ...data(input) }, include }));
      });
    } catch (e) {
      if (attempt < 3 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
}

export async function updateDeal(userId: string, id: string, input: DealInput) {
  const d = await own(userId, id);
  await checkRefs(userId, input);
  const next = data(input);
  if (d.saleId && (next.accountId !== d.accountId || next.points !== d.points || next.saleCpmCents !== d.saleCpmCents || next.taxesCents !== d.taxesCents)) {
    throw new DomainError(409, "Esta negociação já virou venda: para mudar conta, pontos, milheiro ou taxas, exclua a venda em Vendas");
  }
  return view(await prisma.milesDeal.update({ where: { id }, data: next, include }));
}

/** Lança a venda da negociação em Vendas (idempotente: mover de novo para "Pago" não duplica). */
async function closeAsSale(userId: string, d: Awaited<ReturnType<typeof own>>) {
  if (!d.accountId) throw new DomainError(400, "Escolha a conta de onde saem as milhas antes de marcar como pago");
  if (!d.points || !d.saleCpmCents) throw new DomainError(400, "Informe os pontos e o preço do milheiro antes de marcar como pago");
  const acc = await prisma.account.findFirst({ where: { id: d.accountId, userId }, select: { balance: true } });
  if (!acc) throw new DomainError(404, "Conta não encontrada");
  if (acc.balance < d.points) throw new DomainError(422, `Saldo insuficiente na conta: ${acc.balance.toLocaleString("pt-BR")} pontos`);
  const { sale } = await createSale(userId, {
    origin: "OWN",
    accountId: d.accountId,
    occurredAt: new Date(),
    idempotencyKey: `miles-deal:${d.id}`,
    items: [{
      kind: "OTHER",
      issuedWith: "POINTS",
      points: d.points,
      salePriceCents: dealTotalCents(d.points, d.saleCpmCents)!,
      clientType: d.buyerType === "FINAL" ? "FINAL" : "AGENCY",
      customerIds: d.customerId ? [d.customerId] : [],
      passengers: d.passengers ?? undefined,
      // Taxas pagas na emissão e cobradas do comprador: entram no total como custo repassado
      costs: d.taxesCents ? [{ type: "TAXA_EMBARQUE", amountCents: d.taxesCents }] : [],
      reservation: d.locator ?? undefined,
      description: `Venda de milhas · CRM Milhas #${d.number} · ${d.customerName}`,
      observation: d.notes ?? undefined,
    }],
  });
  return sale.id;
}

/** Move a negociação para a etapa (e posição) indicada; chegar em "Pago" lança a venda. */
export async function moveDeal(userId: string, id: string, stage: MilesDealStage, position?: number) {
  const d = await own(userId, id);
  if (d.saleId && stage !== "PAID") throw new DomainError(409, "Esta negociação já virou venda: para reabrir, exclua a venda em Vendas");
  const saleId = stage === "PAID" && !d.saleId ? await closeAsSale(userId, d) : d.saleId;
  await prisma.$transaction(async (tx) => {
    const column = await tx.milesDeal.findMany({ where: { userId, stage, archivedAt: null, NOT: { id } }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true } });
    const at = Math.max(0, Math.min(position ?? column.length, column.length));
    const ids = [...column.slice(0, at).map((c) => c.id), id, ...column.slice(at).map((c) => c.id)];
    for (const [i, did] of ids.entries()) await tx.milesDeal.update({ where: { id: did }, data: { position: i, ...(did === id ? { stage, saleId } : {}) } });
  });
  return view(await prisma.milesDeal.findUniqueOrThrow({ where: { id }, include }));
}

export async function deleteDeal(userId: string, id: string) {
  const d = await own(userId, id);
  if (d.saleId) throw new DomainError(409, "Esta negociação já virou venda: exclua a venda em Vendas antes");
  await prisma.milesDeal.delete({ where: { id } });
}

/* ---------------- Página do comprador ---------------- */

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const SUBMITS_PER_HOUR = 10;

/** Link da página do comprador (criado uma vez e mantido). */
export async function dealShareToken(userId: string, id: string) {
  const d = await own(userId, id);
  const slug = (await prisma.salesProfile.findUnique({ where: { userId }, select: { slug: true } }))?.slug ?? null;
  if (d.shareToken) return { token: d.shareToken, slug };
  const token = randomBytes(18).toString("base64url");
  await prisma.milesDeal.update({ where: { id }, data: { shareToken: token } });
  return { token, slug };
}

async function dealByToken(slug: string, token: string) {
  const d = await prisma.milesDeal.findUnique({ where: { shareToken: token }, include: { user: { select: { status: true, salesProfile: { select: { slug: true } } } } } });
  if (!d || d.user.status !== "ACTIVE" || d.user.salesProfile?.slug !== slug.toLowerCase()) return null;
  return d;
}

/** O que o comprador vê: resumo da emissão, passageiros enviados e localizador (sem conta, custo ou lucro). */
export async function publicDeal(slug: string, token: string) {
  const d = await dealByToken(slug, token);
  if (!d) return null;
  return {
    userId: d.userId,
    deal: {
      number: d.number,
      customerName: d.customerName,
      points: d.points,
      passengers: d.passengers,
      taxesCents: d.taxesCents,
      chargeCents: dealChargeCents(d.points, d.saleCpmCents, d.taxesCents),
      passengersData: (Array.isArray(d.passengersData) ? d.passengersData : []) as Passenger[],
      passengersAt: d.passengersAt?.toISOString() ?? null,
      locator: d.locator,
    },
  };
}
export type PublicDeal = NonNullable<Awaited<ReturnType<typeof publicDeal>>>["deal"];

/** O comprador envia os passageiros; pode corrigir até a emissão (localizador informado). */
export async function submitDealPassengers(slug: string, token: string, passengers: Passenger[], ip: string) {
  const d = await dealByToken(slug, token);
  if (!d) throw new DomainError(404, "Página não encontrada");
  if (d.locator || d.saleId) throw new DomainError(409, "A emissão já foi feita: fale com quem te enviou o link para mudar os passageiros");
  if (d.passengers && passengers.length !== d.passengers) throw new DomainError(400, `Informe ${d.passengers} ${d.passengers === 1 ? "passageiro" : "passageiros"}`);
  const key = `deal:${d.id}`;
  const ipHash = sha(`deal:${ip}`).slice(0, 32);
  if ((await prisma.loginAttempt.count({ where: { email: key, ip: ipHash, createdAt: { gte: new Date(Date.now() - 3600_000) } } })) >= SUBMITS_PER_HOUR) throw new DomainError(429, "Muitos envios. Tente de novo mais tarde.");
  await prisma.loginAttempt.create({ data: { email: key, ip: ipHash, success: true } });
  const data = passengers.map((p) => ({ name: p.name.trim(), firstName: p.firstName?.trim() || undefined, lastName: p.lastName?.trim() || undefined, cpf: p.cpf.replace(/\D/g, ""), birthDate: p.birthDate, gender: p.gender || undefined, email: p.email?.trim() || undefined, phone: p.phone?.trim() || undefined }));
  await prisma.milesDeal.update({ where: { id: d.id }, data: { passengersData: data, passengersAt: new Date() } });
  await prisma.notification.create({ data: { userId: d.userId, title: "Passageiros recebidos", body: `${d.customerName} enviou ${data.length === 1 ? "o passageiro" : `${data.length} passageiros`} da negociação #${d.number} (CRM Milhas).` } });
  return { ok: true };
}
