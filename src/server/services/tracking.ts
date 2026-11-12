// Acompanhamentos: lê os itens das vendas (não reembolsadas) e monta as listas por tipo, os indicadores e o
// mapa de viagens. A marcação de cada trecho (check-in feito, reserva confirmada) e a companhia/horários podem
// ser completados aqui, sem abrir a venda.
import type { Prisma } from "@prisma/client";
import { prisma, DomainError, audit } from "../db";
import { addDays, diffDays } from "@/domain/calendar";
import {
  TRACK_TABS, HISTORY_DAYS, brNow, byWhen, inRange, mapTrips, periodRange, previousRange, rowsOf, trackKpis,
  type Now, type Period, type TrackItem, type TrackRow, type TrackTab,
} from "@/domain/tracking";

const utc = (d: string) => new Date(`${d}T00:00:00Z`);
const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;
/** Período personalizado de no máximo dois anos. */
const MAX_CUSTOM_DAYS = 731;

const select = {
  id: true, saleId: true, kind: true, origin: true, destination: true, departureDate: true, returnDate: true, departureTime: true, returnTime: true,
  provider: true, reservation: true, passengers: true, description: true, salePriceCents: true, costs: true, doneOutAt: true, doneRetAt: true,
  customers: { select: { id: true, name: true }, orderBy: { name: "asc" } },
  sale: {
    select: {
      issuerIds: true, customer: { select: { id: true, name: true } },
      account: { select: { program: { select: { name: true } } } }, supplierAccount: { select: { program: { select: { name: true } } } },
    },
  },
} satisfies Prisma.SaleItemSelect;
type Row = Prisma.SaleItemGetPayload<{ select: typeof select }>;

const costsOf = (c: unknown) => (Array.isArray(c) ? c.reduce((t: number, x: { amountCents?: number }) => t + (x?.amountCents ?? 0), 0) : 0);
function toItem(i: Row): TrackItem {
  return {
    id: i.id, saleId: i.saleId, kind: i.kind, origin: i.origin, destination: i.destination,
    departureDate: day(i.departureDate), returnDate: day(i.returnDate), departureTime: i.departureTime, returnTime: i.returnTime,
    provider: i.provider, reservation: i.reservation, passengers: i.passengers, description: i.description,
    customers: i.customers.length ? i.customers : i.sale.customer ? [i.sale.customer] : [],
    issuerIds: i.sale.issuerIds, valueCents: i.salePriceCents + costsOf(i.costs),
    program: i.sale.account?.program.name ?? i.sale.supplierAccount?.program.name ?? null,
    doneOutAt: i.doneOutAt?.toISOString() ?? null, doneRetAt: i.doneRetAt?.toISOString() ?? null,
  };
}

/** Itens das vendas não reembolsadas, dos tipos pedidos, com algum dia a partir de `from` (e começando até `to`). */
async function loadItems(userId: string, kinds: readonly string[], from: string, to: string | null) {
  const rows = await prisma.saleItem.findMany({
    where: {
      sale: { userId, refundedAt: null }, kind: { in: [...kinds] },
      departureDate: { not: null, ...(to ? { lte: utc(to) } : {}) },
      OR: [{ departureDate: { gte: utc(from) } }, { returnDate: { gte: utc(from) } }],
    },
    select, orderBy: { departureDate: "asc" }, take: 5000,
  });
  return rows.map(toItem);
}

export type TrackingList = Awaited<ReturnType<typeof trackingList>>;

/**
 * A lista de uma aba no período: as linhas, quantas há em cada período pronto (Próximos, 7, 30, Todos), os
 * indicadores e o valor do período anterior (para comparar). "Todos" vai de um ano atrás em diante.
 */
export async function trackingList(userId: string, tab: TrackTab, period: Period, custom: { from?: string | null; to?: string | null } = {}, now: Now = brNow()) {
  const today = now.day;
  if (period === "custom") {
    if (!custom.from || !custom.to || custom.to < custom.from) throw new DomainError(400, "Escolha o começo e o fim do período");
    if (diffDays(custom.to, custom.from) > MAX_CUSTOM_DAYS) throw new DomainError(400, "Período de no máximo dois anos");
  }
  const range = periodRange(period, today, custom);
  const prev = previousRange(range);
  const history = addDays(today, -HISTORY_DAYS);
  const from = [history, range.from, prev?.from].filter((x): x is string => !!x).sort()[0]!;
  const items = await loadItems(userId, TRACK_TABS[tab].kinds, from, null);
  const all = items.flatMap(rowsOf).sort(byWhen);
  const rows = all.filter((r) => inRange(r, range));
  const counts = { proximos: 0, "7": 0, "30": 0, todos: 0 };
  for (const k of Object.keys(counts) as (keyof typeof counts)[]) counts[k] = all.filter((r) => inRange(r, periodRange(k, today))).length;
  // "Outro" sem data é, em geral, venda de milhas (CRM Milhas): não é serviço de viagem pendente
  const undated = await prisma.saleItem.count({ where: { sale: { userId, refundedAt: null }, kind: { in: TRACK_TABS[tab].kinds.filter((k) => k !== "OTHER") }, departureDate: null } });
  return {
    tab, period, range, today, rows, counts, undated,
    kpis: trackKpis(rows, today),
    prevValueCents: prev ? all.filter((r) => inRange(r, prev)).reduce((t, r) => t + r.valueCents, 0) : null,
  };
}

/** Mapa: quem está viajando, embarca em 48h ou volta hoje. */
export async function trackingMap(userId: string, now: Now = brNow()) {
  const [flights, stays] = await Promise.all([
    // ida e volta emitidas separadas: a volta pode estar meses à frente da ida
    loadItems(userId, ["FLIGHT"], addDays(now.day, -120), addDays(now.day, 240)),
    loadItems(userId, ["HOTEL", "CRUISE"], addDays(now.day, -1), addDays(now.day, 3)),
  ]);
  const trips = mapTrips([...flights, ...stays], now);
  return { now, trips };
}

/** Marca/desmarca o trecho e completa companhia e horários do item. */
export async function patchTracking(userId: string, itemId: string, b: { doneOut?: boolean; doneRet?: boolean; provider?: string | null; departureTime?: string | null; returnTime?: string | null }, actorId?: string) {
  const it = await prisma.saleItem.findFirst({ where: { id: itemId, sale: { userId } }, select: { id: true, saleId: true, kind: true, departureDate: true, returnDate: true, doneOutAt: true, doneRetAt: true } });
  if (!it) throw new DomainError(404, "Item não encontrado");
  if (b.doneRet !== undefined && (it.kind !== "FLIGHT" || !it.returnDate)) throw new DomainError(400, "Este item não tem volta");
  const data: Prisma.SaleItemUpdateInput = {};
  const now = new Date();
  if (b.doneOut !== undefined) data.doneOutAt = b.doneOut ? it.doneOutAt ?? now : null;
  if (b.doneRet !== undefined) data.doneRetAt = b.doneRet ? it.doneRetAt ?? now : null;
  if (b.provider !== undefined) data.provider = b.provider?.trim() || null;
  if (b.departureTime !== undefined) data.departureTime = it.departureDate ? b.departureTime || null : null;
  if (b.returnTime !== undefined) data.returnTime = it.returnDate ? b.returnTime || null : null;
  await prisma.saleItem.update({ where: { id: it.id }, data });
  if (b.doneOut !== undefined || b.doneRet !== undefined) {
    await audit(prisma, actorId ?? userId, "tracking.mark", "SaleItem", it.id, { saleId: it.saleId, ...(b.doneOut !== undefined ? { doneOut: b.doneOut } : {}), ...(b.doneRet !== undefined ? { doneRet: b.doneRet } : {}) });
  }
  const fresh = await prisma.saleItem.findUniqueOrThrow({ where: { id: it.id }, select });
  return rowsOf(toItem(fresh));
}

export type { TrackRow };
