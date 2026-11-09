// Financeiro: contas, lançamentos (receita, despesa, transferência), visão geral, fluxo de caixa e notas fiscais das vendas.
import { randomUUID } from "node:crypto";
import { prisma, DomainError } from "../db";
import { brDay } from "@/domain/brasilia";
import {
  accountBalance, addMonths, billAdjustTxs, billCashTxs, billDueIn, billKey, cardBills, cardDueDay, cashflow, monthOf, periodTotals, purchaseTxs, saleTxs,
  type Bill, type BillEdit, type BillPayment, type CardDays, type Regime, type Tx,
} from "@/domain/finance";
import { listSales } from "./sales";
import { updateEntry, type CostItemInput } from "./ledger";

const day = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);
type FinRow = { id?: string; type: string; accountId: string; toAccountId: string | null; amountCents: number; category: string | null; competence: Date; dueDate: Date; paidAt: Date | null; description?: string | null; cardId?: string | null };
const toTx = (t: FinRow): Tx => ({
  type: t.type as Tx["type"], accountId: t.accountId, toAccountId: t.toAccountId, amountCents: t.amountCents, category: t.category,
  competence: day(t.competence), dueDate: day(t.dueDate), paidAt: t.paidAt ? day(t.paidAt) : null, description: t.description ?? null,
  ref: t.id ? { kind: "fin", id: t.id } : null,
});
const sumCents = (xs: { amountCents?: number; totalCents?: number }[]) => xs.reduce((t, x) => t + (x.amountCents ?? x.totalCents ?? 0), 0);
const isCharge = (t: Tx) => !!t.cardId && t.type === "EXPENSE";

/* ---------------- Cartões: faturas ---------------- */

/** Cartões do usuário, ajustes das faturas (valor real, vencimento) e pagamentos. */
async function cardContext(userId: string) {
  const [cards, edits, payments] = await Promise.all([
    prisma.creditCard.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, last4: true, color: true, closingDay: true, dueDay: true, active: true } }),
    prisma.cardBill.findMany({ where: { userId }, select: { cardId: true, dueDate: true, realCents: true, dueOverride: true } }),
    prisma.cardBillPayment.findMany({ where: { userId }, select: { id: true, cardId: true, dueDate: true, paidAt: true, amountCents: true, accountId: true } }),
  ]);
  const pays = new Map<string, BillPayment[]>();
  for (const p of payments) {
    const k = billKey(p.cardId, day(p.dueDate));
    pays.set(k, [...(pays.get(k) ?? []), { id: p.id, paidAt: day(p.paidAt), amountCents: p.amountCents, accountId: p.accountId }]);
  }
  return {
    cards: new Map(cards.map((c) => [c.id, c])),
    edits: new Map<string, BillEdit>(edits.map((e) => [billKey(e.cardId, day(e.dueDate)), { realCents: e.realCents, dueOverride: e.dueOverride ? day(e.dueOverride) : null }])),
    payments: pays,
  };
}
type CardCtx = Awaited<ReturnType<typeof cardContext>>;

/** Lançamentos do Financeiro; a despesa no cartão vai para a fatura (pela data da compra). */
function resolveManual(rows: FinRow[], ctx: CardCtx): Tx[] {
  return rows.map((r) => {
    const t = toTx(r);
    const card = r.cardId && t.type === "EXPENSE" ? ctx.cards.get(r.cardId) : undefined;
    return card ? { ...t, cardId: card.id, chargeDay: t.dueDate, dueDate: cardDueDay(t.dueDate, card) } : t;
  });
}

/**
 * Tudo que o Financeiro calcula, num lugar só. Compra no cartão não mexe no caixa no dia da compra: o dinheiro sai
 * quando a fatura é paga. Por isso há duas visões:
 * - cash (regime de caixa, fluxo de caixa, contas a pagar): fora do cartão como sempre + os pagamentos das faturas
 *   e o que falta pagar delas no vencimento;
 * - competence (regime de competência): cada compra no mês dela, e a diferença do valor real da fatura.
 */
async function financeBook(userId: string) {
  const ctx = await cardContext(userId);
  const [rows, automatic] = await Promise.all([prisma.finTransaction.findMany({ where: { userId } }), automaticCashTxs(userId, ctx)]);
  const manual = resolveManual(rows, ctx);
  const all = [...manual, ...automatic];
  const charges = all.filter(isCharge);
  const plain = all.filter((t) => !isCharge(t));
  const bills = cardBills(charges, brDay(), ctx.edits, ctx.payments);
  const billOf = new Map(bills.map((b) => [billKey(b.cardId, b.dueDate), b]));
  const billCash = billCashTxs(bills);
  // a compra no cartão fica paga quando a fatura dela é quitada
  const paidCharges = charges.map((t) => ({ ...t, paidAt: billOf.get(billKey(t.cardId!, t.dueDate))?.paidAt ?? null }));
  return {
    ctx, bills, billOf, billCash,
    manualPlain: manual.filter((t) => !isCharge(t)),
    autoPlain: automatic.filter((t) => !isCharge(t)),
    cash: [...plain, ...billCash],
    competence: [...plain, ...paidCharges, ...billAdjustTxs(bills)],
  };
}
type Book = Awaited<ReturnType<typeof financeBook>>;

/** Cartões para escolher na despesa do Financeiro (com os dias, para mostrar em que fatura cai). */
export const listCardOptions = (userId: string) =>
  prisma.creditCard.findMany({ where: { userId, active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, last4: true, closingDay: true, dueDay: true } });

/** Faturas por cartão: as em aberto (vencidas, a vencer e pagas em parte) e as últimas quitadas. */
export async function listCardBills(userId: string) {
  const { ctx, bills } = await financeBook(userId);
  return [...ctx.cards.values()]
    .map((c) => {
      const mine = bills.filter((b) => b.cardId === c.id);
      const open = mine.filter((b) => b.status !== "paid");
      return {
        id: c.id, name: c.name, last4: c.last4, color: c.color, closingDay: c.closingDay, dueDay: c.dueDay, active: c.active,
        openCents: open.reduce((t, b) => t + b.openCents, 0), overdueCents: open.filter((b) => b.overdue).reduce((t, b) => t + b.openCents, 0),
        open, paid: mine.filter((b) => b.status === "paid").reverse().slice(0, 6),
      };
    })
    .filter((c) => c.open.length || c.paid.length || c.active);
}

async function ownCard(userId: string, cardId: string) {
  const card = await prisma.creditCard.findFirst({ where: { id: cardId, userId }, select: { id: true, closingDay: true, dueDay: true } });
  if (!card) throw new DomainError(404, "Cartão não encontrado");
  return card;
}
async function ownFinAccount(userId: string, accountId: string | null | undefined) {
  if (accountId && !(await prisma.finAccount.count({ where: { id: accountId, userId } }))) throw new DomainError(404, "Conta não encontrada");
}
const findBill = (book: Book, cardId: string, dueDate: string) => {
  const b = book.billOf.get(billKey(cardId, dueDate));
  if (!b) throw new DomainError(404, "Fatura não encontrada");
  return b;
};
const brDate = (ymd: string) => ymd.split("-").reverse().join("/");
/** Conta que paga a fatura, quando não foi escolhida: a das despesas do Financeiro lançadas nela. */
const billAccount = (b: Bill) => b.items.find((i) => i.ref?.kind === "fin" && i.accountId)?.accountId ?? null;

/** Paguei (uma ou várias faturas: paga o que falta de cada uma) ou volta para em aberto (apaga os pagamentos). */
export async function setCardBillsPaid(userId: string, cardId: string, dueDates: string[], paid: boolean, date?: Date, accountId?: string | null) {
  await ownCard(userId, cardId);
  const dates = [...new Set(dueDates)];
  if (!paid) {
    await prisma.cardBillPayment.deleteMany({ where: { userId, cardId, dueDate: { in: dates.map(utc) } } });
    return;
  }
  await ownFinAccount(userId, accountId);
  const book = await financeBook(userId);
  const bills = dates.map((d) => findBill(book, cardId, d)).filter((b) => b.openCents > 0);
  const paidAt = date ?? utc(brDay());
  await prisma.cardBillPayment.createMany({
    data: bills.map((b) => ({ userId, cardId, dueDate: utc(b.dueDate), paidAt, amountCents: b.openCents, accountId: accountId === undefined ? billAccount(b) : accountId })),
  });
}

/** Valor real e vencimento de uma fatura (vazios = os calculados). Serve também para criar a fatura de um mês sem
 *  compras lançadas: o vencimento calculado precisa ser o dia de vencimento do cartão. */
export async function editCardBill(userId: string, cardId: string, dueDate: string, input: { realCents: number | null; dueOverride: Date | null }) {
  const card = await ownCard(userId, cardId);
  if (billDueIn(monthOf(dueDate), card) !== dueDate) throw new DomainError(400, `O vencimento deste cartão é no dia ${card.dueDay}`);
  const where = { cardId_dueDate: { cardId, dueDate: utc(dueDate) } };
  const dueOverride = input.dueOverride && day(input.dueOverride) !== dueDate ? input.dueOverride : null;
  // Vencimento no dia normal do cartão em outro mês, numa fatura sem compras: é a fatura daquele mês (o mês foi
  // escolhido errado ao lançar). Ela muda de mês, com os pagamentos, e as compras daquele mês passam a somar nela.
  const target = dueOverride ? day(dueOverride) : null;
  if (target && billDueIn(monthOf(target), card) === target) {
    const current = (await financeBook(userId)).billOf.get(billKey(cardId, dueDate));
    if (!current?.items.length) {
      if (await prisma.cardBill.count({ where: { userId, cardId, dueDate: utc(target) } })) throw new DomainError(409, `Já existe a fatura que vence em ${brDate(target)}: edite ela`);
      await prisma.$transaction([
        prisma.cardBill.deleteMany({ where: { userId, cardId, dueDate: utc(dueDate) } }),
        ...(input.realCents != null ? [prisma.cardBill.create({ data: { userId, cardId, dueDate: utc(target), realCents: input.realCents } })] : []),
        prisma.cardBillPayment.updateMany({ where: { userId, cardId, dueDate: utc(dueDate) }, data: { dueDate: utc(target) } }),
      ]);
      return { movedTo: target };
    }
  }
  if (input.realCents == null && !dueOverride) {
    await prisma.cardBill.deleteMany({ where: { userId, cardId, dueDate: utc(dueDate) } });
    return { movedTo: null };
  }
  await prisma.cardBill.upsert({ where, create: { userId, cardId, dueDate: utc(dueDate), realCents: input.realCents, dueOverride }, update: { realCents: input.realCents, dueOverride } });
  return { movedTo: null };
}

/** Pagamento de uma fatura (inteiro ou parte). */
export async function addBillPayment(userId: string, cardId: string, dueDate: string, input: { paidAt: Date; amountCents: number; accountId?: string | null }) {
  await ownCard(userId, cardId);
  await ownFinAccount(userId, input.accountId);
  const book = await financeBook(userId);
  const b = book.billOf.get(billKey(cardId, dueDate));
  // fatura de um mês sem nada lançado: aceita o pagamento se o vencimento for o dia do cartão
  if (!b) await editCardBill(userId, cardId, dueDate, { realCents: null, dueOverride: null });
  const p = await prisma.cardBillPayment.create({ data: { userId, cardId, dueDate: utc(dueDate), paidAt: input.paidAt, amountCents: input.amountCents, accountId: input.accountId ?? null } });
  return p.id;
}

export async function updateBillPayment(userId: string, id: string, input: { paidAt: Date; amountCents: number; accountId?: string | null }) {
  await ownFinAccount(userId, input.accountId);
  const { count } = await prisma.cardBillPayment.updateMany({ where: { id, userId }, data: { paidAt: input.paidAt, amountCents: input.amountCents, accountId: input.accountId ?? null } });
  if (!count) throw new DomainError(404, "Pagamento não encontrado");
}

export async function deleteBillPayment(userId: string, id: string) {
  const { count } = await prisma.cardBillPayment.deleteMany({ where: { id, userId } });
  if (!count) throw new DomainError(404, "Pagamento não encontrado");
}

/**
 * Adiciona uma compra na fatura (despesa do Financeiro no cartão, na data da compra). A data precisa cair nesta
 * fatura. Com o valor real informado, a compra soma a ele (addToReal); sem, a fatura já é a soma das compras.
 */
export async function addBillItem(userId: string, input: { cardId: string; dueDate: string; amountCents: number; day: Date; description?: string | null; category?: string | null; accountId: string; addToReal: boolean }) {
  const card = await ownCard(userId, input.cardId);
  if (billDueIn(monthOf(input.dueDate), card) !== input.dueDate) throw new DomainError(400, `O vencimento deste cartão é no dia ${card.dueDay}`);
  const goesTo = cardDueDay(day(input.day), card);
  if (goesTo !== input.dueDate) throw new DomainError(400, `Com essa data a compra vai para a fatura que vence em ${brDate(goesTo)}`);
  if (!(await prisma.finAccount.count({ where: { id: input.accountId, userId } }))) throw new DomainError(404, "Conta não encontrada");
  await prisma.$transaction(async (tx) => {
    const t = await tx.finTransaction.create({
      data: {
        userId, type: "EXPENSE", accountId: input.accountId, cardId: card.id, amountCents: input.amountCents,
        category: input.category?.trim() || null, description: input.description?.trim() || null, competence: input.day, dueDate: input.day,
      },
      select: { id: true },
    });
    if (input.addToReal) {
      const where = { cardId_dueDate: { cardId: card.id, dueDate: utc(input.dueDate) } };
      const b = await tx.cardBill.findUnique({ where, select: { realCents: true } });
      if (b?.realCents != null) await tx.cardBill.update({ where, data: { realCents: b.realCents + input.amountCents } });
    }
    return t.id;
  });
}

/**
 * Edita uma compra a partir da fatura: valor, data e cartão (outro cartão ou nenhum, que tira da fatura).
 * Despesa do Financeiro: muda o lançamento. Compra do Extrato: muda as linhas de custo deste cartão (valor só
 * quando é à vista e numa linha só; parcelada se edita no Extrato, para o parcelamento continuar certo).
 */
export async function editBillItem(userId: string, input: { kind: "fin" | "entry"; id: string; cardId: string; amountCents?: number; day?: Date; newCardId: string | null }) {
  if (input.newCardId) await ownCard(userId, input.newCardId);
  if (input.kind === "fin") {
    const t = await prisma.finTransaction.findFirst({ where: { id: input.id, userId, type: "EXPENSE" } });
    if (!t) throw new DomainError(404, "Lançamento não encontrado");
    const sameDay = t.competence.getTime() === t.dueDate.getTime();
    await prisma.finTransaction.update({
      where: { id: t.id },
      data: { amountCents: input.amountCents ?? t.amountCents, dueDate: input.day ?? t.dueDate, ...(input.day && sameDay ? { competence: input.day } : {}), cardId: input.newCardId, paidAt: null },
    });
    return;
  }
  const e = await prisma.entry.findFirst({ where: { id: input.id, userId }, include: { costs: true } });
  if (!e) throw new DomainError(404, "Lançamento não encontrado");
  const mine = e.costs.filter((c) => c.cardId === input.cardId);
  if (!mine.length) throw new DomainError(404, "Esta compra não está neste cartão");
  const current = mine.reduce((t, c) => t + c.amountCents, 0);
  const changeValue = input.amountCents != null && input.amountCents !== current;
  if (changeValue && (e.details as { payment?: unknown } | null)?.payment) throw new DomainError(400, "Compra parcelada: para mudar o valor, edite o lançamento no Extrato");
  if (changeValue && mine.length > 1) throw new DomainError(400, "Esta compra tem mais de uma linha de custo neste cartão: mude o valor no Extrato");
  await updateEntry(userId, e.id, {
    costs: e.costs.map((c) => ({
      type: c.type as CostItemInput["type"],
      amountCents: changeValue && c.cardId === input.cardId ? input.amountCents! : c.amountCents,
      cardId: c.cardId === input.cardId ? input.newCardId : c.cardId,
    })),
    ...(input.day ? { occurredAt: input.day } : {}),
  });
}

/* ---------------- Contas ---------------- */

export type FinAccountInput = { name: string; kind: string; initialCents: number; color?: string };

export async function listFinAccounts(userId: string, book?: Book) {
  const [accounts, b] = await Promise.all([
    prisma.finAccount.findMany({ where: { userId }, orderBy: [{ archived: "asc" }, { createdAt: "asc" }] }),
    book ?? financeBook(userId),
  ]);
  // compra no cartão não mexe na conta; o pagamento da fatura sai da conta escolhida nele; a venda paga entra na
  // conta em que foi recebida
  const received = b.autoPlain.filter((t) => t.source === "sales" && t.accountId && t.paidAt);
  const all = [...b.manualPlain, ...b.billCash, ...received];
  return accounts.map((a) => ({
    id: a.id, name: a.name, kind: a.kind, color: a.color, archived: a.archived, initialCents: a.initialCents, balanceCents: accountBalance(a.id, a.initialCents, all),
    salesCents: sumCents(received.filter((t) => t.accountId === a.id)), // vendas recebidas nela
  }));
}

export async function saveFinAccount(userId: string, id: string | null, input: FinAccountInput) {
  const data = { name: input.name.trim(), kind: input.kind, initialCents: input.initialCents, ...(input.color ? { color: input.color } : {}) };
  if (!id) return (await prisma.finAccount.create({ data: { userId, ...data } })).id;
  const { count } = await prisma.finAccount.updateMany({ where: { id, userId }, data });
  if (!count) throw new DomainError(404, "Conta não encontrada");
  return id;
}

/** Conta com lançamentos é arquivada (o histórico fica); vazia é excluída. */
export async function deleteFinAccount(userId: string, id: string) {
  const a = await prisma.finAccount.findFirst({ where: { id, userId }, include: { _count: { select: { outgoing: true, incoming: true, billPayments: true, sales: true } } } });
  if (!a) throw new DomainError(404, "Conta não encontrada");
  if (a._count.outgoing + a._count.incoming + a._count.billPayments + a._count.sales > 0) {
    await prisma.finAccount.update({ where: { id }, data: { archived: true } });
    return "archived" as const;
  }
  await prisma.finAccount.delete({ where: { id } });
  return "deleted" as const;
}

/* ---------------- Lançamentos ---------------- */

export type FinTxInput = {
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  accountId: string;
  toAccountId?: string | null;
  category?: string | null;
  amountCents: number;
  description?: string | null;
  counterpart?: string | null;
  competence: Date;
  dueDate: Date;
  paid: boolean;
  repeatMonths?: number; // 1 = só este; até 36 cópias mensais
  cardId?: string | null; // despesa no cartão: dueDate é a data da compra; fica paga quando a fatura é paga
};

async function checkAccounts(userId: string, input: FinTxInput) {
  if (input.cardId) {
    if (input.type !== "EXPENSE") throw new DomainError(400, "Só despesa pode ser lançada no cartão");
    if (!(await prisma.creditCard.count({ where: { id: input.cardId, userId } }))) throw new DomainError(404, "Cartão não encontrado");
  }
  const ids = [input.accountId, ...(input.type === "TRANSFER" && input.toAccountId ? [input.toAccountId] : [])];
  if (input.type === "TRANSFER") {
    if (!input.toAccountId) throw new DomainError(400, "Escolha a conta de destino");
    if (input.toAccountId === input.accountId) throw new DomainError(400, "Origem e destino precisam ser contas diferentes");
  }
  if ((await prisma.finAccount.count({ where: { id: { in: ids }, userId } })) !== ids.length) throw new DomainError(404, "Conta não encontrada");
}

const monthShift = (d: Date, n: number) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), Math.min(d.getUTCDate(), last)));
};

/** Cria o lançamento; com repetição, os meses seguintes entram pendentes (só o primeiro pode nascer pago). */
export async function createFinTx(userId: string, input: FinTxInput) {
  await checkAccounts(userId, input);
  const n = Math.min(36, Math.max(1, input.repeatMonths ?? 1));
  const group = n > 1 ? randomUUID() : null;
  const base = {
    userId, type: input.type, accountId: input.accountId, toAccountId: input.type === "TRANSFER" ? input.toAccountId! : null,
    category: input.type === "TRANSFER" ? null : input.category?.trim() || null, amountCents: input.amountCents,
    description: input.description?.trim() || null, counterpart: input.counterpart?.trim() || null, repeatGroup: group,
    cardId: input.type === "EXPENSE" ? input.cardId ?? null : null,
  };
  await prisma.finTransaction.createMany({
    data: Array.from({ length: n }, (_, i) => ({
      ...base,
      competence: monthShift(input.competence, i),
      dueDate: monthShift(input.dueDate, i),
      paidAt: i === 0 && input.paid && !base.cardId ? input.dueDate : null, // no cartão, paga com a fatura
    })),
  });
  return n;
}

export async function updateFinTx(userId: string, id: string, input: FinTxInput) {
  const t = await prisma.finTransaction.findFirst({ where: { id, userId } });
  if (!t) throw new DomainError(404, "Lançamento não encontrado");
  await checkAccounts(userId, input);
  await prisma.finTransaction.update({
    where: { id },
    data: {
      type: input.type, accountId: input.accountId, toAccountId: input.type === "TRANSFER" ? input.toAccountId! : null,
      category: input.type === "TRANSFER" ? null : input.category?.trim() || null, amountCents: input.amountCents,
      description: input.description?.trim() || null, counterpart: input.counterpart?.trim() || null,
      competence: input.competence, dueDate: input.dueDate, cardId: input.type === "EXPENSE" ? input.cardId ?? null : null,
      paidAt: input.paid && !(input.type === "EXPENSE" && input.cardId) ? t.paidAt ?? input.dueDate : null,
    },
  });
}

/** Marca como pago/recebido (na data informada) ou volta a pendente. */
export async function setFinTxPaid(userId: string, id: string, paid: boolean, date?: Date) {
  const t = await prisma.finTransaction.findFirst({ where: { id, userId }, select: { cardId: true, type: true } });
  if (!t) throw new DomainError(404, "Lançamento não encontrado");
  if (t.cardId && t.type === "EXPENSE") throw new DomainError(409, "Esta despesa está no cartão: ela fica paga quando você marca a fatura como paga em Financeiro › Faturas");
  await prisma.finTransaction.update({ where: { id }, data: { paidAt: paid ? date ?? utc(brDay()) : null } });
}

export async function deleteFinTx(userId: string, id: string) {
  const { count } = await prisma.finTransaction.deleteMany({ where: { id, userId } });
  if (!count) throw new DomainError(404, "Lançamento não encontrado");
}

/** Lançamentos do mês no regime escolhido (caixa: pela data de pagamento/vencimento; competência: pelo mês a que pertencem). */
export async function listFinTx(userId: string, month: string, regime: Regime, f: { type?: string; status?: "pago" | "pendente"; accountId?: string } = {}) {
  const from = utc(`${month}-01`), to = utc(`${addMonths(month, 1)}-01`);
  const range = { gte: from, lt: to };
  const rows = await prisma.finTransaction.findMany({
    where: {
      userId,
      type: f.type || undefined,
      AND: [
        regime === "competencia" ? { competence: range } : { OR: [{ paidAt: range }, { paidAt: null, dueDate: range }] },
        f.accountId ? { OR: [{ accountId: f.accountId }, { toAccountId: f.accountId }] } : {},
      ],
    },
    include: { account: { select: { name: true, color: true } }, toAccount: { select: { name: true } } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });
  const today = brDay();
  const { ctx, billOf } = await financeBook(userId);
  return rows
    .map((t) => {
      // no cartão: a data é a da compra; vence e fica paga com a fatura
      const card = t.cardId && t.type === "EXPENSE" ? ctx.cards.get(t.cardId) : undefined;
      const bill = card ? billOf.get(billKey(card.id, cardDueDay(day(t.dueDate), card))) : undefined;
      const billDue = bill?.effectiveDue ?? null;
      const paidAt = card ? bill?.paidAt ?? null : t.paidAt ? day(t.paidAt) : null;
      return {
        id: t.id, type: t.type, category: t.category, amountCents: t.amountCents, description: t.description, counterpart: t.counterpart,
        accountId: t.accountId, account: t.account.name, accountColor: t.account.color, toAccountId: t.toAccountId, toAccount: t.toAccount?.name ?? null,
        competence: day(t.competence), dueDate: day(t.dueDate), paidAt, repeat: !!t.repeatGroup,
        cardId: card?.id ?? null, card: card?.name ?? null, billDue,
        overdue: !paidAt && (billDue ?? day(t.dueDate)) < today,
      };
    })
    .filter((t) => (f.status === "pago" ? !!t.paidAt : f.status === "pendente" ? !t.paidAt : true));
}

/* ---------------- Visão geral ---------------- */

/** Receitas e despesas do mês (as do Financeiro + vendas e custos do Extrato, que entram sozinhos), resultado
 *  (lucro das vendas − despesas operacionais), balanço e contas a pagar/receber. */
export async function financeOverview(userId: string, month: string, regime: Regime) {
  const from = utc(`${month}-01`), to = new Date(utc(`${addMonths(month, 1)}-01`).getTime() - 1);
  const book = await financeBook(userId);
  const { ctx } = book;
  const [accounts, sales, milesAcc, unpaidSales] = await Promise.all([
    listFinAccounts(userId, book),
    listSales(userId, { from, to: utc(day(to)) }),
    prisma.account.aggregate({ where: { userId, archived: false }, _sum: { costCents: true } }),
    prisma.sale.findMany({ where: { userId, paidAt: null }, select: { totalCents: true, refundedAt: true, refundFeeCents: true } }),
  ]);
  const txs = book.manualPlain;
  const p = periodTotals(regime === "caixa" ? book.cash : book.competence, month, regime);
  const salesProfit = sales.reduce((t, s) => t + s.resultCents, 0);
  const pendingIn = txs.filter((t) => t.type === "INCOME" && !t.paidAt);
  const toReceiveSales = unpaidSales.reduce((t, s) => t + (s.refundedAt ? s.refundFeeCents : s.totalCents), 0);
  const cash = accounts.filter((a) => !a.archived).reduce((t, a) => t + a.balanceCents, 0);
  const miles = milesAcc._sum.costCents ?? 0;
  const receivable = pendingIn.reduce((t, x) => t + x.amountCents, 0) + toReceiveSales;
  // tudo que ainda vai sair: despesas pendentes, o que falta pagar das faturas e parcelas a vencer fora do cartão
  const payable = sumCents(book.cash.filter((t) => t.type === "EXPENSE" && !t.paidAt));
  const toPayBills = book.bills.reduce((t, b) => t + b.openCents, 0);
  const toPayPurchases = sumCents(book.autoPlain.filter((t) => t.type === "EXPENSE" && !t.paidAt));
  const today = brDay();
  const upcoming = async (type: "INCOME" | "EXPENSE") =>
    (await prisma.finTransaction.findMany({ where: { userId, type, paidAt: null, cardId: null }, orderBy: { dueDate: "asc" }, take: 8, select: { id: true, description: true, category: true, amountCents: true, dueDate: true, counterpart: true } }))
      .map((t) => ({ ...t, dueDate: day(t.dueDate), overdue: day(t.dueDate) < today }));
  const [manualToPay, toReceive] = await Promise.all([upcoming("EXPENSE"), upcoming("INCOME")]);
  // faturas em aberto entram em Contas a pagar como uma linha por fatura
  const bills = book.bills.filter((b) => b.openCents > 0).map((b) => ({
    id: `fatura:${b.cardId}:${b.dueDate}`, description: `Fatura ${ctx.cards.get(b.cardId)?.name ?? "do cartão"}`, category: null, amountCents: b.openCents,
    dueDate: b.effectiveDue, counterpart: b.status === "partial" ? `falta pagar de ${(b.totalCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : `${b.items.length} ${b.items.length === 1 ? "compra" : "compras"}`, overdue: b.overdue,
  }));
  const toPay = [...manualToPay, ...bills].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 8);
  return {
    period: p,
    result: { salesProfit, salesCount: sales.filter((s) => !s.refund).length, operational: p.operational, net: salesProfit - p.operational },
    balance: { cash, miles, receivable, toReceiveSales, payable, toPayPurchases, toPayBills, assets: cash + miles + receivable, equity: cash + miles + receivable - payable },
    accounts: accounts.filter((a) => !a.archived),
    toPay, toReceive,
  };
}

/** Vendas e custos do Extrato que entram sozinhos no fluxo de caixa (não precisam ser lançados no Financeiro). */
async function automaticCashTxs(userId: string, ctx: CardCtx): Promise<Tx[]> {
  const today = brDay();
  const [entries, sales] = await Promise.all([
    // custo informado nos créditos (compra de pontos, clube, taxa de transferência...): o que saiu do bolso
    prisma.entry.findMany({ where: { userId, ignored: false, inputCostCents: { gt: 0 } }, select: { id: true, occurredAt: true, inputCostCents: true, description: true, details: true, costs: { select: { amountCents: true, cardId: true } } } }),
    prisma.sale.findMany({
      where: { userId },
      select: {
        id: true, groupId: true, occurredAt: true, paidAt: true, finAccountId: true, totalCents: true, refundedAt: true, refundFeeCents: true, origin: true, partnerCommissionCents: true, customer: { select: { name: true } },
        items: { select: { issuedWith: true, points: true, cashCostCents: true, supplierCpmCents: true, costs: true } },
      },
    }),
  ]);
  const card = (id: unknown): CardDays | null => (typeof id === "string" ? ctx.cards.get(id) ?? null : null);
  const cardId = (id: unknown) => (typeof id === "string" && ctx.cards.has(id) ? id : null);
  const fromEntries = entries.flatMap((e) => {
    const pay = (e.details as { payment?: { installments?: number; anticipated?: boolean } } | null)?.payment;
    // lançamentos em lote guardam só o total, sem as linhas de custo
    const costs = e.costs.length ? e.costs.map((c) => ({ amountCents: c.amountCents, card: card(c.cardId), cardId: cardId(c.cardId) })) : [{ amountCents: e.inputCostCents, card: null }];
    return purchaseTxs({ day: day(e.occurredAt), costs, installments: pay?.installments, anticipated: pay?.anticipated, description: e.description, ref: { kind: "entry", id: e.id } }, today);
  });
  const fromSales = sales.flatMap((s) => saleTxs({
    day: day(s.occurredAt), paidAt: s.paidAt ? day(s.paidAt) : null, accountId: s.finAccountId, totalCents: s.totalCents, refunded: !!s.refundedAt, refundFeeCents: s.refundFeeCents,
    description: `Custos da venda${s.customer ? ` · ${s.customer.name}` : ""}`, ref: { kind: "sale", id: s.groupId ?? s.id },
    costs: [
      ...s.items.flatMap((i) => [
        { amountCents: i.cashCostCents, card: null },
        { amountCents: s.origin === "SUPPLIER" && i.issuedWith === "POINTS" ? Math.round((i.points * (i.supplierCpmCents ?? 0)) / 1000) : 0, card: null },
        ...(Array.isArray(i.costs) ? (i.costs as { amountCents?: number; cardId?: string | null }[]) : []).map((c) => ({ amountCents: c.amountCents ?? 0, card: card(c.cardId), cardId: cardId(c.cardId) })),
      ]),
      { amountCents: s.partnerCommissionCents, card: null },
    ],
  }, today));
  return [...fromEntries, ...fromSales];
}

/** Fluxo de caixa de 5 meses centrado no mês escolhido (2 antes, 2 depois): lançamentos do Financeiro + vendas e custos do Extrato. */
export async function financeCashflow(userId: string, month: string) {
  const months = [-2, -1, 0, 1, 2].map((n) => addMonths(month, n));
  const [book, accounts] = await Promise.all([financeBook(userId), prisma.finAccount.findMany({ where: { userId }, select: { initialCents: true } })]);
  const txs = book.cash;
  // saldo antes da janela: saldos iniciais + tudo que já foi pago antes do primeiro mês
  const before = txs.filter((t) => t.type !== "TRANSFER" && (t.paidAt ?? t.dueDate).slice(0, 7) < months[0]!);
  const start = accounts.reduce((s, a) => s + a.initialCents, 0) + before.reduce((s, t) => s + (t.type === "INCOME" ? t.amountCents : -t.amountCents), 0);
  return { months: cashflow(txs, months, start), start };
}

/* ---------------- Notas fiscais das vendas ---------------- */

/** Vendas do mês com a nota (número e data) e o valor do serviço (o lucro da venda). */
export async function salesForInvoices(userId: string, month: string, filter: "todas" | "pendentes" | "emitidas" = "todas") {
  const from = utc(`${month}-01`), to = utc(day(new Date(utc(`${addMonths(month, 1)}-01`).getTime() - 86_400_000)));
  const [sales, nf] = await Promise.all([
    listSales(userId, { from, to }),
    prisma.sale.findMany({ where: { userId, occurredAt: { gte: new Date(from.getTime() - 86_400_000), lt: new Date(to.getTime() + 2 * 86_400_000) } }, select: { id: true, nfNumber: true, nfIssuedAt: true } }),
  ]);
  const byId = new Map(nf.map((n) => [n.id, n]));
  return sales
    .map((s) => ({ id: s.id, date: s.date, description: s.description, customers: s.customers, totalCents: s.totalCents, serviceCents: Math.max(0, s.resultCents), refunded: !!s.refund, nfNumber: byId.get(s.id)?.nfNumber ?? null, nfIssuedAt: byId.get(s.id)?.nfIssuedAt ? day(byId.get(s.id)!.nfIssuedAt!) : null }))
    .filter((s) => (filter === "pendentes" ? !s.nfNumber : filter === "emitidas" ? !!s.nfNumber : true));
}

/** Registra (ou apaga, com número vazio) a nota fiscal emitida para a venda. */
export async function setSaleInvoice(userId: string, saleId: string, input: { number: string | null; date?: Date }) {
  const number = input.number?.trim() || null;
  const { count } = await prisma.sale.updateMany({ where: { id: saleId, userId }, data: { nfNumber: number, nfIssuedAt: number ? input.date ?? utc(brDay()) : null } });
  if (!count) throw new DomainError(404, "Venda não encontrada");
}
