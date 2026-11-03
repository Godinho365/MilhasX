// Fornecedores, cartões e faturas, guias, novidades, foto de perfil e painel de vendas.
import { expectedCardPoints, invoiceFeeCents } from "@/domain/cards";
import type { CostType } from "@/domain/costs";
import type { GuideKind, GuideLevel, Prisma } from "@prisma/client";
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
  bank?: string | null; brandTier?: string | null; last4?: string | null; printedName?: string | null;
  modality?: string | null; cardType?: string | null; status?: string;
  expMonth?: number | null; expYear?: number | null; limitCents?: number | null; annualFeeMonth?: number | null;
  color?: string | null; benefits?: string[]; benefitsUrl?: string | null; tags?: string[]; notes?: string | null;
}

/** Textos vazios viram nulo; tags e benefícios sem repetição. */
function cardData(input: CardInput) {
  const t = (v?: string | null) => v?.trim() || null;
  return {
    ...input, name: input.name.trim(), brand: t(input.brand), bank: t(input.bank), brandTier: t(input.brandTier), printedName: t(input.printedName?.toUpperCase()),
    benefitsUrl: t(input.benefitsUrl), notes: t(input.notes),
    ...(input.tags ? { tags: [...new Set(input.tags.map((x) => x.trim()).filter(Boolean))] } : {}),
    ...(input.benefits ? { benefits: [...new Set(input.benefits)] } : {}),
  };
}

export async function createCard(userId: string, input: CardInput) {
  const acc = await prisma.account.findFirst({ where: { id: input.accountId, userId } });
  if (!acc) throw new DomainError(404, "Conta não encontrada");
  const card = await prisma.creditCard.create({ data: { ...cardData(input), userId } });
  await prisma.cardActivity.create({ data: { cardId: card.id, kind: "ACTIVITY", text: "Cartão cadastrado" } });
  return card;
}

/** Edita o cartão; as faturas em aberto são recalculadas (pontos e parcela da anuidade). */
export async function updateCard(userId: string, id: string, input: CardInput) {
  const card = await prisma.creditCard.findFirst({ where: { id, userId } });
  if (!card) throw new DomainError(404, "Cartão não encontrado");
  const acc = await prisma.account.findFirst({ where: { id: input.accountId, userId } });
  if (!acc) throw new DomainError(404, "Conta não encontrada");
  const hasClosed = await prisma.cardInvoice.count({ where: { cardId: id, status: "CLOSED" } });
  if (hasClosed && input.accountId !== card.accountId) throw new DomainError(409, "O cartão já tem faturas fechadas nesta conta; a conta que recebe os pontos não pode mudar.");
  const data = { ...cardData(input), feeWaiverCents: input.feeWaiverCents || null };
  const updated = await prisma.creditCard.update({ where: { id }, data });
  const STATUS: Record<string, string> = { ACTIVE: "Ativo", BLOCKED: "Bloqueado", CANCELED: "Cancelado", EXPIRED: "Vencido" };
  await prisma.cardActivity.create({ data: { cardId: id, kind: "ACTIVITY", text: input.status && input.status !== card.status ? `Situação: ${STATUS[card.status] ?? card.status} → ${STATUS[input.status] ?? input.status}` : "Cartão editado" } });
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

/**
 * "Registrar pontos": os pontos da fatura caíram na conta. Confirma o lançamento (ou cria, se a fatura
 * ainda não tinha sido fechada) com a quantidade que realmente entrou; a parcela da anuidade é o custo.
 */
export async function registerInvoicePoints(userId: string, invoiceId: string, input: { points: number; date: Date }) {
  const inv = await prisma.cardInvoice.findFirst({ where: { id: invoiceId, card: { userId } }, include: { card: true, entry: { select: { id: true, status: true } } } });
  if (!inv) throw new DomainError(404, "Fatura não encontrada");
  if (inv.pointsIncluded) throw new DomainError(409, "Os pontos desta fatura já estão no saldo acumulado do cartão");
  if (inv.entry?.status === "CONFIRMED") throw new DomainError(409, "Os pontos desta fatura já foram registrados");
  if (!Number.isInteger(input.points) || input.points <= 0) throw new DomainError(400, "Informe os pontos recebidos");
  if (inv.entry) {
    await updateEntry(userId, inv.entry.id, { points: input.points, occurredAt: input.date, status: "CONFIRMED" });
    return prisma.cardInvoice.update({ where: { id: inv.id }, data: { status: "CLOSED" } });
  }
  const { entry } = await createEntry(userId, {
    accountId: inv.card.accountId,
    type: "CARD",
    points: input.points,
    occurredAt: input.date,
    description: `Fatura ${inv.card.name} (${inv.dueDate.toISOString().slice(0, 10).split("-").reverse().join("/")})`,
    costs: inv.feeCents > 0 ? [{ type: "ANUIDADE", amountCents: inv.feeCents, cardId: inv.cardId }] : undefined,
  });
  return prisma.cardInvoice.update({ where: { id: inv.id }, data: { status: "CLOSED", entryId: entry.id } });
}

export async function deleteInvoice(userId: string, invoiceId: string) {
  const inv = await prisma.cardInvoice.findFirst({ where: { id: invoiceId, card: { userId } } });
  if (!inv) throw new DomainError(404, "Fatura não encontrada");
  if (inv.entryId) await deleteEntry(userId, inv.entryId);
  await prisma.cardInvoice.delete({ where: { id: inv.id } });
}

export async function cardsOverview(userId: string, holderId?: string) {
  const cards = await prisma.creditCard.findMany({
    // com um titular marcado, só os cartões que pontuam em contas dele
    where: { userId, ...(holderId ? { account: { holderId } } : {}) },
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
  let revenue = 0, profit = 0, points = 0, priced = 0, pointsValue = 0, refunds = 0, refundFees = 0;
  // reembolsos esperando o estorno da companhia: milhas bloqueadas e taxas a receber
  const waiting = { sales: 0, points: 0, taxCents: 0 };
  for (const s of sales) {
    if (s.refund) {
      refunds++;
      refundFees += s.refund.feeCents;
      const miles = !s.refund.milesReceivedAt, tax = !s.refund.taxReceivedAt;
      if (miles || tax) waiting.sales++;
      if (miles) waiting.points += s.refund.points;
      if (tax) waiting.taxCents += s.refund.taxCents;
    }
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
      count: sales.length - refunds,
      refunds,
      refundFeesCents: refundFees,
      refundWaiting: waiting,
      // Preço por milheiro e margem sobre o valor dos pontos: taxa de embarque e outros repasses não contam
      avgPriceCpmCents: points > 0 ? Math.round((pointsValue * 1000) / points) : null,
      marginPct: priced > 0 ? Math.round((profit / priced) * 1000) / 10 : null,
    },
    monthly: [...byMonth.entries()].map(([month, v]) => ({ month, ...v })),
    topCustomers: [...customers.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    byProgram: [...programs.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
  };
}
