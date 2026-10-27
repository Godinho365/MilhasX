// Fornecedores, cartões e faturas, promoções, guias, novidades, foto de perfil e painel de vendas.
import { expectedCardPoints, invoiceFeeCents } from "@/domain/cards";
import type { CostType } from "@/domain/costs";
import type { GuideKind, GuideLevel, PromotionKind, Prisma } from "@prisma/client";
import { prisma, DomainError, audit } from "../db";
import { assertFeature } from "./plan-limits";
import { createEntry, deleteEntry, updateEntry } from "./ledger";
import { listSales as listSalesView } from "./sales";

/* ---------------- Fornecedores ---------------- */

export function listSuppliers(userId: string) {
  return prisma.supplier.findMany({
    where: { userId },
    include: { _count: { select: { accounts: true } }, accounts: { select: { balance: true } } },
    orderBy: { name: "asc" },
  });
}

export async function createSupplier(userId: string, input: { name: string; contact?: string | null; notes?: string | null }) {
  await assertFeature(userId, "suppliers");
  if (!input.name.trim()) throw new DomainError(400, "Informe o nome do fornecedor");
  return prisma.supplier.create({ data: { userId, name: input.name.trim(), contact: input.contact?.trim() || null, notes: input.notes?.trim() || null } });
}

export async function deleteSupplier(userId: string, id: string) {
  const { count } = await prisma.supplier.deleteMany({ where: { id, userId } });
  if (!count) throw new DomainError(404, "Fornecedor não encontrado");
}

export function listSupplierAccounts(userId: string, opts: { programId?: string; supplierId?: string } = {}) {
  return prisma.supplierAccount.findMany({
    where: { userId, programId: opts.programId, supplierId: opts.supplierId },
    include: { supplier: true, program: true, sales: { select: { points: true } } },
    orderBy: [{ supplier: { name: "asc" } }, { program: { name: "asc" } }],
  });
}

export interface SupplierAccountInput {
  supplierId: string;
  programId: string;
  identifier?: string | null;
  balance: number;
  priceCpmCents: number;
  cpfAvailable?: number | null;
  tags?: string[];
  notes?: string | null;
}

export async function upsertSupplierAccount(userId: string, id: string | null, input: SupplierAccountInput) {
  const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, userId } });
  if (!supplier) throw new DomainError(404, "Fornecedor não encontrado");
  const program = await prisma.program.findUnique({ where: { id: input.programId } });
  if (!program) throw new DomainError(404, "Programa não encontrado");
  const data = {
    supplierId: input.supplierId,
    programId: input.programId,
    identifier: input.identifier?.trim() || null,
    balance: input.balance,
    priceCpmCents: input.priceCpmCents,
    cpfAvailable: input.cpfAvailable ?? null,
    tags: [...new Set((input.tags ?? []).map((t) => t.trim()).filter(Boolean))],
    notes: input.notes?.trim() || null,
  };
  if (id) {
    const existing = await prisma.supplierAccount.findFirst({ where: { id, userId } });
    if (!existing) throw new DomainError(404, "Conta não encontrada");
    return prisma.supplierAccount.update({ where: { id }, data });
  }
  await assertFeature(userId, "suppliers");
  return prisma.supplierAccount.create({ data: { ...data, userId } });
}

export async function deleteSupplierAccount(userId: string, id: string) {
  const { count } = await prisma.supplierAccount.deleteMany({ where: { id, userId } });
  if (!count) throw new DomainError(404, "Conta não encontrada");
}

/* ---------------- Cartões e faturas ---------------- */

/** Pontos esperados: valor em R$ convertido para US$ pela cotação, vezes pontos por dólar. */
export { expectedCardPoints };

export interface CardInput {
  accountId: string;
  name: string;
  brand?: string | null;
  pointsPerDollar: number;
  dollarRateCents: number;
  closingDay: number;
  dueDay: number;
  annualFeeCents: number;
  feeWaiverCents?: number | null;
}

export async function createCard(userId: string, input: CardInput) {
  const acc = await prisma.account.findFirst({ where: { id: input.accountId, userId } });
  if (!acc) throw new DomainError(404, "Conta não encontrada");
  return prisma.creditCard.create({ data: { ...input, userId, name: input.name.trim(), brand: input.brand?.trim() || null } });
}

/** Edita o cartão; as faturas em aberto são recalculadas (pontos e parcela da anuidade). */
export async function updateCard(userId: string, id: string, input: CardInput) {
  const card = await prisma.creditCard.findFirst({ where: { id, userId } });
  if (!card) throw new DomainError(404, "Cartão não encontrado");
  const acc = await prisma.account.findFirst({ where: { id: input.accountId, userId } });
  if (!acc) throw new DomainError(404, "Conta não encontrada");
  const hasClosed = await prisma.cardInvoice.count({ where: { cardId: id, status: "CLOSED" } });
  if (hasClosed && input.accountId !== card.accountId) throw new DomainError(409, "O cartão já tem faturas fechadas nesta conta; a conta que recebe os pontos não pode mudar.");
  const data = { ...input, name: input.name.trim(), brand: input.brand?.trim() || null, feeWaiverCents: input.feeWaiverCents || null };
  const updated = await prisma.creditCard.update({ where: { id }, data });
  const open = await prisma.cardInvoice.findMany({ where: { cardId: id, status: "OPEN" } });
  for (const i of open) {
    await prisma.cardInvoice.update({
      where: { id: i.id },
      data: { expectedPoints: expectedCardPoints(i.amountCents, updated.pointsPerDollar, updated.dollarRateCents), feeCents: invoiceFeeCents(updated, i.amountCents) },
    });
  }
  return updated;
}

/**
 * Pontos que o cartão já tem acumulados: um lançamento "Saldo inicial" na conta que recebe os pontos.
 * Um por cartão; informar de novo atualiza o mesmo lançamento, e zero o remove.
 */
export async function setCardBalance(userId: string, cardId: string, input: { points: number; date: Date }) {
  const card = await prisma.creditCard.findFirst({ where: { id: cardId, userId }, include: { balanceEntry: { select: { id: true } } } });
  if (!card) throw new DomainError(404, "Cartão não encontrado");
  if (!Number.isInteger(input.points) || input.points < 0) throw new DomainError(400, "Quantidade de pontos inválida");
  const current = card.balanceEntry?.id ?? null;
  if (input.points === 0) {
    if (current) await deleteEntry(userId, current);
    return prisma.creditCard.update({ where: { id: cardId }, data: { balanceEntryId: null } });
  }
  const description = `Pontos acumulados no cartão ${card.name}`;
  if (current) {
    await updateEntry(userId, current, { points: input.points, occurredAt: input.date, description });
    return card;
  }
  const { entry } = await createEntry(userId, { accountId: card.accountId, type: "INITIAL_BALANCE", points: input.points, occurredAt: input.date, description });
  return prisma.creditCard.update({ where: { id: cardId }, data: { balanceEntryId: entry.id } });
}

/**
 * "Pontos já incluídos no saldo do cartão": a fatura não lança pontos ao fechar. Se já estava fechada
 * com pontos a receber, o lançamento pendente sai (os pontos já estão no saldo acumulado).
 */
export async function setInvoicePointsIncluded(userId: string, invoiceId: string, included: boolean) {
  const inv = await prisma.cardInvoice.findFirst({ where: { id: invoiceId, card: { userId } }, include: { entry: { select: { id: true, status: true } } } });
  if (!inv) throw new DomainError(404, "Fatura não encontrada");
  if (included && inv.entry) {
    if (inv.entry.status === "CONFIRMED") throw new DomainError(409, "Os pontos desta fatura já foram recebidos; exclua o lançamento no extrato se estiverem duplicados.");
    await deleteEntry(userId, inv.entry.id);
  }
  if (!included && inv.pointsIncluded && inv.status === "CLOSED") throw new DomainError(409, "A fatura já foi fechada sem lançar pontos; exclua e cadastre de novo para lançar.");
  return prisma.cardInvoice.update({ where: { id: inv.id }, data: { pointsIncluded: included, entryId: included ? null : inv.entryId } });
}

export async function deleteCard(userId: string, id: string) {
  const card = await prisma.creditCard.findFirst({ where: { id, userId }, include: { invoices: true } });
  if (!card) throw new DomainError(404, "Cartão não encontrado");
  if (card.invoices.some((i) => i.entryId)) throw new DomainError(409, "O cartão tem faturas fechadas com pontos lançados. Exclua essas faturas antes.");
  await prisma.creditCard.delete({ where: { id } });
}

export async function addInvoice(userId: string, cardId: string, input: { closingDate: Date; dueDate: Date; amountCents: number; pointsIncluded?: boolean }) {
  const card = await prisma.creditCard.findFirst({ where: { id: cardId, userId } });
  if (!card) throw new DomainError(404, "Cartão não encontrado");
  if (input.dueDate < input.closingDate) throw new DomainError(400, "O vencimento precisa ser depois do fechamento");
  const dup = await prisma.cardInvoice.findFirst({ where: { cardId, dueDate: input.dueDate } });
  if (dup) throw new DomainError(409, "Já existe fatura com esse vencimento");
  return prisma.cardInvoice.create({
    data: { cardId, ...input, expectedPoints: expectedCardPoints(input.amountCents, card.pointsPerDollar, card.dollarRateCents), feeCents: invoiceFeeCents(card, input.amountCents) },
  });
}

/** Fechar a fatura cria os pontos "a receber" na conta do cartão. */
export async function closeInvoice(userId: string, invoiceId: string) {
  const inv = await prisma.cardInvoice.findFirst({ where: { id: invoiceId, card: { userId } }, include: { card: true } });
  if (!inv) throw new DomainError(404, "Fatura não encontrada");
  if (inv.status === "CLOSED") throw new DomainError(409, "A fatura já está fechada");
  let entryId: string | null = null;
  // Pontos já contados no saldo acumulado do cartão: fecha sem lançar de novo
  if (inv.expectedPoints > 0 && !inv.pointsIncluded) {
    const { entry } = await createEntry(userId, {
      accountId: inv.card.accountId,
      type: "CARD",
      points: inv.expectedPoints,
      occurredAt: inv.dueDate,
      description: `Fatura ${inv.card.name} (${inv.dueDate.toISOString().slice(0, 10).split("-").reverse().join("/")})`,
      status: "PENDING",
      // A parcela da anuidade do mês é o custo destes pontos (entra no CPM quando caírem na conta)
      costs: inv.feeCents > 0 ? [{ type: "ANUIDADE", amountCents: inv.feeCents, cardId: inv.cardId }] : undefined,
    });
    entryId = entry.id;
  } else if (inv.pointsIncluded && inv.feeCents > 0 && inv.card.balanceEntryId) {
    // Os pontos já estão no saldo acumulado: a parcela da anuidade do mês entra como custo desse saldo
    const bal = await prisma.entry.findUnique({ where: { id: inv.card.balanceEntryId }, include: { costs: true } });
    if (bal) {
      const costs = bal.costs.map((c) => ({ type: c.type as CostType, amountCents: c.amountCents, cardId: c.cardId }));
      await updateEntry(userId, bal.id, { costs: [...costs, { type: "ANUIDADE", amountCents: inv.feeCents, cardId: inv.cardId }] });
    }
  }
  return prisma.cardInvoice.update({ where: { id: inv.id }, data: { status: "CLOSED", entryId } });
}

export async function deleteInvoice(userId: string, invoiceId: string) {
  const inv = await prisma.cardInvoice.findFirst({ where: { id: invoiceId, card: { userId } } });
  if (!inv) throw new DomainError(404, "Fatura não encontrada");
  if (inv.entryId) await deleteEntry(userId, inv.entryId);
  await prisma.cardInvoice.delete({ where: { id: inv.id } });
}

export async function cardsOverview(userId: string) {
  const cards = await prisma.creditCard.findMany({
    where: { userId },
    include: {
      account: { include: { program: true, holder: true } },
      balanceEntry: { select: { points: true, occurredAt: true } },
      invoices: { include: { entry: { select: { status: true, points: true } } }, orderBy: { dueDate: "desc" } },
    },
    orderBy: { name: "asc" },
  });
  const now = new Date();
  let expected = 0, openCents = 0, received = 0;
  const actions: { cardId: string; card: string; invoiceId: string; dueDate: Date; amountCents: number }[] = [];
  for (const c of cards) {
    for (const i of c.invoices) {
      if (i.status === "OPEN") {
        if (!i.pointsIncluded) expected += i.expectedPoints;
        openCents += i.amountCents;
        if (i.closingDate <= now) actions.push({ cardId: c.id, card: c.name, invoiceId: i.id, dueDate: i.dueDate, amountCents: i.amountCents });
      } else if (i.entry) {
        if (i.entry.status === "CONFIRMED") received += i.entry.points;
        else expected += i.entry.points;
      }
    }
  }
  return {
    // Pontos ativos: os já acumulados no cartão (saldo informado), de todos os cartões
    stats: { activePoints: cards.reduce((t, c) => t + (c.balanceEntry?.points ?? 0), 0), expectedPoints: expected, openCents, receivedPoints: received, actionCards: new Set(actions.map((a) => a.cardId)).size, totalCards: cards.length },
    actions,
    cards,
  };
}

/* ---------------- Promoções ---------------- */

export type PromotionSort = "ending" | "recent" | "bonus";

export function listPromotions(opts: { history?: boolean; kind?: PromotionKind; q?: string; programId?: string; sort?: PromotionSort; take?: number }) {
  const now = new Date();
  const orderBy: Prisma.PromotionOrderByWithRelationInput[] = opts.history
    ? [{ endsAt: "desc" }]
    : opts.sort === "recent"
      ? [{ startsAt: "desc" }]
      : opts.sort === "bonus"
        ? [{ bonusPercent: "desc" }, { endsAt: "asc" }]
        : [{ endsAt: "asc" }];
  return prisma.promotion.findMany({
    where: {
      active: true,
      kind: opts.kind,
      title: opts.q ? { contains: opts.q, mode: "insensitive" } : undefined,
      ...(opts.programId ? { OR: [{ fromProgramId: opts.programId }, { toProgramId: opts.programId }] } : {}),
      ...(opts.history ? { endsAt: { lt: now } } : { endsAt: { gte: now }, startsAt: { lte: now } }),
    },
    include: { fromProgram: true, toProgram: true },
    orderBy,
    take: opts.take ?? 100,
  });
}

export interface PromotionInput {
  kind: PromotionKind;
  title: string;
  description?: string | null;
  fromProgramId?: string | null;
  toProgramId?: string | null;
  bonusPercent: number;
  url?: string | null;
  startsAt: Date;
  endsAt: Date;
  active: boolean;
}

export async function upsertPromotion(actorId: string, id: string | null, input: PromotionInput) {
  if (input.endsAt < input.startsAt) throw new DomainError(400, "O fim precisa ser depois do início");
  const data = { ...input, title: input.title.trim(), description: input.description?.trim() || null, url: input.url?.trim() || null };
  const promo = id ? await prisma.promotion.update({ where: { id }, data }) : await prisma.promotion.create({ data });
  await audit(prisma, actorId, id ? "admin.promotion_update" : "admin.promotion_create", "Promotion", promo.id);
  if (!id && promo.active) await notifyPromotion(promo.id);
  return promo;
}

export async function deletePromotion(actorId: string, id: string) {
  await prisma.promotion.delete({ where: { id } });
  await audit(prisma, actorId, "admin.promotion_delete", "Promotion", id);
}

/** Avisa quem tem alerta de promoção para algum dos programas envolvidos (com bônus mínimo). */
async function notifyPromotion(promotionId: string) {
  const p = await prisma.promotion.findUniqueOrThrow({ where: { id: promotionId }, include: { fromProgram: true, toProgram: true } });
  const programs = [p.fromProgramId, p.toProgramId].filter((x): x is string => !!x);
  const alerts = await prisma.alert.findMany({
    where: { type: "PROMOTION", active: true, threshold: { lte: p.bonusPercent }, OR: [{ programId: null }, { programId: { in: programs } }] },
  });
  const users = new Set(alerts.map((a) => a.userId));
  for (const userId of users) {
    await prisma.notification.create({
      data: { userId, title: "Nova promoção", body: `${p.title}${p.bonusPercent ? ` (${p.bonusPercent}% de bônus)` : ""} até ${p.endsAt.toLocaleDateString("pt-BR", { timeZone: "UTC" })}.` },
    });
  }
}

/* ---------------- Guias e novidades ---------------- */

export const listGuides = (all = false) =>
  prisma.guide.findMany({ where: all ? undefined : { published: true }, orderBy: [{ kind: "desc" }, { order: "asc" }, { title: "asc" }] });

export async function getGuide(slug: string) {
  const g = await prisma.guide.findFirst({ where: { slug, published: true } });
  if (!g) throw new DomainError(404, "Guia não encontrado");
  return g;
}

export interface GuideInput {
  slug: string;
  kind: GuideKind;
  title: string;
  summary: string;
  body: string;
  level: GuideLevel;
  minutes: number;
  tags: string[];
  videoUrl?: string | null;
  order: number;
  published: boolean;
}

export async function upsertGuide(actorId: string, id: string | null, input: GuideInput) {
  const slug = input.slug.trim().toLowerCase();
  const dup = await prisma.guide.findFirst({ where: { slug, NOT: id ? { id } : undefined } });
  if (dup) throw new DomainError(409, "Já existe um guia com esse endereço");
  const data = { ...input, slug, videoUrl: input.videoUrl?.trim() || null };
  const g = id ? await prisma.guide.update({ where: { id }, data }) : await prisma.guide.create({ data });
  await audit(prisma, actorId, id ? "admin.guide_update" : "admin.guide_create", "Guide", g.id);
  return g;
}

export async function deleteGuide(actorId: string, id: string) {
  await prisma.guide.delete({ where: { id } });
  await audit(prisma, actorId, "admin.guide_delete", "Guide", id);
}

export const listNews = (all = false) =>
  prisma.newsPost.findMany({ where: all ? undefined : { published: true, publishedAt: { lte: new Date() } }, orderBy: { publishedAt: "desc" }, take: 50 });

export async function unreadNews(userId: string) {
  const pref = await prisma.userPreference.findUnique({ where: { userId }, select: { newsReadAt: true } });
  return prisma.newsPost.count({ where: { published: true, publishedAt: { lte: new Date(), gt: pref?.newsReadAt ?? new Date(0) } } });
}

export async function markNewsRead(userId: string) {
  await prisma.userPreference.upsert({ where: { userId }, update: { newsReadAt: new Date() }, create: { userId, newsReadAt: new Date() } });
}

export async function upsertNews(actorId: string, id: string | null, input: { title: string; body: string; publishedAt: Date; published: boolean }) {
  const data = { ...input, title: input.title.trim(), body: input.body.trim() };
  const n = id ? await prisma.newsPost.update({ where: { id }, data }) : await prisma.newsPost.create({ data });
  await audit(prisma, actorId, id ? "admin.news_update" : "admin.news_create", "NewsPost", n.id);
  return n;
}

export async function deleteNews(actorId: string, id: string) {
  await prisma.newsPost.delete({ where: { id } });
  await audit(prisma, actorId, "admin.news_delete", "NewsPost", id);
}

/* ---------------- Foto de perfil ---------------- */

const MAX_AVATAR = 512 * 1024;

/** Valida pelo conteúdo (assinatura do arquivo), não pela extensão nem pelo tipo enviado. */
export function detectImage(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export async function setAvatar(userId: string, buf: Buffer) {
  if (buf.length === 0) throw new DomainError(400, "Arquivo vazio");
  if (buf.length > MAX_AVATAR) throw new DomainError(413, "Imagem maior que 512 KB");
  const mime = detectImage(buf);
  if (!mime) throw new DomainError(415, "Envie uma imagem JPG, PNG ou WebP");
  await prisma.user.update({ where: { id: userId }, data: { avatar: new Uint8Array(buf), avatarMime: mime, avatarUpdatedAt: new Date() } });
}

export async function getAvatar(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { avatar: true, avatarMime: true } });
  return u?.avatar && u.avatarMime ? { data: Buffer.from(u.avatar), mime: u.avatarMime } : null;
}

export async function removeAvatar(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { avatar: null, avatarMime: null, avatarUpdatedAt: null } });
}

/* ---------------- Painel de vendas ---------------- */

export async function salesDashboard(userId: string, months = 12) {
  const from = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - (months - 1), 1));
  const sales = await listSalesView(userId);
  const byMonth = new Map<string, { revenue: number; profit: number; points: number }>();
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1));
    byMonth.set(d.toISOString().slice(0, 7), { revenue: 0, profit: 0, points: 0 });
  }
  const customers = new Map<string, { revenue: number; count: number }>();
  const programs = new Map<string, number>();
  let revenue = 0, profit = 0, points = 0, priced = 0, pointsValue = 0;
  for (const s of sales) {
    revenue += s.totalCents;
    profit += s.resultCents;
    points += s.points;
    priced += s.pricedCents;
    pointsValue += s.pointsValueCents;
    const m = byMonth.get(s.date.slice(0, 7));
    if (m) {
      m.revenue += s.totalCents;
      m.profit += s.resultCents;
      m.points += s.points;
    }
    const cname = s.customers[0] ?? "Sem cliente";
    const c = customers.get(cname) ?? { revenue: 0, count: 0 };
    c.revenue += s.totalCents;
    c.count++;
    customers.set(cname, c);
    if (s.points) programs.set(s.program, (programs.get(s.program) ?? 0) + s.points);
  }
  return {
    totals: {
      revenueCents: revenue,
      profitCents: profit,
      points,
      count: sales.length,
      // Preço por milheiro e margem sobre o valor dos pontos: taxa de embarque e outros repasses não contam
      avgPriceCpmCents: points > 0 ? Math.round((pointsValue * 1000) / points) : null,
      marginPct: priced > 0 ? Math.round((profit / priced) * 1000) / 10 : null,
    },
    monthly: [...byMonth.entries()].map(([month, v]) => ({ month, ...v })),
    topCustomers: [...customers.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    byProgram: [...programs.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
  };
}
