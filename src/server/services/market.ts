// Alertas de saldo, clientes, vendas, notificações e relatórios.
import type { EntryType, Prisma } from "@prisma/client";
import { prisma, DomainError } from "../db";
import { ENTRY_LABELS } from "@/domain/ledger";

export async function listAlerts(userId: string) {
  return prisma.alert.findMany({
    where: { userId },
    include: { program: true, account: { include: { program: true, holder: true } } },
    orderBy: { createdAt: "desc" },
  });
}

/** Alerta de saldo mínimo: avisa quando o saldo da conta fica abaixo do limite (em pontos). */
export async function createAlert(userId: string, input: { type: "MIN_BALANCE"; accountId?: string; threshold: number }) {
  if (!Number.isInteger(input.threshold) || input.threshold <= 0) throw new DomainError(400, "Limite inválido");
  if (!input.accountId || !(await prisma.account.findFirst({ where: { id: input.accountId, userId } }))) {
    throw new DomainError(400, "Escolha uma conta");
  }
  return prisma.alert.create({ data: { userId, type: "MIN_BALANCE", accountId: input.accountId, threshold: input.threshold } });
}

export async function deleteAlert(userId: string, id: string) {
  const { count } = await prisma.alert.deleteMany({ where: { id, userId } });
  if (!count) throw new DomainError(404, "Alerta não encontrado");
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
  return prisma.notification.findMany({ where: { userId, clearedAt: null }, orderBy: { createdAt: "desc" }, take: 50 });
}
export const unreadCount = (userId: string) => prisma.notification.count({ where: { userId, readAt: null, clearedAt: null } });
export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}
/** Tira tudo da lista. Não apaga: o aviso com key (bônus do mês) continua registrado e não sai de novo. */
export async function clearNotifications(userId: string, now = new Date()) {
  await markAllRead(userId);
  await prisma.notification.updateMany({ where: { userId, clearedAt: null }, data: { clearedAt: now } });
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
  // venda reembolsada: no faturamento fica só a taxa de administração
  const [sales, refunded] = await Promise.all([
    prisma.sale.aggregate({ where: { userId, refundedAt: null, occurredAt: opts.from ? { gte: opts.from } : undefined }, _sum: { totalCents: true, points: true } }),
    prisma.sale.aggregate({ where: { userId, refundedAt: { not: null }, occurredAt: opts.from ? { gte: opts.from } : undefined }, _sum: { refundFeeCents: true } }),
  ]);
  return {
    byCategory: byType
      .map((t) => ({ type: t.type as EntryType, label: ENTRY_LABELS[t.type as EntryType], points: t._sum.points ?? 0, costCents: t._sum.inputCostCents ?? 0 }))
      .sort((a, b) => b.points - a.points),
    byProgram: [...byProgram.entries()].map(([name, points]) => ({ name, points })).sort((a, b) => b.points - a.points),
    sales: { totalCents: (sales._sum.totalCents ?? 0) + (refunded._sum.refundFeeCents ?? 0), points: sales._sum.points ?? 0 },
  };
}
