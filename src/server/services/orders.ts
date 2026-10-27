import { createHash } from "node:crypto";
import { Prisma, type OrderStage } from "@prisma/client";
import { prisma, DomainError } from "../db";
import { detectAttachment, MAX_BYTES, MAX_FILES } from "./holder-files";
import { ORDER_STAGES, routeLabel, type Segment, type TripType } from "@/domain/orders";
import { AIRPORTS } from "@/domain/airports";

// CRM de pedidos de emissão: Kanban por etapa, lista, dashboard e captação pela página pública.

export type OrderInput = {
  customerId?: string | null;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  tripType: TripType;
  cabin: "ECONOMY" | "PREMIUM" | "BUSINESS" | "FIRST";
  segments: Segment[];
  adults: number;
  children: number;
  infants: number;
  flexibleDates?: boolean;
  checkedBag?: boolean;
  priority?: "LOW" | "MEDIUM" | "HIGH";
  budgetCents?: number | null;
  notes?: string | null;
};

const view = (o: Prisma.TravelOrderGetPayload<{ include: { _count: { select: { attachments: true; quotes: true } } } }>) => ({
  id: o.id,
  number: o.number,
  customerId: o.customerId,
  customerName: o.customerName,
  customerPhone: o.customerPhone,
  customerEmail: o.customerEmail,
  stage: o.stage,
  position: o.position,
  tripType: o.tripType as TripType,
  cabin: o.cabin,
  segments: o.segments as Segment[],
  route: routeLabel(o.segments as Segment[], o.tripType as TripType),
  adults: o.adults,
  children: o.children,
  infants: o.infants,
  flexibleDates: o.flexibleDates,
  checkedBag: o.checkedBag,
  priority: o.priority,
  budgetCents: o.budgetCents,
  notes: o.notes,
  source: o.source,
  archivedAt: o.archivedAt?.toISOString() ?? null,
  archiveReason: o.archiveReason,
  createdAt: o.createdAt.toISOString(),
  updatedAt: o.updatedAt.toISOString(),
  attachments: o._count.attachments,
  quotes: o._count.quotes,
});
export type OrderView = ReturnType<typeof view>;
const withCounts = { _count: { select: { attachments: true, quotes: true } } } as const;

function validate(input: OrderInput) {
  const name = input.customerName.trim();
  if (!name) throw new DomainError(400, "Informe o cliente");
  if (!input.segments.length) throw new DomainError(400, "Informe a origem e o destino");
  for (const s of input.segments) {
    if (!/^[A-Z]{3}$/.test(s.origin) || !/^[A-Z]{3}$/.test(s.destination)) throw new DomainError(400, "Use o código do aeroporto (ex.: GRU)");
    if (s.origin === s.destination) throw new DomainError(400, "Origem e destino precisam ser diferentes");
  }
  if (input.tripType === "ROUND_TRIP" && input.segments.length !== 2) throw new DomainError(400, "Ida e volta precisa de dois trechos");
  if (input.adults < 1 || input.adults + input.children + input.infants > 9) throw new DomainError(400, "De 1 a 9 passageiros, com ao menos 1 adulto");
  if (input.infants > input.adults) throw new DomainError(400, "Cada bebê precisa de um adulto");
}

async function nextNumber(tx: Prisma.TransactionClient, userId: string) {
  const last = await tx.travelOrder.aggregate({ where: { userId }, _max: { number: true } });
  return (last._max.number ?? 0) + 1;
}

export async function createOrder(userId: string, input: OrderInput, source: "MANUAL" | "PUBLIC" = "MANUAL") {
  validate(input);
  if (input.customerId && !(await prisma.customer.findFirst({ where: { id: input.customerId, userId }, select: { id: true } }))) throw new DomainError(404, "Cliente não encontrado");
  // Número sequencial por usuário; repete se dois pedidos chegarem juntos
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const number = await nextNumber(tx, userId);
        const o = await tx.travelOrder.create({
          data: {
            userId, number, source,
            customerId: input.customerId || null,
            customerName: input.customerName.trim(),
            customerPhone: input.customerPhone?.trim() || null,
            customerEmail: input.customerEmail?.trim() || null,
            tripType: input.tripType, cabin: input.cabin, segments: input.segments,
            adults: input.adults, children: input.children, infants: input.infants,
            flexibleDates: !!input.flexibleDates, checkedBag: !!input.checkedBag,
            priority: input.priority ?? "MEDIUM", budgetCents: input.budgetCents ?? null, notes: input.notes?.trim() || null,
          },
          include: withCounts,
        });
        await tx.orderEvent.create({ data: { orderId: o.id, type: "created", toStage: "NEW", note: source === "PUBLIC" ? "Pedido pela página pública" : null } });
        return view(o);
      });
    } catch (e) {
      if (attempt < 3 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
}

async function own(userId: string, id: string) {
  const o = await prisma.travelOrder.findFirst({ where: { id, userId } });
  if (!o) throw new DomainError(404, "Pedido não encontrado");
  return o;
}

export async function updateOrder(userId: string, id: string, input: OrderInput) {
  validate(input);
  await own(userId, id);
  if (input.customerId && !(await prisma.customer.findFirst({ where: { id: input.customerId, userId }, select: { id: true } }))) throw new DomainError(404, "Cliente não encontrado");
  const o = await prisma.travelOrder.update({
    where: { id },
    data: {
      customerId: input.customerId || null, customerName: input.customerName.trim(), customerPhone: input.customerPhone?.trim() || null, customerEmail: input.customerEmail?.trim() || null,
      tripType: input.tripType, cabin: input.cabin, segments: input.segments, adults: input.adults, children: input.children, infants: input.infants,
      flexibleDates: !!input.flexibleDates, checkedBag: !!input.checkedBag, priority: input.priority ?? "MEDIUM", budgetCents: input.budgetCents ?? null, notes: input.notes?.trim() || null,
    },
    include: withCounts,
  });
  return view(o);
}

/** Move o pedido para a etapa (e posição) indicada, reordenando a coluna de destino. */
export async function moveOrder(userId: string, id: string, stage: OrderStage, position?: number) {
  const o = await own(userId, id);
  if (o.archivedAt) throw new DomainError(409, "Desarquive o pedido antes de movê-lo");
  await prisma.$transaction(async (tx) => {
    const column = await tx.travelOrder.findMany({ where: { userId, stage, archivedAt: null, NOT: { id } }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true } });
    const at = Math.max(0, Math.min(position ?? column.length, column.length));
    const ids = [...column.slice(0, at).map((c) => c.id), id, ...column.slice(at).map((c) => c.id)];
    for (const [i, oid] of ids.entries()) await tx.travelOrder.update({ where: { id: oid }, data: { position: i, ...(oid === id ? { stage } : {}) } });
    if (o.stage !== stage) await tx.orderEvent.create({ data: { orderId: id, type: "stage", fromStage: o.stage, toStage: stage } });
  });
}

export async function archiveOrder(userId: string, id: string, reason: string) {
  await own(userId, id);
  await prisma.travelOrder.update({ where: { id }, data: { archivedAt: new Date(), archiveReason: reason.trim().slice(0, 120) || "Outro" } });
  await prisma.orderEvent.create({ data: { orderId: id, type: "archived", note: reason } });
}
export async function unarchiveOrder(userId: string, id: string) {
  await own(userId, id);
  await prisma.travelOrder.update({ where: { id }, data: { archivedAt: null, archiveReason: null } });
  await prisma.orderEvent.create({ data: { orderId: id, type: "unarchived" } });
}
export async function deleteOrder(userId: string, id: string) {
  await own(userId, id);
  await prisma.travelOrder.delete({ where: { id } });
}

export async function listOrders(userId: string, opts: { archived?: boolean; q?: string } = {}) {
  const rows = await prisma.travelOrder.findMany({
    where: { userId, archivedAt: opts.archived ? { not: null } : null, ...(opts.q ? { customerName: { contains: opts.q, mode: "insensitive" } } : {}) },
    include: withCounts,
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
  });
  return rows.map(view);
}

export async function getOrder(userId: string, id: string) {
  const o = await prisma.travelOrder.findFirst({ where: { id, userId }, include: { ...withCounts, events: { orderBy: { createdAt: "desc" }, take: 30 } } });
  if (!o) throw new DomainError(404, "Pedido não encontrado");
  return { ...view(o), events: o.events.map((e) => ({ id: e.id, type: e.type, fromStage: e.fromStage, toStage: e.toStage, note: e.note, createdAt: e.createdAt.toISOString() })) };
}

/* ---------------- Anexos ---------------- */

export async function listOrderFiles(userId: string, orderId: string) {
  await own(userId, orderId);
  return prisma.orderAttachment.findMany({ where: { orderId }, select: { id: true, name: true, mime: true, size: true, visibleToClient: true, createdAt: true }, orderBy: { createdAt: "asc" } });
}
export async function addOrderFile(userId: string, orderId: string, name: string, buf: Buffer) {
  await own(userId, orderId);
  if (buf.length === 0) throw new DomainError(400, "Arquivo vazio");
  if (buf.length > MAX_BYTES) throw new DomainError(413, "Arquivo maior que 10 MB");
  const mime = detectAttachment(buf);
  if (!mime) throw new DomainError(415, "Envie PNG, JPEG, WEBP, HEIC ou PDF");
  if ((await prisma.orderAttachment.count({ where: { orderId } })) >= MAX_FILES) throw new DomainError(409, `No máximo ${MAX_FILES} arquivos por pedido`);
  const clean = name.replace(/[\\/]/g, "_").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120) || "arquivo";
  return prisma.orderAttachment.create({ data: { orderId, name: clean, mime, size: buf.length, data: new Uint8Array(buf) }, select: { id: true, name: true, mime: true, size: true, visibleToClient: true, createdAt: true } });
}
export async function getOrderFile(userId: string, orderId: string, id: string) {
  await own(userId, orderId);
  const a = await prisma.orderAttachment.findFirst({ where: { id, orderId } });
  if (!a) throw new DomainError(404, "Anexo não encontrado");
  return { name: a.name, mime: a.mime, data: Buffer.from(a.data) };
}
export async function setOrderFileVisible(userId: string, orderId: string, id: string, visible: boolean) {
  await own(userId, orderId);
  const { count } = await prisma.orderAttachment.updateMany({ where: { id, orderId }, data: { visibleToClient: visible } });
  if (!count) throw new DomainError(404, "Anexo não encontrado");
}
export async function deleteOrderFile(userId: string, orderId: string, id: string) {
  await own(userId, orderId);
  const { count } = await prisma.orderAttachment.deleteMany({ where: { id, orderId } });
  if (!count) throw new DomainError(404, "Anexo não encontrado");
}

/* ---------------- Dashboard ---------------- */

const city = (code: string) => AIRPORTS.find((a) => a.code === code)?.city ?? code;
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const top = (m: Map<string, number>, n = 5) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, value]) => ({ name, value }));
const inc = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by);

export async function ordersDashboard(userId: string, days: number | null) {
  const since = days ? new Date(Date.now() - days * 86400_000) : undefined;
  const [inPeriod, active, archived, profile] = await Promise.all([
    prisma.travelOrder.findMany({ where: { userId, createdAt: since ? { gte: since } : undefined } }),
    prisma.travelOrder.findMany({ where: { userId, archivedAt: null }, select: { stage: true, updatedAt: true, priority: true, customerName: true, number: true, id: true } }),
    prisma.travelOrder.findMany({ where: { userId, archivedAt: since ? { gte: since } : { not: null } }, select: { archiveReason: true } }),
    prisma.salesProfile.findUnique({ where: { userId }, select: { slug: true, published: true, acceptsOrders: true, views: true } }),
  ]);
  const withBudget = inPeriod.filter((o) => o.budgetCents);
  const total = withBudget.reduce((t, o) => t + (o.budgetCents ?? 0), 0);
  const dest = new Map<string, number>(), orig = new Map<string, number>(), months = new Map<string, number>(), cabins = new Map<string, number>(), reasons = new Map<string, number>();
  let pax = 0, adt = 0, chd = 0, inf = 0, oneWay = 0, rt = 0, multi = 0, flex = 0, bag = 0;
  for (const o of inPeriod) {
    const segs = o.segments as Segment[];
    if (segs[0]) {
      inc(orig, `${city(segs[0].origin)} (${segs[0].origin})`);
      inc(dest, `${city(segs[0].destination)} (${segs[0].destination})`);
      if (segs[0].date) inc(months, `${MONTHS[Number(segs[0].date.slice(5, 7)) - 1]} de ${segs[0].date.slice(0, 4)}`);
    }
    inc(cabins, { ECONOMY: "Econômica", PREMIUM: "Premium Economy", BUSINESS: "Executiva", FIRST: "Primeira classe" }[o.cabin] ?? o.cabin);
    pax += o.adults + o.children + o.infants;
    adt += o.adults; chd += o.children; inf += o.infants;
    if (o.tripType === "ROUND_TRIP") rt++; else if (o.tripType === "MULTI") multi++; else oneWay++;
    if (o.flexibleDates) flex++;
    if (o.checkedBag) bag++;
  }
  for (const a of archived) inc(reasons, a.archiveReason ?? "Outro");
  const n = inPeriod.length;
  const pct = (x: number) => (n ? Math.round((x / n) * 100) : 0);
  // Alertas: pedidos novos ou em cotação parados há mais de 2 dias
  const stale = active.filter((o) => (o.stage === "NEW" || o.stage === "QUOTING") && Date.now() - o.updatedAt.getTime() > 2 * 86400_000);
  const publicOrders = inPeriod.filter((o) => o.source === "PUBLIC").length;
  return {
    totals: {
      orders: n, withBudget: withBudget.length, budgetCents: total, avgBudgetCents: withBudget.length ? Math.round(total / withBudget.length) : 0,
      customers: new Set(inPeriod.map((o) => o.customerId ?? o.customerName.toLowerCase())).size,
      highPriority: inPeriod.filter((o) => o.priority === "HIGH").length, archived: archived.length,
    },
    capture: profile ? { slug: profile.slug, active: profile.published && profile.acceptsOrders, views: profile.views, orders: publicOrders, conversion: profile.views ? Math.round((publicOrders / profile.views) * 1000) / 10 : null } : null,
    destinations: top(dest), origins: top(orig), months: top(months), cabins: top(cabins),
    behavior: { avgPax: n ? Math.round((pax / n) * 10) / 10 : 0, adt, chd, inf, oneWay, rt, multi, flexiblePct: pct(flex), bagPct: pct(bag) },
    pipeline: ORDER_STAGES.map((s) => ({ stage: s, count: active.filter((o) => o.stage === s).length })),
    alerts: stale.map((o) => ({ id: o.id, number: o.number, customerName: o.customerName, stage: o.stage, days: Math.floor((Date.now() - o.updatedAt.getTime()) / 86400_000) })),
    archiveReasons: top(reasons, 10),
  };
}

/* ---------------- Captação pela página pública ---------------- */

const PUBLIC_LIMIT_PER_HOUR = 5;

/** Pedido enviado pelo formulário da página pública (/p/<nome>). Sem login; limitado por IP. */
export async function createPublicOrder(slug: string, input: OrderInput, ip: string) {
  const p = await prisma.salesProfile.findUnique({ where: { slug: slug.toLowerCase() }, select: { userId: true, published: true, acceptsOrders: true, user: { select: { status: true } } } });
  if (!p || !p.published || !p.acceptsOrders || p.user.status !== "ACTIVE") throw new DomainError(404, "Página não encontrada");
  const ipHash = createHash("sha256").update(`${slug}:${ip}`).digest("hex").slice(0, 32);
  const recent = await prisma.orderEvent.count({ where: { type: "created", note: `public:${ipHash}`, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (recent >= PUBLIC_LIMIT_PER_HOUR) throw new DomainError(429, "Muitos pedidos enviados. Tente de novo mais tarde.");
  if (!input.customerPhone && !input.customerEmail) throw new DomainError(400, "Informe um telefone ou e-mail para contato");
  const o = await createOrder(p.userId, { ...input, customerId: null, priority: "MEDIUM", budgetCents: null }, "PUBLIC");
  await prisma.orderEvent.updateMany({ where: { orderId: o.id, type: "created" }, data: { note: `public:${ipHash}` } });
  await prisma.notification.create({ data: { userId: p.userId, title: "Novo pedido pela sua página", body: `${o.customerName} pediu ${o.route}.` } });
  return { number: o.number };
}

export async function countPublicView(slug: string) {
  await prisma.salesProfile.updateMany({ where: { slug: slug.toLowerCase(), published: true }, data: { views: { increment: 1 } } });
}
