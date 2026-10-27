import { Prisma, type EntryType, type EntryStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma, DomainError, type Tx } from "../db";
import { replayLedger, isCredit, ENTRY_LABELS, MANUAL_CREDIT_TYPES, MANUAL_DEBIT_TYPES } from "@/domain/ledger";
import { costTypesFor, type CostType } from "@/domain/costs";

/**
 * Toda alteração no extrato roda numa transação que:
 * 1. trava o usuário (advisory lock) para serializar operações concorrentes;
 * 2. grava os lançamentos;
 * 3. refaz o replay de todo o extrato do usuário e atualiza custos e saldos.
 * Se o replay falhar (ex.: saldo negativo), a transação inteira é desfeita.
 */
export async function withLedger<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
      const result = await fn(tx);
      await recalc(tx, userId);
      return result;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 20_000 },
  );
}

export async function recalc(tx: Tx, userId: string) {
  const [entries, accounts] = await Promise.all([
    tx.entry.findMany({ where: { userId } }),
    tx.account.findMany({ where: { userId }, select: { id: true, balance: true, costCents: true, investedCents: true } }),
  ]);
  const r = replayLedger(entries);
  if (!r.ok) {
    const e = entries.find((x) => x.id === r.entryId);
    const when = e ? ` (${e.occurredAt.toISOString().slice(0, 10)})` : "";
    throw new DomainError(422, r.erro + when);
  }
  for (const e of entries) {
    const cost = r.entryCosts.get(e.id) ?? 0;
    if (cost !== e.costCents) await tx.entry.update({ where: { id: e.id }, data: { costCents: cost } });
  }
  for (const a of accounts) {
    const s = r.accounts.get(a.id) ?? { balance: 0, costCents: 0, investedCents: 0 };
    if (s.balance !== a.balance || s.costCents !== a.costCents || s.investedCents !== a.investedCents) {
      await tx.account.update({
        where: { id: a.id },
        data: { balance: s.balance, costCents: s.costCents, investedCents: s.investedCents },
      });
    }
  }
  await checkBalanceAlerts(tx, userId);
}

async function checkBalanceAlerts(tx: Tx, userId: string) {
  const alerts = await tx.alert.findMany({
    where: { userId, type: "MIN_BALANCE", active: true, accountId: { not: null } },
    include: { account: { include: { program: true, holder: true } } },
  });
  for (const al of alerts) {
    const acc = al.account!;
    const below = acc.balance < al.threshold;
    if (below && !al.lastTriggeredAt) {
      await tx.notification.create({
        data: {
          userId,
          title: "Saldo abaixo do mínimo",
          body: `${acc.program.name} de ${acc.holder.name} está com ${acc.balance} pontos (mínimo ${al.threshold}).`,
        },
      });
      await tx.alert.update({ where: { id: al.id }, data: { lastTriggeredAt: new Date() } });
    } else if (!below && al.lastTriggeredAt) {
      await tx.alert.update({ where: { id: al.id }, data: { lastTriggeredAt: null } });
    }
  }
}

export async function ownAccount(tx: Tx, userId: string, accountId: string) {
  const acc = await tx.account.findFirst({ where: { id: accountId, userId }, include: { program: true, holder: true } });
  if (!acc) throw new DomainError(404, "Conta não encontrada");
  return acc;
}

/** Idempotência: a mesma chave de envio devolve a operação já gravada em vez de duplicar. */
async function findByKey(userId: string, key?: string | null) {
  if (!key) return null;
  return prisma.entry.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: key } } });
}

function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export const MANUAL_TYPES = [...MANUAL_CREDIT_TYPES, ...MANUAL_DEBIT_TYPES] as const;

export interface CostItemInput {
  type: CostType;
  amountCents: number;
  cardId?: string | null;
}

export interface NewEntryInput {
  accountId: string;
  type: (typeof MANUAL_TYPES)[number];
  points: number; // sempre positivo; o sinal vem do tipo
  costCents?: number;
  costs?: CostItemInput[]; // quando informado, o custo do crédito é a soma dos itens
  storeId?: string | null;
  details?: Prisma.InputJsonValue | null;
  occurredAt: Date;
  description?: string;
  reference?: string | null;
  status?: EntryStatus;
  idempotencyKey?: string | null;
}

export async function createEntry(userId: string, input: NewEntryInput) {
  if (!MANUAL_TYPES.includes(input.type)) throw new DomainError(400, "Tipo de lançamento inválido");
  if (!Number.isInteger(input.points) || input.points <= 0) throw new DomainError(400, "Quantidade de pontos inválida");
  const credit = isCredit(input.type);
  if (!credit && input.costCents) throw new DomainError(400, "Débitos não têm custo informado");
  const allowed = costTypesFor(input.type);
  for (const c of input.costs ?? []) {
    if (!allowed.includes(c.type)) throw new DomainError(400, `Tipo de custo inválido para ${ENTRY_LABELS[input.type]}`);
    if (!Number.isInteger(c.amountCents) || c.amountCents < 0) throw new DomainError(400, "Valor de custo inválido");
  }
  const costSum = input.costs?.length ? input.costs.reduce((t, c) => t + c.amountCents, 0) : (input.costCents ?? 0);
  const existing = await findByKey(userId, input.idempotencyKey);
  if (existing) return { entry: existing, duplicated: true };
  try {
    const entry = await withLedger(userId, async (tx) => {
      await ownAccount(tx, userId, input.accountId);
      const cardIds = [...new Set((input.costs ?? []).map((c) => c.cardId).filter((x): x is string => !!x))];
      if (cardIds.length && (await tx.creditCard.count({ where: { id: { in: cardIds }, userId } })) !== cardIds.length) {
        throw new DomainError(404, "Cartão não encontrado");
      }
      let description = input.description?.trim() || defaultDescription(input.type, input.points);
      if (input.storeId) {
        const store = await tx.store.findUnique({ where: { id: input.storeId } });
        if (!store) throw new DomainError(404, "Loja não encontrada");
        if (!input.description?.trim()) description = `Compra em ${store.name}`;
      }
      return tx.entry.create({
        data: {
          userId,
          accountId: input.accountId,
          type: input.type,
          status: input.status ?? "CONFIRMED",
          points: credit ? input.points : -input.points,
          inputCostCents: credit ? costSum : 0,
          occurredAt: input.occurredAt,
          description,
          reference: input.reference ?? null,
          storeId: input.storeId ?? null,
          details: input.details ?? undefined,
          idempotencyKey: input.idempotencyKey ?? null,
          costs: input.costs?.length ? { create: input.costs.map((c) => ({ type: c.type, amountCents: c.amountCents, cardId: c.cardId ?? null })) } : undefined,
        },
      });
    });
    return { entry, duplicated: false };
  } catch (e) {
    if (isUniqueViolation(e)) {
      const again = await findByKey(userId, input.idempotencyKey);
      if (again) return { entry: again, duplicated: true };
    }
    throw e;
  }
}

function defaultDescription(type: EntryType, points: number) {
  if (type === "PURCHASE") return `Compra de pontos (${points.toLocaleString("pt-BR")} pontos)`;
  return ENTRY_LABELS[type];
}

export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  points: number;
  bonusPercent: number;
  occurredAt: Date;
  description?: string | null;
  parityFrom?: number; // paridade origem:destino (ex.: 3:2)
  parityTo?: number;
  feeCents?: number; // taxas adicionais, somadas ao custo levado
  purchase?: { points: number; priceCents: number; applyAll: boolean } | null; // compra de pontos no carrinho
  deliveryDate?: Date | null; // previsão de entrega diferente
  idempotencyKey?: string | null;
}

/** Pontos que chegam no destino: aplica a paridade e depois o bônus. */
export function transferAmounts(points: number, bonusPercent: number, parityFrom = 1, parityTo = 1) {
  const base = Math.floor((points * parityTo) / parityFrom);
  const bonus = Math.floor((base * bonusPercent) / 100);
  return { base, bonus, total: base + bonus };
}

export async function createTransfer(userId: string, input: TransferInput) {
  if (input.fromAccountId === input.toAccountId) throw new DomainError(400, "Origem e destino precisam ser diferentes");
  if (!Number.isInteger(input.points) || input.points <= 0) throw new DomainError(400, "Quantidade de pontos inválida");
  if (input.bonusPercent < 0 || input.bonusPercent > 300) throw new DomainError(400, "Bônus inválido");
  const pf = input.parityFrom ?? 1;
  const pt = input.parityTo ?? 1;
  if (!Number.isInteger(pf) || !Number.isInteger(pt) || pf <= 0 || pt <= 0 || pf > 1000 || pt > 1000) throw new DomainError(400, "Paridade inválida");
  if (input.purchase && (!Number.isInteger(input.purchase.points) || input.purchase.points <= 0 || input.purchase.priceCents < 0)) {
    throw new DomainError(400, "Compra de pontos inválida");
  }
  if (input.purchase && input.purchase.points > input.points) throw new DomainError(400, "A compra no carrinho não pode ser maior que a transferência");
  if ((input.feeCents ?? 0) < 0) throw new DomainError(400, "Taxas inválidas");
  const amounts = transferAmounts(input.points, input.bonusPercent, pf, pt);
  if (amounts.base <= 0) throw new DomainError(400, "Com essa paridade nenhum ponto chega ao destino");
  const pendingDelivery = !!input.deliveryDate && input.deliveryDate > new Date();
  const existing = await findByKey(userId, input.idempotencyKey);
  if (existing) return { groupId: existing.groupId!, duplicated: true };
  const groupId = randomUUID();
  const createdAt = new Date();
  try {
    await withLedger(userId, async (tx) => {
      const from = await ownAccount(tx, userId, input.fromAccountId);
      const to = await ownAccount(tx, userId, input.toAccountId);
      const base = { userId, occurredAt: input.occurredAt, createdAt, groupId };
      // Compra de pontos no carrinho: entra na origem um instante antes da transferência
      if (input.purchase) {
        await tx.entry.create({
          data: {
            userId,
            accountId: from.id,
            type: "PURCHASE",
            points: input.purchase.points,
            inputCostCents: input.purchase.priceCents,
            occurredAt: input.occurredAt,
            createdAt: new Date(createdAt.getTime() - 1),
            description: `Compra de pontos para transferência (${input.purchase.points.toLocaleString("pt-BR")} pontos)`,
            costs: { create: [{ type: "PONTOS", amountCents: input.purchase.priceCents }] },
          },
        });
      }
      await tx.entry.create({
        data: {
          ...base,
          accountId: from.id,
          type: "TRANSFER_OUT",
          points: -input.points,
          description: input.description?.trim() || `Transferência para ${to.program.name} ${to.holder.name}`,
          idempotencyKey: input.idempotencyKey ?? null,
          priorityPoints: input.purchase?.applyAll ? input.purchase.points : null,
          priorityCostCents: input.purchase?.applyAll ? input.purchase.priceCents : null,
          details: pf !== 1 || pt !== 1 ? { parityFrom: pf, parityTo: pt } : undefined,
        },
      });
      const destination = {
        ...base,
        accountId: to.id,
        occurredAt: input.deliveryDate ?? input.occurredAt,
        status: (pendingDelivery ? "PENDING" : "CONFIRMED") as EntryStatus,
      };
      await tx.entry.create({
        data: {
          ...destination,
          type: "TRANSFER_IN",
          points: amounts.base,
          inputCostCents: input.feeCents ?? 0,
          description: `Transferência de ${from.program.name} ${from.holder.name}`,
          costs: input.feeCents ? { create: [{ type: "OUTROS", amountCents: input.feeCents }] } : undefined,
        },
      });
      if (amounts.bonus > 0) {
        await tx.entry.create({
          data: {
            ...destination,
            type: "TRANSFER_BONUS",
            points: amounts.bonus,
            description: `Bônus de transferência (${input.bonusPercent}%)`,
          },
        });
      }
    });
    return { groupId, duplicated: false };
  } catch (e) {
    if (isUniqueViolation(e)) {
      const again = await findByKey(userId, input.idempotencyKey);
      if (again) return { groupId: again.groupId!, duplicated: true };
    }
    throw e;
  }
}

export async function updateEntry(
  userId: string,
  entryId: string,
  patch: { points?: number; costCents?: number; costs?: CostItemInput[]; occurredAt?: Date; description?: string; status?: EntryStatus },
) {
  return withLedger(userId, async (tx) => {
    const e = await tx.entry.findFirst({ where: { id: entryId, userId } });
    if (!e) throw new DomainError(404, "Lançamento não encontrado");
    const onlyStatus = patch.points === undefined && patch.costCents === undefined && patch.costs === undefined && patch.occurredAt === undefined && patch.description === undefined;
    if (e.groupId && onlyStatus && patch.status === "CONFIRMED") {
      // Transferência com entrega futura: confirma todas as pernas pendentes do grupo
      await tx.entry.updateMany({ where: { userId, groupId: e.groupId, status: "PENDING" }, data: { status: "CONFIRMED" } });
      return tx.entry.findUniqueOrThrow({ where: { id: e.id } });
    }
    if (e.groupId) throw new DomainError(400, "Transferências e vendas não podem ser editadas; exclua e registre de novo");
    const credit = e.points > 0;
    if (patch.points !== undefined && (!Number.isInteger(patch.points) || patch.points <= 0)) {
      throw new DomainError(400, "Quantidade de pontos inválida");
    }
    // Custos detalhados: substituem os itens anteriores; no crédito, o custo passa a ser a soma
    let costSum: number | undefined = credit && patch.costCents !== undefined ? patch.costCents : undefined;
    if (patch.costs) {
      const allowed = costTypesFor(e.type);
      for (const c of patch.costs) if (!allowed.includes(c.type)) throw new DomainError(400, `Tipo de custo inválido para ${ENTRY_LABELS[e.type]}`);
      const cardIds = [...new Set(patch.costs.map((c) => c.cardId).filter((x): x is string => !!x))];
      if (cardIds.length && (await tx.creditCard.count({ where: { id: { in: cardIds }, userId } })) !== cardIds.length) throw new DomainError(404, "Cartão não encontrado");
      await tx.entryCost.deleteMany({ where: { entryId: e.id } });
      if (patch.costs.length) await tx.entryCost.createMany({ data: patch.costs.map((c) => ({ entryId: e.id, type: c.type, amountCents: c.amountCents, cardId: c.cardId ?? null })) });
      if (credit) costSum = patch.costs.reduce((t, c) => t + c.amountCents, 0);
    }
    return tx.entry.update({
      where: { id: e.id },
      data: {
        points: patch.points !== undefined ? (credit ? patch.points : -patch.points) : undefined,
        inputCostCents: costSum,
        occurredAt: patch.occurredAt,
        description: patch.description?.trim() || undefined,
        status: patch.status,
      },
    });
  });
}

/** Exclui um lançamento; se fizer parte de uma transferência/venda, exclui o grupo inteiro. */
export async function deleteEntry(userId: string, entryId: string) {
  return withLedger(userId, async (tx) => {
    const e = await tx.entry.findFirst({ where: { id: entryId, userId } });
    if (!e) throw new DomainError(404, "Lançamento não encontrado");
    const where = e.groupId ? { userId, groupId: e.groupId } : { id: e.id };
    const { count } = await tx.entry.deleteMany({ where });
    if (e.groupId) await tx.sale.deleteMany({ where: { userId, groupId: e.groupId } });
    return { deleted: count };
  });
}

export interface EntryFilter {
  holderId?: string;
  programId?: string;
  accountId?: string;
  type?: EntryType;
  direction?: "credit" | "debit";
  status?: EntryStatus;
  from?: Date;
  to?: Date;
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: "occurredAt" | "points" | "costCents";
  order?: "asc" | "desc";
  cardId?: string;
  minPoints?: number;
  maxPoints?: number;
  minCost?: number; // centavos, em valor absoluto
  maxCost?: number;
  outdated?: boolean; // pontos a receber com a data já passada
  excludeIgnored?: boolean;
}

const INT4_MAX = 2_147_483_647; // colunas Int do Postgres

/** Faixa em valor absoluto (créditos são positivos e débitos negativos). */
function absRange(field: "points" | "costCents", min?: number, max?: number): Prisma.EntryWhereInput | undefined {
  if (min === undefined && max === undefined) return undefined;
  const lo = min ?? 0;
  const hi = Math.min(max ?? INT4_MAX, INT4_MAX);
  return { OR: [{ [field]: { gte: lo, lte: hi } }, { [field]: { gte: -hi, lte: -lo } }] };
}

/** Marca o lançamento (ou a operação inteira) como ignorado nos relatórios; o saldo não muda. */
export async function setEntryIgnored(userId: string, id: string, ignored: boolean) {
  const e = await prisma.entry.findFirst({ where: { id, userId }, select: { groupId: true } });
  if (!e) throw new DomainError(404, "Lançamento não encontrado");
  await prisma.entry.updateMany({ where: e.groupId ? { userId, groupId: e.groupId } : { id, userId }, data: { ignored } });
}

export async function listEntries(userId: string, f: EntryFilter) {
  const pageSize = Math.min(Math.max(f.pageSize ?? 20, 1), 100);
  const page = Math.max(f.page ?? 1, 1);
  const where: Prisma.EntryWhereInput = {
    userId,
    accountId: f.accountId,
    type: f.type,
    status: f.status,
    points: f.direction === "credit" ? { gt: 0 } : f.direction === "debit" ? { lt: 0 } : undefined,
    occurredAt: f.from || f.to ? { gte: f.from, lte: f.to } : undefined,
    description: f.q ? { contains: f.q, mode: "insensitive" } : undefined,
    account: f.holderId || f.programId ? { holderId: f.holderId, programId: f.programId } : undefined,
    costs: f.cardId ? { some: { cardId: f.cardId } } : undefined,
    ignored: f.excludeIgnored ? false : undefined,
    AND: [
      absRange("points", f.minPoints, f.maxPoints),
      absRange("costCents", f.minCost, f.maxCost),
      f.outdated ? { status: "PENDING" as const, occurredAt: { lt: new Date() } } : null,
    ].filter((x): x is Prisma.EntryWhereInput => !!x),
  };
  const sort = f.sort ?? "occurredAt";
  const order = f.order ?? "desc";
  const [total, items] = await Promise.all([
    prisma.entry.count({ where }),
    prisma.entry.findMany({
      where,
      include: { account: { include: { program: true, holder: true } } },
      orderBy: [{ [sort]: order }, { createdAt: order }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)), items };
}

/** Lote: vários lançamentos numa única transação (tudo ou nada). */
export async function createEntriesBatch(userId: string, items: Omit<NewEntryInput, "idempotencyKey">[], batchKey?: string | null) {
  if (items.length === 0 || items.length > 200) throw new DomainError(400, "O lote precisa ter entre 1 e 200 linhas");
  for (const [i, it] of items.entries()) {
    if (!MANUAL_TYPES.includes(it.type)) throw new DomainError(400, `Linha ${i + 1}: tipo inválido`);
    if (!Number.isInteger(it.points) || it.points <= 0) throw new DomainError(400, `Linha ${i + 1}: pontos inválidos`);
    if (!isCredit(it.type) && it.costCents) throw new DomainError(400, `Linha ${i + 1}: débitos não têm custo`);
  }
  const firstKey = batchKey ? `${batchKey}#0` : null;
  const existing = await findByKey(userId, firstKey);
  if (existing) return { created: 0, duplicated: true };
  try {
    const created = await withLedger(userId, async (tx) => {
      const createdAt = new Date();
      for (const [i, it] of items.entries()) {
        await ownAccount(tx, userId, it.accountId);
        const credit = isCredit(it.type);
        await tx.entry.create({
          data: {
            userId,
            accountId: it.accountId,
            type: it.type,
            status: it.status ?? "CONFIRMED",
            points: credit ? it.points : -it.points,
            inputCostCents: credit ? (it.costCents ?? 0) : 0,
            occurredAt: it.occurredAt,
            createdAt: new Date(createdAt.getTime() + i),
            description: it.description?.trim() || defaultDescription(it.type, it.points),
            idempotencyKey: batchKey ? `${batchKey}#${i}` : null,
          },
        });
      }
      return items.length;
    });
    return { created, duplicated: false };
  } catch (e) {
    if (isUniqueViolation(e) && (await findByKey(userId, firstKey))) return { created: 0, duplicated: true };
    throw e;
  }
}

/** Exclui vários lançamentos; pernas de transferência/venda levam o grupo inteiro junto. */
export async function deleteEntries(userId: string, ids: string[]) {
  if (ids.length === 0 || ids.length > 500) throw new DomainError(400, "Selecione entre 1 e 500 lançamentos");
  return withLedger(userId, async (tx) => {
    const found = await tx.entry.findMany({ where: { userId, id: { in: ids } }, select: { id: true, groupId: true } });
    if (found.length !== new Set(ids).size) throw new DomainError(404, "Lançamento não encontrado");
    const groups = [...new Set(found.map((f) => f.groupId).filter((g): g is string => !!g))];
    const { count } = await tx.entry.deleteMany({
      where: { userId, OR: [{ id: { in: found.map((f) => f.id) } }, ...(groups.length ? [{ groupId: { in: groups } }] : [])] },
    });
    if (groups.length) await tx.sale.deleteMany({ where: { userId, groupId: { in: groups } } });
    return { deleted: count };
  });
}

/** Últimos lançamentos manuais distintos (descrição + conta), para reaproveitar no formulário. */
export async function recentTemplates(userId: string, direction: "credit" | "debit", limit = 4) {
  const rows = await prisma.entry.findMany({
    where: { userId, groupId: null, points: direction === "credit" ? { gt: 0 } : { lt: 0 } },
    include: { account: { include: { program: true, holder: true } } },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  const seen = new Set<string>();
  const out = [];
  for (const r of rows) {
    const k = `${r.accountId}|${r.type}|${r.description}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      accountId: r.accountId,
      type: r.type,
      points: Math.abs(r.points),
      costCents: r.inputCostCents,
      description: r.description,
      account: `${r.account.program.name} ${r.account.holder.name}`,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  const safe = /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[",;\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function exportEntriesCsv(userId: string, f: EntryFilter) {
  const rows = [["data", "programa", "titular", "tipo", "descricao", "pontos", "custo_reais", "cpm_reais", "status"]];
  let page = 1;
  for (;;) {
    const r = await listEntries(userId, { ...f, page, pageSize: 100 });
    for (const e of r.items) {
      const cpm = e.points > 0 && e.costCents > 0 ? ((e.costCents * 1000) / e.points / 100).toFixed(2) : "";
      rows.push([
        e.occurredAt.toISOString().slice(0, 10),
        e.account.program.name,
        e.account.holder.name,
        ENTRY_LABELS[e.type],
        e.description,
        String(e.points),
        (e.costCents / 100).toFixed(2),
        cpm,
        e.status === "PENDING" ? "a receber" : "confirmado",
      ]);
    }
    if (page >= r.pages) break;
    page++;
  }
  return rows.map((r) => r.map(csvCell).join(";")).join("\n");
}

/** "Ver detalhes": lançamento com custos, detalhes do resgate, loja, recorrência de origem e demais partes da operação. */
export async function entryDetail(userId: string, entryId: string) {
  const e = await prisma.entry.findFirst({
    where: { id: entryId, userId },
    include: {
      account: { include: { program: true, holder: true } },
      costs: { include: { card: { select: { id: true, name: true } } } },
    },
  });
  if (!e) throw new DomainError(404, "Lançamento não encontrado");
  const recId = e.idempotencyKey?.startsWith("rec:") ? e.idempotencyKey.split(":")[1] : null;
  const [recurrence, legs, store] = await Promise.all([
    recId ? prisma.recurrence.findFirst({ where: { id: recId, userId }, select: { id: true, description: true, frequency: true, active: true } }) : null,
    e.groupId
      ? prisma.entry.findMany({ where: { userId, groupId: e.groupId, NOT: { id: e.id } }, include: { account: { include: { program: true, holder: true } } }, orderBy: { createdAt: "asc" } })
      : [],
    e.storeId ? prisma.store.findUnique({ where: { id: e.storeId }, select: { name: true } }) : null,
  ]);
  return { entry: e, recurrence, legs, store };
}
