// Financeiro: contas, lançamentos (receita, despesa, transferência), visão geral, fluxo de caixa e notas fiscais das vendas.
import { randomUUID } from "node:crypto";
import { prisma, DomainError } from "../db";
import { brDay } from "@/domain/brasilia";
import { accountBalance, addMonths, cashflow, periodTotals, type Regime, type Tx } from "@/domain/finance";
import { listSales } from "./sales";

const day = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);
const toTx = (t: { type: string; accountId: string; toAccountId: string | null; amountCents: number; category: string | null; competence: Date; dueDate: Date; paidAt: Date | null }): Tx => ({
  type: t.type as Tx["type"], accountId: t.accountId, toAccountId: t.toAccountId, amountCents: t.amountCents, category: t.category,
  competence: day(t.competence), dueDate: day(t.dueDate), paidAt: t.paidAt ? day(t.paidAt) : null,
});

/* ---------------- Contas ---------------- */

export type FinAccountInput = { name: string; kind: string; initialCents: number; color?: string };

export async function listFinAccounts(userId: string) {
  const [accounts, txs] = await Promise.all([
    prisma.finAccount.findMany({ where: { userId }, orderBy: [{ archived: "asc" }, { createdAt: "asc" }] }),
    prisma.finTransaction.findMany({ where: { userId, paidAt: { not: null } } }),
  ]);
  const all = txs.map(toTx);
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
};

async function checkAccounts(userId: string, input: FinTxInput) {
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
  };
  await prisma.finTransaction.createMany({
    data: Array.from({ length: n }, (_, i) => ({
      ...base,
      competence: monthShift(input.competence, i),
      dueDate: monthShift(input.dueDate, i),
      paidAt: i === 0 && input.paid ? input.dueDate : null,
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
      competence: input.competence, dueDate: input.dueDate, paidAt: input.paid ? t.paidAt ?? input.dueDate : null,
    },
  });
}

/** Marca como pago/recebido (na data informada) ou volta a pendente. */
export async function setFinTxPaid(userId: string, id: string, paid: boolean, date?: Date) {
  const { count } = await prisma.finTransaction.updateMany({ where: { id, userId }, data: { paidAt: paid ? date ?? utc(brDay()) : null } });
  if (!count) throw new DomainError(404, "Lançamento não encontrado");
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
        f.status === "pago" ? { paidAt: { not: null } } : f.status === "pendente" ? { paidAt: null } : {},
        f.accountId ? { OR: [{ accountId: f.accountId }, { toAccountId: f.accountId }] } : {},
      ],
    },
    include: { account: { select: { name: true, color: true } }, toAccount: { select: { name: true } } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });
  const today = brDay();
  return rows.map((t) => ({
    id: t.id, type: t.type, category: t.category, amountCents: t.amountCents, description: t.description, counterpart: t.counterpart,
    accountId: t.accountId, account: t.account.name, accountColor: t.account.color, toAccountId: t.toAccountId, toAccount: t.toAccount?.name ?? null,
    competence: day(t.competence), dueDate: day(t.dueDate), paidAt: t.paidAt ? day(t.paidAt) : null, repeat: !!t.repeatGroup,
    overdue: !t.paidAt && day(t.dueDate) < today,
  }));
}

/* ---------------- Visão geral ---------------- */

/** Receitas e despesas do mês, resultado (lucro das vendas − despesas operacionais), balanço e contas a pagar/receber. */
export async function financeOverview(userId: string, month: string, regime: Regime) {
  const from = utc(`${month}-01`), to = new Date(utc(`${addMonths(month, 1)}-01`).getTime() - 1);
  const [txRows, accounts, sales, milesAcc, unpaidSales] = await Promise.all([
    prisma.finTransaction.findMany({ where: { userId } }),
    listFinAccounts(userId),
    listSales(userId, { from, to: utc(day(to)) }),
    prisma.account.aggregate({ where: { userId, archived: false }, _sum: { costCents: true } }),
    prisma.sale.findMany({ where: { userId, paidAt: null }, select: { totalCents: true, refundedAt: true, refundFeeCents: true } }),
  ]);
  const txs = txRows.map(toTx);
  const p = periodTotals(txs, month, regime);
  const salesProfit = sales.reduce((t, s) => t + s.resultCents, 0);
  const pendingIn = txs.filter((t) => t.type === "INCOME" && !t.paidAt);
  const pendingOut = txs.filter((t) => t.type === "EXPENSE" && !t.paidAt);
  const toReceiveSales = unpaidSales.reduce((t, s) => t + (s.refundedAt ? s.refundFeeCents : s.totalCents), 0);
  const cash = accounts.filter((a) => !a.archived).reduce((t, a) => t + a.balanceCents, 0);
  const miles = milesAcc._sum.costCents ?? 0;
  const receivable = pendingIn.reduce((t, x) => t + x.amountCents, 0) + toReceiveSales;
  const payable = pendingOut.reduce((t, x) => t + x.amountCents, 0);
  const today = brDay();
  const upcoming = async (type: "INCOME" | "EXPENSE") =>
    (await prisma.finTransaction.findMany({ where: { userId, type, paidAt: null }, orderBy: { dueDate: "asc" }, take: 8, select: { id: true, description: true, category: true, amountCents: true, dueDate: true, counterpart: true } }))
      .map((t) => ({ ...t, dueDate: day(t.dueDate), overdue: day(t.dueDate) < today }));
  const [toPay, toReceive] = await Promise.all([upcoming("EXPENSE"), upcoming("INCOME")]);
  return {
    period: p,
    result: { salesProfit, salesCount: sales.filter((s) => !s.refund).length, operational: p.operational, net: salesProfit - p.operational },
    balance: { cash, miles, receivable, toReceiveSales, payable, assets: cash + miles + receivable, equity: cash + miles + receivable - payable },
    accounts: accounts.filter((a) => !a.archived),
    toPay, toReceive,
  };
}

/** Fluxo de caixa de 5 meses centrado no mês escolhido (2 antes, 2 depois). */
export async function financeCashflow(userId: string, month: string) {
  const months = [-2, -1, 0, 1, 2].map((n) => addMonths(month, n));
  const [txRows, accounts] = await Promise.all([prisma.finTransaction.findMany({ where: { userId } }), prisma.finAccount.findMany({ where: { userId }, select: { initialCents: true } })]);
  const txs = txRows.map(toTx);
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
