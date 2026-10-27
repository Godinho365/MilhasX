import { Prisma } from "@prisma/client";
import { prisma, DomainError } from "../db";
import { assertWithinLimit } from "./plan-limits";
import { cpmCents, marketValueCents } from "@/domain/ledger";

export async function listHolders(userId: string) {
  return prisma.holder.findMany({ where: { userId }, orderBy: { name: "asc" } });
}

export type AddressParts = { cep?: string; logradouro?: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; uf?: string };

/** Endereço em uma linha (para exibir e exportar): "Rua X, 12, apto 3 – Bairro, Cidade/UF – CEP 00000-000". */
export function formatAddress(p: AddressParts) {
  const street = [p.logradouro, p.numero, p.complemento].filter(Boolean).join(", ");
  const city = [p.cidade, p.uf].filter(Boolean).join("/");
  return [street, [p.bairro, city].filter(Boolean).join(", "), p.cep ? `CEP ${p.cep}` : ""].filter(Boolean).join(" – ") || null;
}

export type HolderDetails = {
  name: string;
  birthDate?: Date | null;
  documents?: { type: string; number: string }[];
  address?: string | null;
  addressParts?: AddressParts | null;
  accessEmail?: string | null;
  attributes?: { key: string; value: string }[];
  notes?: string | null;
  active?: boolean;
};

/** Cria ou atualiza o cadastro completo do titular. */
export async function saveHolder(userId: string, id: string | null, input: HolderDetails) {
  const name = input.name.trim();
  if (!name) throw new DomainError(400, "Informe o nome do titular");
  if (input.birthDate && input.birthDate > new Date()) throw new DomainError(400, "Data de nascimento no futuro");
  const dup = await prisma.holder.findFirst({ where: { userId, name, NOT: id ? { id } : undefined } });
  if (dup) throw new DomainError(409, "Já existe um titular com esse nome");
  const data = {
    name,
    birthDate: input.birthDate === undefined ? undefined : input.birthDate,
    documents: input.documents === undefined ? undefined : input.documents,
    address: input.addressParts !== undefined ? (input.addressParts ? formatAddress(input.addressParts) : null) : input.address === undefined ? undefined : input.address?.trim() || null,
    addressParts: input.addressParts === undefined ? undefined : input.addressParts ?? Prisma.DbNull,
    accessEmail: input.accessEmail === undefined ? undefined : input.accessEmail || null,
    attributes: input.attributes === undefined ? undefined : input.attributes.filter((a) => a.key),
    notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
    active: input.active,
  };
  if (!id) {
    await assertWithinLimit(userId, "holders");
    return prisma.holder.create({ data: { userId, ...data } });
  }
  const h = await prisma.holder.findFirst({ where: { id, userId } });
  if (!h) throw new DomainError(404, "Titular não encontrado");
  return prisma.holder.update({ where: { id }, data });
}

export async function deleteHolder(userId: string, id: string) {
  const h = await prisma.holder.findFirst({ where: { id, userId }, include: { accounts: { include: { _count: { select: { entries: true } } } } } });
  if (!h) throw new DomainError(404, "Titular não encontrado");
  if (h.accounts.some((a) => a._count.entries > 0)) {
    throw new DomainError(409, "O titular tem lançamentos. Exclua os lançamentos antes.");
  }
  await prisma.holder.delete({ where: { id } });
}

export async function createAccount(userId: string, holderId: string, programId: string) {
  const holder = await prisma.holder.findFirst({ where: { id: holderId, userId } });
  if (!holder) throw new DomainError(404, "Titular não encontrado");
  const program = await prisma.program.findFirst({ where: { id: programId, active: true } });
  if (!program) throw new DomainError(404, "Programa não encontrado");
  const dup = await prisma.account.findFirst({ where: { holderId, programId } });
  if (dup) throw new DomainError(409, "Esse titular já tem conta nesse programa");
  await assertWithinLimit(userId, "accounts");
  return prisma.account.create({ data: { userId, holderId, programId } });
}

export async function deleteAccount(userId: string, id: string) {
  const acc = await prisma.account.findFirst({ where: { id, userId }, include: { _count: { select: { entries: true } } } });
  if (!acc) throw new DomainError(404, "Conta não encontrada");
  if (acc._count.entries > 0) throw new DomainError(409, "A conta tem lançamentos. Exclua os lançamentos antes.");
  await prisma.account.delete({ where: { id } });
}

/** Organização da conta: nome, fixar na barra lateral, arquivar, tags e CPFs disponíveis. */
export async function updateAccount(userId: string, id: string, input: { nickname?: string | null; pinned?: boolean; archived?: boolean; tags?: string[]; cpfAvailable?: number | null }) {
  const acc = await prisma.account.findFirst({ where: { id, userId } });
  if (!acc) throw new DomainError(404, "Conta não encontrada");
  return prisma.account.update({
    where: { id },
    data: {
      nickname: input.nickname === undefined ? undefined : input.nickname?.trim() || null,
      pinned: input.pinned,
      archived: input.archived,
      // arquivar tira a conta da barra lateral
      ...(input.archived ? { pinned: false } : {}),
      tags: input.tags === undefined ? undefined : [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))],
      cpfAvailable: input.cpfAvailable,
    },
  });
}

export async function listAccounts(userId: string, holderId?: string) {
  return prisma.account.findMany({
    where: { userId, holderId },
    include: { program: true, holder: true },
    orderBy: [{ holder: { name: "asc" } }, { program: { name: "asc" } }],
  });
}

export async function walletSummary(userId: string, holderId?: string) {
  const [accounts, pending, last] = await Promise.all([
    listAccounts(userId, holderId),
    prisma.entry.groupBy({
      by: ["accountId"],
      where: { userId, status: "PENDING", points: { gt: 0 }, account: holderId ? { holderId } : undefined },
      _sum: { points: true },
    }),
    prisma.entry.groupBy({ by: ["accountId"], where: { userId, account: holderId ? { holderId } : undefined }, _max: { createdAt: true } }),
  ]);
  const pendingBy = new Map(pending.map((p) => [p.accountId, p._sum.points ?? 0]));
  const lastBy = new Map(last.map((l) => [l.accountId, l._max.createdAt]));

  const rows = accounts.map((a) => ({
    id: a.id,
    holderId: a.holderId,
    holderName: a.holder.name,
    programId: a.programId,
    programName: a.program.name,
    programColor: a.program.color,
    programLogo: a.program.logoUpdatedAt?.getTime().toString() ?? null,
    balance: a.balance,
    costCents: a.costCents,
    investedCents: a.investedCents,
    cpmCents: cpmCents(a.costCents, a.balance),
    marketValueCents: marketValueCents(a.balance, a.program.marketValueCpmCents),
    pendingPoints: pendingBy.get(a.id) ?? 0,
    nickname: a.nickname,
    label: a.nickname || `${a.program.name} ${a.holder.name}`,
    pinned: a.pinned,
    archived: a.archived,
    tags: a.tags,
    cpfAvailable: a.cpfAvailable,
    // "Atualizado": último lançamento registrado na conta
    updatedAt: (lastBy.get(a.id) ?? a.createdAt).toISOString(),
  }));

  const sum = (k: "balance" | "costCents" | "investedCents" | "marketValueCents" | "pendingPoints") =>
    rows.reduce((s, r) => s + r[k], 0);
  const totals = {
    balance: sum("balance"),
    costCents: sum("costCents"),
    investedCents: sum("investedCents"),
    marketValueCents: sum("marketValueCents"),
    pendingPoints: sum("pendingPoints"),
    cpmCents: cpmCents(sum("costCents"), sum("balance")),
  };

  const holders = new Map<string, { id: string; name: string; accounts: number; balance: number; marketValueCents: number; costCents: number; cpmCents?: number | null }>();
  for (const r of rows) {
    const h = holders.get(r.holderId) ?? { id: r.holderId, name: r.holderName, accounts: 0, balance: 0, marketValueCents: 0, costCents: 0 };
    h.accounts++;
    h.balance += r.balance;
    h.marketValueCents += r.marketValueCents;
    h.costCents += r.costCents;
    holders.set(r.holderId, h);
  }

  const programs = new Map<string, { id: string; name: string; balance: number; costCents: number }>();
  for (const r of rows) {
    const p = programs.get(r.programId) ?? { id: r.programId, name: r.programName, balance: 0, costCents: 0 };
    p.balance += r.balance;
    p.costCents += r.costCents;
    programs.set(r.programId, p);
  }

  return {
    totals,
    accounts: rows,
    holders: [...holders.values()].map((h) => ({ ...h, cpmCents: cpmCents(h.costCents, h.balance) })).sort((a, b) => b.balance - a.balance),
    programs: [...programs.values()].map((p) => ({ ...p, cpmCents: cpmCents(p.costCents, p.balance) })).sort((a, b) => b.balance - a.balance),
  };
}

/** Evolução diária do saldo total (lançamentos confirmados). */
export async function balanceEvolution(userId: string, opts: { holderId?: string; programId?: string; from?: Date } = {}) {
  const entries = await prisma.entry.findMany({
    where: {
      userId,
      status: "CONFIRMED",
      account: opts.holderId || opts.programId ? { holderId: opts.holderId, programId: opts.programId } : undefined,
    },
    select: { occurredAt: true, points: true, costCents: true },
    orderBy: { occurredAt: "asc" },
  });
  const byDay = new Map<string, { points: number; cost: number }>();
  for (const e of entries) {
    const d = e.occurredAt.toISOString().slice(0, 10);
    const cur = byDay.get(d) ?? { points: 0, cost: 0 };
    cur.points += e.points;
    cur.cost += e.costCents;
    byDay.set(d, cur);
  }
  let balance = 0;
  let cost = 0;
  const fromKey = opts.from?.toISOString().slice(0, 10);
  const series: { date: string; balance: number; costCents: number }[] = [];
  for (const [date, v] of byDay) {
    balance += v.points;
    cost += v.cost;
    if (!fromKey || date >= fromKey) series.push({ date, balance, costCents: cost });
  }
  return series;
}

export async function recentEntries(userId: string, direction: "credit" | "debit", limit = 4, holderId?: string) {
  return prisma.entry.findMany({
    where: { userId, points: direction === "credit" ? { gt: 0 } : { lt: 0 }, account: holderId ? { holderId } : undefined },
    include: { account: { include: { program: true, holder: true } } },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
}

export async function activationProgress(userId: string) {
  const [fav, alerts, credits, transfers, sales] = await Promise.all([
    prisma.favoriteStore.count({ where: { userId } }),
    prisma.alert.count({ where: { userId } }),
    prisma.entry.count({ where: { userId, points: { gt: 0 } } }),
    prisma.entry.count({ where: { userId, type: "TRANSFER_OUT" } }),
    prisma.sale.count({ where: { userId } }),
  ]);
  const steps = [
    { key: "fav", label: "Favoritar lojas preferidas", done: fav > 0, href: "/app/purchases?tab=lojas" },
    { key: "alert", label: "Criar um alerta", done: alerts > 0, href: "/app/purchases?tab=alertas" },
    { key: "entry", label: "Registrar entrada de pontos", done: credits > 0, href: "/app/entries?novo=1" },
    { key: "transfer", label: "Registrar uma transferência", done: transfers > 0, href: "/app/entries?novo=transfer" },
    { key: "sale", label: "Registrar uma venda", done: sales > 0, href: "/app/sales" },
  ];
  return { steps, done: steps.filter((s) => s.done).length };
}

/** Evolução diária por titular: uma série por titular, com saldo e custo acumulados. */
export async function evolutionByHolder(userId: string, opts: { holderId?: string; from?: Date } = {}) {
  const entries = await prisma.entry.findMany({
    where: { userId, status: "CONFIRMED", account: opts.holderId ? { holderId: opts.holderId } : undefined },
    select: { occurredAt: true, points: true, costCents: true, account: { select: { holder: { select: { id: true, name: true } } } } },
    orderBy: { occurredAt: "asc" },
  });
  const holders = new Map<string, string>();
  const days = new Map<string, Map<string, { points: number; cost: number }>>();
  for (const e of entries) {
    const d = e.occurredAt.toISOString().slice(0, 10);
    const h = e.account.holder;
    holders.set(h.id, h.name);
    const byHolder = days.get(d) ?? new Map();
    const cur = byHolder.get(h.id) ?? { points: 0, cost: 0 };
    cur.points += e.points;
    cur.cost += e.costCents;
    byHolder.set(h.id, cur);
    days.set(d, byHolder);
  }
  const running = new Map<string, { points: number; cost: number }>([...holders.keys()].map((k) => [k, { points: 0, cost: 0 }]));
  const fromKey = opts.from?.toISOString().slice(0, 10);
  const todayKey = new Date().toISOString().slice(0, 10);
  const points: Record<string, number | string>[] = [];
  const costs: Record<string, number | string>[] = [];
  const snapshot = (date: string) => {
    const p: Record<string, number | string> = { date };
    const c: Record<string, number | string> = { date };
    for (const [hid, r] of running) {
      p[hid] = r.points;
      c[hid] = r.cost;
    }
    points.push(p);
    costs.push(c);
  };
  const sorted = [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
  let startedAt: string | null = null;
  for (const [date, byHolder] of sorted) {
    // Ponto inicial do período com o saldo acumulado até ali, para as linhas começarem no início
    if (fromKey && startedAt === null && date >= fromKey) {
      startedAt = fromKey;
      if (date > fromKey) snapshot(fromKey);
    }
    for (const [hid, v] of byHolder) {
      const r = running.get(hid)!;
      r.points += v.points;
      r.cost += v.cost;
    }
    if (fromKey && date < fromKey) continue;
    snapshot(date);
  }
  if (fromKey && startedAt === null && holders.size > 0) snapshot(fromKey);
  // Ponto final em "hoje" (lançamentos futuros, se houver, já estão na série)
  if (points.length > 0 && String(points[points.length - 1]!.date) < todayKey) snapshot(todayKey);
  return { holders: [...holders.entries()].map(([id, name]) => ({ id, name })), points, costs };
}

/** Marca qual titular é o próprio usuário ("Minhas contas"). Só um por usuário. */
export async function setSelfHolder(userId: string, holderId: string, isSelf: boolean) {
  const h = await prisma.holder.findFirst({ where: { id: holderId, userId } });
  if (!h) throw new DomainError(404, "Titular não encontrado");
  await prisma.$transaction([
    ...(isSelf ? [prisma.holder.updateMany({ where: { userId, isSelf: true }, data: { isSelf: false } })] : []),
    prisma.holder.update({ where: { id: holderId }, data: { isSelf } }),
  ]);
}

const accountInclude = { account: { include: { program: true, holder: true } } } as const;

/** "Pontos a receber" detalhado: compras pendentes, faturas de cartão fechadas e demais créditos a receber. */
export async function pendingBreakdown(userId: string, holderId?: string) {
  const account = holderId ? { holderId } : undefined;
  const [purchases, entries] = await Promise.all([
    prisma.bonusPurchase.findMany({ where: { userId, status: { in: ["PENDING", "DELIVERED"] }, account }, include: accountInclude, orderBy: { purchasedAt: "desc" } }),
    prisma.entry.findMany({
      where: { userId, status: "PENDING", points: { gt: 0 }, account },
      include: { ...accountInclude, invoice: { include: { card: true } } },
      orderBy: { occurredAt: "asc" },
    }),
  ]);
  const invoices = entries.filter((e) => e.invoice);
  const others = entries.filter((e) => !e.invoice);
  const total = purchases.reduce((s, p) => s + p.expectedPoints, 0) + entries.reduce((s, e) => s + e.points, 0);
  return { purchases, invoices, others, total };
}

/** Painel "Visão Geral": créditos e débitos por mês (mês atual e 3 anteriores) e últimos lançamentos. */
export async function overviewData(userId: string, holderId?: string) {
  const account = holderId ? { holderId } : undefined;
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
  const [moves, recent] = await Promise.all([
    prisma.entry.findMany({ where: { userId, status: "CONFIRMED", occurredAt: { gte: start }, account }, select: { occurredAt: true, points: true } }),
    prisma.entry.findMany({ where: { userId, account }, include: accountInclude, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }], take: 5 }),
  ]);
  const months = Array.from({ length: 4 }, (_, i) => {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    return { month: d.toISOString().slice(0, 7), credits: 0, debits: 0 };
  });
  for (const m of moves) {
    const row = months.find((x) => x.month === m.occurredAt.toISOString().slice(0, 7));
    if (!row) continue;
    if (m.points > 0) row.credits += m.points;
    else row.debits -= m.points;
  }
  return { months, recent };
}
