// Financeiro: contas, lançamentos (receita, despesa, transferência), visão geral, fluxo de caixa e notas fiscais das vendas.
import { randomUUID } from "node:crypto";
import { prisma, DomainError } from "../db";
import { brDay } from "@/domain/brasilia";
import { accountBalance, addMonths, billKey, cardBills, cardDueDay, cashflow, periodTotals, purchaseTxs, saleTxs, withBillPayments, type CardDays, type Regime, type Tx } from "@/domain/finance";
import { listSales } from "./sales";

const day = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);
type FinRow = { type: string; accountId: string; toAccountId: string | null; amountCents: number; category: string | null; competence: Date; dueDate: Date; paidAt: Date | null; description?: string | null; cardId?: string | null };
const toTx = (t: FinRow): Tx => ({
  type: t.type as Tx["type"], accountId: t.accountId, toAccountId: t.toAccountId, amountCents: t.amountCents, category: t.category,
  competence: day(t.competence), dueDate: day(t.dueDate), paidAt: t.paidAt ? day(t.paidAt) : null, description: t.description ?? null,
});
const sumCents = (xs: { amountCents?: number; totalCents?: number }[]) => xs.reduce((t, x) => t + (x.amountCents ?? x.totalCents ?? 0), 0);

/* ---------------- Cartões: faturas ---------------- */

/** Cartões do usuário e as faturas que ele já marcou como pagas. */
async function cardContext(userId: string) {
  const [cards, payments] = await Promise.all([
    prisma.creditCard.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, last4: true, color: true, closingDay: true, dueDay: true, active: true } }),
    prisma.cardBillPayment.findMany({ where: { userId }, select: { cardId: true, dueDate: true, paidAt: true, amountCents: true } }),
  ]);
  return {
    cards: new Map(cards.map((c) => [c.id, c])),
    paid: new Map(payments.map((p) => [billKey(p.cardId, day(p.dueDate)), day(p.paidAt)])),
    paidCents: new Map(payments.map((p) => [billKey(p.cardId, day(p.dueDate)), p.amountCents])),
  };
}
type CardCtx = Awaited<ReturnType<typeof cardContext>>;

/** Lançamentos do Financeiro; a despesa no cartão vence na fatura (pela data da compra) e fica paga quando a fatura é paga. */
function resolveManual(rows: FinRow[], ctx: CardCtx): Tx[] {
  return withBillPayments(rows.map((r) => {
    const t = toTx(r);
    const card = r.cardId && t.type === "EXPENSE" ? ctx.cards.get(r.cardId) : undefined;
    return card ? { ...t, cardId: card.id, chargeDay: t.dueDate, dueDate: cardDueDay(t.dueDate, card) } : t;
  }), ctx.paid);
}

/** Todas as faturas: compras no cartão do Extrato, custos das vendas e despesas do Financeiro no cartão. */
async function allBills(userId: string, ctx: CardCtx) {
  const [rows, automatic] = await Promise.all([prisma.finTransaction.findMany({ where: { userId, type: "EXPENSE", cardId: { not: null } } }), automaticCashTxs(userId, ctx)]);
  return cardBills([...resolveManual(rows, ctx), ...automatic], brDay());
}

/** Cartões para escolher na despesa do Financeiro (com os dias, para mostrar em que fatura cai). */
export const listCardOptions = (userId: string) =>
  prisma.creditCard.findMany({ where: { userId, active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, last4: true, closingDay: true, dueDay: true } });

/** Faturas por cartão: as em aberto (vencidas e a vencer) e as últimas pagas. */
export async function listCardBills(userId: string) {
  const ctx = await cardContext(userId);
  const bills = await allBills(userId, ctx);
  return [...ctx.cards.values()]
    .map((c) => {
      const mine = bills.filter((b) => b.cardId === c.id).map((b) => ({ ...b, paidCents: ctx.paidCents.get(billKey(c.id, b.dueDate)) ?? null }));
      const open = mine.filter((b) => !b.paidAt);
      return {
        id: c.id, name: c.name, last4: c.last4, color: c.color, closingDay: c.closingDay, dueDay: c.dueDay, active: c.active,
        openCents: sumCents(open), overdueCents: sumCents(open.filter((b) => b.overdue)), open, paid: mine.filter((b) => b.paidAt).reverse().slice(0, 6),
      };
    })
    .filter((c) => c.open.length || c.paid.length || c.active);
}

/** Marca faturas do cartão como pagas (na data informada; o valor da fatura fica guardado) ou volta a em aberto. */
export async function setCardBillsPaid(userId: string, cardId: string, dueDates: string[], paid: boolean, date?: Date) {
  const ctx = await cardContext(userId);
  if (!ctx.cards.has(cardId)) throw new DomainError(404, "Cartão não encontrado");
  const dates = [...new Set(dueDates)];
  if (!paid) {
    await prisma.cardBillPayment.deleteMany({ where: { userId, cardId, dueDate: { in: dates.map(utc) } } });
    return;
  }
  const bills = (await allBills(userId, ctx)).filter((b) => b.cardId === cardId);
  const found = dates.map((d) => bills.find((b) => b.dueDate === d));
  if (found.some((b) => !b)) throw new DomainError(404, "Fatura não encontrada");
  const paidAt = date ?? utc(brDay());
  await prisma.$transaction(found.map((b) => prisma.cardBillPayment.upsert({
    where: { cardId_dueDate: { cardId, dueDate: utc(b!.dueDate) } },
    create: { userId, cardId, dueDate: utc(b!.dueDate), paidAt, amountCents: b!.totalCents },
    update: { paidAt, amountCents: b!.totalCents },
  })));
}

/* ---------------- Contas ---------------- */

export type FinAccountInput = { name: string; kind: string; initialCents: number; color?: string };

export async function listFinAccounts(userId: string, ctx?: CardCtx) {
  const [accounts, txs, cards] = await Promise.all([
    prisma.finAccount.findMany({ where: { userId }, orderBy: [{ archived: "asc" }, { createdAt: "asc" }] }),
    prisma.finTransaction.findMany({ where: { userId, OR: [{ paidAt: { not: null } }, { cardId: { not: null } }] } }),
    ctx ?? cardContext(userId),
  ]);
  // despesa no cartão sai da conta quando a fatura é paga
  const all = resolveManual(txs, cards);
  return accounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind, color: a.color, archived: a.archived, initialCents: a.initialCents, balanceCents: accountBalance(a.id, a.initialCents, all) }));
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
  const a = await prisma.finAccount.findFirst({ where: { id, userId }, include: { _count: { select: { outgoing: true, incoming: true } } } });
  if (!a) throw new DomainError(404, "Conta não encontrada");
  if (a._count.outgoing + a._count.incoming > 0) {
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
  const ctx = await cardContext(userId);
  return rows
    .map((t) => {
      // no cartão: a data é a da compra; vence e fica paga com a fatura
      const card = t.cardId && t.type === "EXPENSE" ? ctx.cards.get(t.cardId) : undefined;
      const billDue = card ? cardDueDay(day(t.dueDate), card) : null;
      const paidAt = card ? ctx.paid.get(billKey(card.id, billDue!)) ?? null : t.paidAt ? day(t.paidAt) : null;
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
  const ctx = await cardContext(userId);
  const [txRows, accounts, sales, milesAcc, unpaidSales, automatic] = await Promise.all([
    prisma.finTransaction.findMany({ where: { userId } }),
    listFinAccounts(userId, ctx),
    listSales(userId, { from, to: utc(day(to)) }),
    prisma.account.aggregate({ where: { userId, archived: false }, _sum: { costCents: true } }),
    prisma.sale.findMany({ where: { userId, paidAt: null }, select: { totalCents: true, refundedAt: true, refundFeeCents: true } }),
    automaticCashTxs(userId, ctx),
  ]);
  const txs = resolveManual(txRows, ctx);
  const p = periodTotals([...txs, ...automatic], month, regime);
  const salesProfit = sales.reduce((t, s) => t + s.resultCents, 0);
  const pendingIn = txs.filter((t) => t.type === "INCOME" && !t.paidAt);
  const toReceiveSales = unpaidSales.reduce((t, s) => t + (s.refundedAt ? s.refundFeeCents : s.totalCents), 0);
  const cash = accounts.filter((a) => !a.archived).reduce((t, a) => t + a.balanceCents, 0);
  const miles = milesAcc._sum.costCents ?? 0;
  const receivable = pendingIn.reduce((t, x) => t + x.amountCents, 0) + toReceiveSales;
  // tudo que ainda vai sair: despesas pendentes, faturas dos cartões em aberto e parcelas a vencer fora do cartão
  const unpaidOut = [...txs, ...automatic].filter((t) => t.type === "EXPENSE" && !t.paidAt);
  const toPayBills = sumCents(unpaidOut.filter((t) => t.cardId));
  const toPayPurchases = sumCents(automatic.filter((t) => t.type === "EXPENSE" && !t.paidAt && !t.cardId));
  const payable = sumCents(unpaidOut);
  const today = brDay();
  const upcoming = async (type: "INCOME" | "EXPENSE") =>
    (await prisma.finTransaction.findMany({ where: { userId, type, paidAt: null, cardId: null }, orderBy: { dueDate: "asc" }, take: 8, select: { id: true, description: true, category: true, amountCents: true, dueDate: true, counterpart: true } }))
      .map((t) => ({ ...t, dueDate: day(t.dueDate), overdue: day(t.dueDate) < today }));
  const [manualToPay, toReceive] = await Promise.all([upcoming("EXPENSE"), upcoming("INCOME")]);
  // faturas em aberto entram em Contas a pagar como uma linha por fatura
  const bills = cardBills([...txs, ...automatic], today).filter((b) => !b.paidAt).map((b) => ({
    id: `fatura:${b.cardId}:${b.dueDate}`, description: `Fatura ${ctx.cards.get(b.cardId)?.name ?? "do cartão"}`, category: null, amountCents: b.totalCents,
    dueDate: b.dueDate, counterpart: `${b.items.length} ${b.items.length === 1 ? "compra" : "compras"}`, overdue: b.overdue,
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
    prisma.entry.findMany({ where: { userId, ignored: false, inputCostCents: { gt: 0 } }, select: { occurredAt: true, inputCostCents: true, description: true, details: true, costs: { select: { amountCents: true, cardId: true } } } }),
    prisma.sale.findMany({
      where: { userId },
      select: {
        occurredAt: true, paidAt: true, totalCents: true, refundedAt: true, refundFeeCents: true, origin: true, partnerCommissionCents: true, customer: { select: { name: true } },
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
    return purchaseTxs({ day: day(e.occurredAt), costs, installments: pay?.installments, anticipated: pay?.anticipated, description: e.description }, today);
  });
  const fromSales = sales.flatMap((s) => saleTxs({
    day: day(s.occurredAt), paidAt: s.paidAt ? day(s.paidAt) : null, totalCents: s.totalCents, refunded: !!s.refundedAt, refundFeeCents: s.refundFeeCents,
    description: `Custos da venda${s.customer ? ` · ${s.customer.name}` : ""}`,
    costs: [
      ...s.items.flatMap((i) => [
        { amountCents: i.cashCostCents, card: null },
        { amountCents: s.origin === "SUPPLIER" && i.issuedWith === "POINTS" ? Math.round((i.points * (i.supplierCpmCents ?? 0)) / 1000) : 0, card: null },
        ...(Array.isArray(i.costs) ? (i.costs as { amountCents?: number; cardId?: string | null }[]) : []).map((c) => ({ amountCents: c.amountCents ?? 0, card: card(c.cardId), cardId: cardId(c.cardId) })),
      ]),
      { amountCents: s.partnerCommissionCents, card: null },
    ],
  }, today));
  return withBillPayments([...fromEntries, ...fromSales], ctx.paid);
}

/** Fluxo de caixa de 5 meses centrado no mês escolhido (2 antes, 2 depois): lançamentos do Financeiro + vendas e custos do Extrato. */
export async function financeCashflow(userId: string, month: string) {
  const months = [-2, -1, 0, 1, 2].map((n) => addMonths(month, n));
  const ctx = await cardContext(userId);
  const [txRows, accounts, automatic] = await Promise.all([prisma.finTransaction.findMany({ where: { userId } }), prisma.finAccount.findMany({ where: { userId }, select: { initialCents: true } }), automaticCashTxs(userId, ctx)]);
  const txs = [...resolveManual(txRows, ctx), ...automatic];
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
