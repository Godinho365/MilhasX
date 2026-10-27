// Lojas parceiras, favoritos, alertas, clientes, vendas, notificações e relatórios.
import type { EntryType, Prisma } from "@prisma/client";
import { prisma, DomainError } from "../db";
import { assertWithinLimit } from "./plan-limits";
import { ENTRY_LABELS } from "@/domain/ledger";

export type StoreSort = "popular" | "points" | "cashback" | "name";

/**
 * Lojas com a melhor oferta de pontos (do programa filtrado, se houver) e de cashback.
 * "Mais populares" = mais favoritadas e mais usadas em compras.
 */
type OfferRow = { pointsPerReal: number; upTo: boolean; perDollar: boolean; clubPointsPerReal: number | null; regularPointsPerReal: number | null; promotion: boolean; promoEndsAt: Date | null; partnerLink: string | null; observedAt: Date | null; cashbackBps: number; portal: string | null; program: { id: string; name: string; color: string; logoUpdatedAt: Date | null } | null };
const pointsView = (o: OfferRow) => ({
  pointsPerReal: o.pointsPerReal / 100,
  program: o.program!.name,
  programId: o.program!.id,
  programColor: o.program!.color,
  programLogo: o.program!.logoUpdatedAt?.getTime().toString() ?? null,
  upTo: o.upTo,
  perDollar: o.perDollar,
  club: o.clubPointsPerReal != null && o.clubPointsPerReal > o.pointsPerReal ? o.clubPointsPerReal / 100 : null,
  regular: o.regularPointsPerReal != null ? o.regularPointsPerReal / 100 : null,
  promotion: o.promotion,
  promoEndsAt: o.promoEndsAt?.toISOString() ?? null,
  // Só links http(s) do próprio programa vão para a tela
  link: o.partnerLink && /^https:\/\//.test(o.partnerLink) ? o.partnerLink : null,
  observedAt: o.observedAt?.toISOString() ?? null,
});

const cashView = (o: OfferRow) => ({
  percent: o.cashbackBps / 100,
  portal: o.portal ?? "",
  upTo: o.upTo,
  link: o.partnerLink && /^https:\/\//.test(o.partnerLink) ? o.partnerLink : null,
  observedAt: o.observedAt?.toISOString() ?? null,
});

export async function listStores(userId: string, opts: { q?: string; favorites?: boolean; page?: number; programId?: string; sort?: StoreSort }) {
  const pageSize = 18;
  const page = Math.max(opts.page ?? 1, 1);
  const where: Prisma.StoreWhereInput = {
    active: true,
    name: opts.q ? { contains: opts.q, mode: "insensitive" } : undefined,
    favorites: opts.favorites ? { some: { userId } } : undefined,
    offers: opts.programId ? { some: { programId: opts.programId, pointsPerReal: { gt: 0 } } } : undefined,
  };
  const [stores, favs] = await Promise.all([
    prisma.store.findMany({ where, include: { offers: { include: { program: true } }, _count: { select: { favorites: true, bonusPurchases: true } } }, orderBy: { name: "asc" } }),
    prisma.favoriteStore.findMany({ where: { userId }, select: { storeId: true } }),
  ]);
  const favSet = new Set(favs.map((f) => f.storeId));
  const all = stores.map((st) => {
    const points = st.offers.filter((o) => o.programId && o.pointsPerReal > 0 && (!opts.programId || o.programId === opts.programId)).sort((a, b) => b.pointsPerReal - a.pointsPerReal);
    const cash = st.offers.filter((o) => o.cashbackBps > 0).sort((a, b) => b.cashbackBps - a.cashbackBps);
    return {
      id: st.id,
      name: st.name,
      logo: st.logoUpdatedAt?.getTime().toString() ?? null,
      favorite: favSet.has(st.id),
      popularity: st._count.favorites * 2 + st._count.bonusPurchases,
      bestPoints: points[0] ? pointsView(points[0]) : null,
      programs: points.map(pointsView),
      bestCashback: cash[0] ? cashView(cash[0]) : null,
      cashbacks: cash.map(cashView),
    };
  });
  const sort = opts.sort ?? "popular";
  all.sort((a, b) =>
    sort === "points" ? (b.bestPoints?.pointsPerReal ?? 0) - (a.bestPoints?.pointsPerReal ?? 0) || a.name.localeCompare(b.name)
    : sort === "cashback" ? (b.bestCashback?.percent ?? 0) - (a.bestCashback?.percent ?? 0) || a.name.localeCompare(b.name)
    : sort === "name" ? a.name.localeCompare(b.name)
    : b.popularity - a.popularity || a.name.localeCompare(b.name),
  );
  const total = all.length;
  const items = all.slice((page - 1) * pageSize, page * pageSize).map(({ popularity: _p, ...rest }) => rest);
  return { total, page, pages: Math.max(1, Math.ceil(total / pageSize)), items };
}

/**
 * "Ative em um clique": lojas favoritas e as mais usadas nas compras, sem alerta ainda.
 * Sugere avisar a partir de 1,5× a melhor oferta atual (mínimo 3 pts/R$).
 */
export async function alertSuggestions(userId: string) {
  const [favs, used, existing] = await Promise.all([
    prisma.favoriteStore.findMany({ where: { userId }, select: { storeId: true } }),
    prisma.bonusPurchase.groupBy({ by: ["storeId"], where: { userId, storeId: { not: null } }, _count: true, orderBy: { _count: { storeId: "desc" } }, take: 10 }),
    prisma.alert.findMany({ where: { userId, type: "STORE_POINTS" }, select: { storeId: true } }),
  ]);
  const taken = new Set(existing.map((a) => a.storeId));
  const ids = [...new Set([...favs.map((f) => f.storeId), ...used.map((u) => u.storeId!)])].filter((id) => !taken.has(id));
  let stores = await prisma.store.findMany({ where: { id: { in: ids }, active: true }, include: { offers: { where: { programId: { not: null } }, orderBy: { pointsPerReal: "desc" }, take: 1 } } });
  // Sem favoritas nem compras: começa pelas lojas mais populares
  if (stores.length === 0) {
    stores = await prisma.store.findMany({ where: { active: true, id: { notIn: [...taken].filter((x): x is string => !!x) } }, include: { offers: { where: { programId: { not: null } }, orderBy: { pointsPerReal: "desc" }, take: 1 } }, orderBy: { favorites: { _count: "desc" } }, take: 4 });
  }
  return stores.slice(0, 6).map((st) => {
    const best = (st.offers[0]?.pointsPerReal ?? 0) / 100;
    return { storeId: st.id, name: st.name, threshold: Math.max(3, Math.ceil(best * 1.5)) };
  });
}

export async function toggleFavorite(userId: string, storeId: string) {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new DomainError(404, "Loja não encontrada");
  const key = { userId_storeId: { userId, storeId } };
  const existing = await prisma.favoriteStore.findUnique({ where: key });
  if (existing) {
    await prisma.favoriteStore.delete({ where: key });
    return { favorite: false };
  }
  await prisma.favoriteStore.create({ data: { userId, storeId } });
  return { favorite: true };
}

export async function listAlerts(userId: string) {
  return prisma.alert.findMany({
    where: { userId },
    include: { store: true, program: true, account: { include: { program: true, holder: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createAlert(
  userId: string,
  input: { type: "STORE_POINTS" | "MIN_BALANCE" | "PROMOTION"; storeId?: string; programId?: string; accountId?: string; threshold: number },
) {
  if (input.type === "PROMOTION") {
    if (!Number.isInteger(input.threshold) || input.threshold < 0 || input.threshold > 300) throw new DomainError(400, "Bônus mínimo inválido");
    if (input.programId && !(await prisma.program.findUnique({ where: { id: input.programId } }))) throw new DomainError(400, "Programa inválido");
    return prisma.alert.create({ data: { userId, type: "PROMOTION", programId: input.programId ?? null, threshold: input.threshold } });
  }
  if (!Number.isInteger(input.threshold) || input.threshold <= 0) throw new DomainError(400, "Limite inválido");
  if (input.type === "STORE_POINTS") {
    if (!input.storeId || !(await prisma.store.findUnique({ where: { id: input.storeId } }))) {
      throw new DomainError(400, "Escolha uma loja");
    }
    if (input.programId && !(await prisma.program.findUnique({ where: { id: input.programId } }))) {
      throw new DomainError(400, "Programa inválido");
    }
    await assertWithinLimit(userId, "storeAlerts");
    const alert = await prisma.alert.create({
      data: { userId, type: "STORE_POINTS", storeId: input.storeId, programId: input.programId ?? null, threshold: input.threshold },
    });
    await evaluateStoreAlerts(input.storeId);
    return alert;
  }
  if (!input.accountId || !(await prisma.account.findFirst({ where: { id: input.accountId, userId } }))) {
    throw new DomainError(400, "Escolha uma conta");
  }
  return prisma.alert.create({ data: { userId, type: "MIN_BALANCE", accountId: input.accountId, threshold: input.threshold } });
}

export async function deleteAlert(userId: string, id: string) {
  const { count } = await prisma.alert.deleteMany({ where: { id, userId } });
  if (!count) throw new DomainError(404, "Alerta não encontrado");
}

/** Dispara notificações para alertas de loja cuja oferta atingiu o limite. */
export async function evaluateStoreAlerts(storeId: string) {
  const [alerts, offers] = await Promise.all([
    prisma.alert.findMany({ where: { storeId, type: "STORE_POINTS", active: true }, include: { store: true } }),
    prisma.storeOffer.findMany({ where: { storeId, programId: { not: null } }, include: { program: true } }),
  ]);
  for (const al of alerts) {
    const match = offers
      .filter((o) => !al.programId || o.programId === al.programId)
      .sort((a, b) => b.pointsPerReal - a.pointsPerReal)[0];
    const hit = !!match && match.pointsPerReal >= al.threshold;
    if (hit && !al.lastTriggeredAt) {
      await prisma.notification.create({
        data: {
          userId: al.userId,
          title: `Alerta: ${al.store!.name}`,
          body: `${al.store!.name} está dando ${(match!.pointsPerReal / 100).toLocaleString("pt-BR")} pts/R$ em ${match!.program!.name}.`,
        },
      });
      await prisma.alert.update({ where: { id: al.id }, data: { lastTriggeredAt: new Date() } });
    } else if (!hit && al.lastTriggeredAt) {
      await prisma.alert.update({ where: { id: al.id }, data: { lastTriggeredAt: null } });
    }
  }
}

/** Clientes com a data da última compra (venda em que aparecem em algum item). */
export async function listCustomers(userId: string) {
  const rows = await prisma.customer.findMany({
    where: { userId },
    include: { saleItems: { select: { sale: { select: { occurredAt: true } } } } },
    orderBy: { name: "asc" },
  });
  return rows.map(({ saleItems, ...c }) => {
    const dates = saleItems.map((i) => i.sale.occurredAt.getTime());
    return { ...c, purchases: new Set(saleItems.map((i) => i.sale.occurredAt.toISOString())).size, lastPurchase: dates.length ? new Date(Math.max(...dates)) : null };
  });
}

export type CustomerInput = {
  name: string;
  kind: "FINAL" | "AGENCY";
  docType?: "CPF" | "CNPJ" | null;
  docNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  contact?: string | null;
  documents?: { type: string; number: string }[];
};

export async function saveCustomer(userId: string, id: string | null, input: CustomerInput) {
  const name = input.name.trim();
  if (!name) throw new DomainError(400, "Informe o nome do cliente");
  const data = {
    name,
    kind: input.kind,
    docType: input.docType ?? null,
    docNumber: input.docNumber?.trim() || null,
    email: input.email || null,
    phone: input.phone?.trim() || null,
    contact: input.contact?.trim() || input.email || input.phone?.trim() || null,
    documents: input.documents ?? [],
  };
  if (!id) return prisma.customer.create({ data: { userId, ...data } });
  const c = await prisma.customer.findFirst({ where: { id, userId } });
  if (!c) throw new DomainError(404, "Cliente não encontrado");
  return prisma.customer.update({ where: { id }, data });
}

/** Compatível com o cadastro antigo (nome + contato). */
export const createCustomer = (userId: string, name: string, contact?: string | null) => saveCustomer(userId, null, { name, kind: "FINAL", contact });

export async function deleteCustomer(userId: string, id: string) {
  const { count } = await prisma.customer.deleteMany({ where: { id, userId } });
  if (!count) throw new DomainError(404, "Cliente não encontrado");
}

export async function listNotifications(userId: string) {
  return prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 });
}
export const unreadCount = (userId: string) => prisma.notification.count({ where: { userId, readAt: null } });
export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}

export async function reportOverview(userId: string, opts: { from?: Date; programId?: string; holderId?: string }) {
  const where: Prisma.EntryWhereInput = {
    userId,
    status: "CONFIRMED",
    occurredAt: opts.from ? { gte: opts.from } : undefined,
    account: opts.programId || opts.holderId ? { programId: opts.programId, holderId: opts.holderId } : undefined,
  };
  const [byType, credits] = await Promise.all([
    prisma.entry.groupBy({ by: ["type"], where: { ...where, points: { gt: 0 }, type: { not: "TRANSFER_IN" } }, _sum: { points: true, inputCostCents: true } }),
    prisma.entry.findMany({
      where: { ...where, points: { gt: 0 }, type: { not: "TRANSFER_IN" } },
      select: { points: true, account: { select: { program: { select: { name: true } }, holder: { select: { name: true } } } } },
    }),
  ]);
  const byProgram = new Map<string, number>();
  for (const c of credits) byProgram.set(c.account.program.name, (byProgram.get(c.account.program.name) ?? 0) + c.points);
  const sales = await prisma.sale.aggregate({
    where: { userId, occurredAt: opts.from ? { gte: opts.from } : undefined },
    _sum: { totalCents: true, points: true },
  });
  return {
    byCategory: byType
      .map((t) => ({ type: t.type as EntryType, label: ENTRY_LABELS[t.type as EntryType], points: t._sum.points ?? 0, costCents: t._sum.inputCostCents ?? 0 }))
      .sort((a, b) => b.points - a.points),
    byProgram: [...byProgram.entries()].map(([name, points]) => ({ name, points })).sort((a, b) => b.points - a.points),
    sales: { totalCents: sales._sum.totalCents ?? 0, points: sales._sum.points ?? 0 },
  };
}
