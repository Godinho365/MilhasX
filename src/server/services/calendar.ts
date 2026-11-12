// Calendário da agência: os eventos criados aqui (ou importados de um .ics) e os automáticos, lidos do resto do
// sistema: embarques, check-ins, hospedagens, carros e passeios das vendas; prazos das tarefas; aniversários de
// passageiros e titulares; contas a pagar e a receber e lembretes dos cartões. O que cada pessoa vê segue a função
// dela (o membro só vê os automáticos das áreas que pode ver). Também: o link .ics para o Google Agenda assinar e o
// aviso "Agenda de hoje".
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma, DomainError, audit } from "../db";
import { sha256 } from "../auth";
import { can, type Permission } from "@/domain/permissions";
import { brDay } from "@/domain/brasilia";
import { placeName } from "@/domain/geo";
import { SALE_ITEM_LABELS, isSaleItemKind } from "@/domain/sale-items";
import {
  EVENT_KINDS, MANUAL_KINDS, CHECKIN_DAYS_BEFORE, addDays, birthdays, byStart, dayOf, diffDays, isDay, isTime, occurrences, parseIcs, toIcs,
  type CalEvent, type EventKind, type Recurrence,
} from "@/domain/calendar";

export type Access = { perms: readonly Permission[] | "ALL" | readonly string[] };
const ALL: Access = { perms: "ALL" };
const sees = (a: Access, area: Parameters<typeof can>[1]) => can(a.perms as readonly string[] | "ALL", area, "view");
const utc = (d: string) => new Date(`${d}T00:00:00Z`);
/** Intervalo máximo de uma consulta (dias). */
const MAX_RANGE = 450;

/* ---------------- Leitura ---------------- */

type Range = { from: string; to: string };
function checkRange(r: Range) {
  if (!isDay(r.from) || !isDay(r.to) || r.to < r.from) throw new DomainError(400, "Período inválido");
  if (diffDays(r.to, r.from) > MAX_RANGE) throw new DomainError(400, `Período de no máximo ${MAX_RANGE} dias`);
}

const base = (o: Partial<CalEvent> & Pick<CalEvent, "id" | "kind" | "title" | "date" | "source">): CalEvent => ({
  eventId: null, seriesDate: null, endDate: null, time: null, endTime: null, href: null, editable: false, memberIds: [], customer: null, location: null,
  notes: null, detail: null, recurrence: "NONE", remind: true, done: false, ...o,
});

async function manualEvents(userId: string, r: Range): Promise<CalEvent[]> {
  const rows = await prisma.calendarEvent.findMany({
    where: { userId, date: { lte: utc(r.to) }, OR: [{ recurrence: { not: "NONE" } }, { endDate: { gte: utc(r.from) } }, { endDate: null, date: { gte: utc(r.from) } }] },
    include: { customer: { select: { id: true, name: true } } },
  });
  const out: CalEvent[] = [];
  for (const e of rows) {
    const date = dayOf(e.date), endDate = e.endDate ? dayOf(e.endDate) : null;
    const span = endDate ? diffDays(endDate, date) : 0;
    for (const start of occurrences({ date, endDate, recurrence: e.recurrence as Recurrence }, r.from, r.to)) {
      out.push(base({
        id: `ev:${e.id}:${start}`, eventId: e.id, seriesDate: date, kind: (e.kind in EVENT_KINDS ? e.kind : "REMINDER") as EventKind, title: e.title, date: start,
        endDate: span ? addDays(start, span) : null, time: e.time, endTime: e.endTime, source: e.source === "IMPORT" ? "IMPORT" : "MANUAL",
        editable: true, memberIds: e.memberIds, customer: e.customer, location: e.location, notes: e.notes, recurrence: e.recurrence as Recurrence, remind: e.remind,
      }));
    }
  }
  return out;
}

const route = (o: string | null, d: string | null) => `${o?.trim() || "?"} → ${d?.trim() || "?"}`;

/** Embarque, volta e check-in dos voos; hospedagem, carro, transfer, cruzeiro e passeios (das vendas não reembolsadas). */
async function saleEvents(userId: string, r: Range): Promise<CalEvent[]> {
  const from = utc(r.from), toCheckin = utc(addDays(r.to, CHECKIN_DAYS_BEFORE));
  const items = await prisma.saleItem.findMany({
    where: {
      sale: { userId, refundedAt: null }, kind: { in: ["FLIGHT", "HOTEL", "CAR", "TRANSFER", "CRUISE", "OTHER"] }, departureDate: { lte: toCheckin },
      OR: [{ departureDate: { gte: from } }, { returnDate: { gte: from } }],
    },
    select: {
      id: true, kind: true, origin: true, destination: true, departureDate: true, returnDate: true, reservation: true, description: true, passengers: true,
      departureTime: true, returnTime: true, provider: true, doneOutAt: true, doneRetAt: true,
      customers: { select: { id: true, name: true } }, sale: { select: { id: true, issuerIds: true, customer: { select: { id: true, name: true } } } },
    },
  });
  const out: CalEvent[] = [];
  for (const i of items) {
    if (!i.departureDate) continue;
    const dep = dayOf(i.departureDate), ret = i.returnDate ? dayOf(i.returnDate) : null;
    const people = i.customers.length ? i.customers.map((c) => c.name).join(", ") : i.sale.customer?.name ?? null;
    const customer = i.customers[0] ?? i.sale.customer ?? null;
    const common = { source: "SALE" as const, href: `/app/sales?edit=${encodeURIComponent(i.sale.id)}`, memberIds: i.sale.issuerIds, customer };
    const detail = [people, i.provider, i.reservation ? `Localizador ${i.reservation}` : null].filter(Boolean).join(" · ") || null;
    if (i.kind === "FLIGHT") {
      const legs: [string, "Embarque" | "Volta", string, string | null, boolean][] = [[dep, "Embarque", route(i.origin, i.destination), i.departureTime, !!i.doneOutAt]];
      if (ret) legs.push([ret, "Volta", route(i.destination, i.origin), i.returnTime, !!i.doneRetAt]);
      for (const [d, label, path, time, checked] of legs) {
        const tag = label === "Volta" ? "ret" : "dep";
        out.push(base({ ...common, id: `sale:${i.id}:${tag}`, kind: "BOARDING", title: `${label} · ${path}`, date: d, time: isTime(time) ? time : null, detail }));
        out.push(base({
          ...common, id: `sale:${i.id}:${tag}-checkin`, kind: "CHECKIN", title: `Check-in · ${path}`, date: addDays(d, -CHECKIN_DAYS_BEFORE), done: checked,
          detail: `${checked ? "Feito · " : ""}Embarque em ${d.slice(8, 10)}/${d.slice(5, 7)}${time ? ` às ${time}` : ""}${detail ? ` · ${detail}` : ""}`,
        }));
      }
    } else {
      const kind: EventKind = i.kind === "HOTEL" ? "HOTEL" : i.kind === "CAR" ? "CAR" : "TOUR";
      const label = i.kind === "TRANSFER" || i.kind === "CRUISE" ? SALE_ITEM_LABELS[i.kind] : EVENT_KINDS[kind].label;
      const what = i.description?.trim() || i.provider?.trim() || placeName(i.destination?.trim()) || (isSaleItemKind(i.kind) ? SALE_ITEM_LABELS[i.kind] : label);
      out.push(base({
        ...common, id: `sale:${i.id}`, kind, title: `${label} · ${what}`, date: dep, endDate: ret && ret > dep ? ret : null,
        time: isTime(i.departureTime) ? i.departureTime : null, endTime: ret && isTime(i.returnTime) ? i.returnTime : null, detail,
      }));
    }
  }
  return out;
}

async function taskEvents(userId: string, r: Range): Promise<CalEvent[]> {
  const rows = await prisma.task.findMany({ where: { userId, dueDate: { gte: utc(r.from), lte: utc(r.to) } }, select: { id: true, title: true, dueDate: true, dueTime: true, status: true, memberIds: true, boardId: true, priority: true } });
  return rows.map((t) => base({
    id: `task:${t.id}`, kind: "TASK", title: t.title, date: dayOf(t.dueDate!), time: isTime(t.dueTime) ? t.dueTime : null, source: "TASK",
    href: t.boardId ? `/app/equipe/tarefas?quadro=${encodeURIComponent(t.boardId)}` : "/app/equipe/tarefas", memberIds: t.memberIds, done: t.status === "DONE",
    detail: t.status === "DONE" ? "Concluída" : t.priority === "URGENT" ? "Urgente" : t.priority === "HIGH" ? "Prioridade alta" : null,
  }));
}

async function birthdayEvents(userId: string, r: Range, a: Access): Promise<CalEvent[]> {
  const [passengers, holders] = await Promise.all([
    sees(a, "contatos") ? prisma.passenger.findMany({ where: { userId, birthDate: { not: null } }, select: { id: true, name: true, birthDate: true, customer: { select: { id: true, name: true } } } }) : [],
    sees(a, "milhas") ? prisma.holder.findMany({ where: { userId, birthDate: { not: null } }, select: { id: true, name: true, birthDate: true } }) : [],
  ]);
  const out: CalEvent[] = [];
  for (const p of passengers) {
    for (const b of birthdays(dayOf(p.birthDate!), r.from, r.to)) {
      out.push(base({ id: `pax:${p.id}:${b.date}`, kind: "BIRTHDAY", title: `Aniversário · ${p.name}`, date: b.date, source: "PASSENGER", href: "/app/contatos/passageiros", customer: p.customer, detail: `${b.age} anos · passageiro` }));
    }
  }
  for (const h of holders) {
    for (const b of birthdays(dayOf(h.birthDate!), r.from, r.to)) {
      out.push(base({ id: `holder:${h.id}:${b.date}`, kind: "BIRTHDAY", title: `Aniversário · ${h.name}`, date: b.date, source: "HOLDER", href: "/app/programs", detail: `${b.age} anos · titular` }));
    }
  }
  return out;
}

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Contas a pagar e a receber em aberto e os lembretes dos cartões (fatura, anuidade...). */
async function financeEvents(userId: string, r: Range): Promise<CalEvent[]> {
  const [txs, reminders] = await Promise.all([
    prisma.finTransaction.findMany({ where: { userId, paidAt: null, cardId: null, dueDate: { gte: utc(r.from), lte: utc(r.to) } }, select: { id: true, type: true, description: true, amountCents: true, dueDate: true, counterpart: true } }),
    prisma.cardReminder.findMany({ where: { card: { userId }, date: { lte: utc(r.to) } }, select: { id: true, title: true, date: true, recurrence: true, card: { select: { id: true, name: true } } } }),
  ]);
  const out: CalEvent[] = txs.map((t) => base({
    id: `fin:${t.id}`, kind: "FINANCE", title: `${t.type === "INCOME" ? "A receber" : "A pagar"} · ${t.description}`, date: dayOf(t.dueDate), source: "FINANCE",
    href: "/app/financeiro", detail: [brl(t.amountCents), t.counterpart].filter(Boolean).join(" · "),
  }));
  for (const c of reminders) {
    const rec: Recurrence = c.recurrence === "MONTHLY" ? "MONTHLY" : c.recurrence === "YEARLY" ? "YEARLY" : "NONE";
    for (const d of occurrences({ date: dayOf(c.date), recurrence: rec }, r.from, r.to)) {
      out.push(base({ id: `card:${c.id}:${d}`, kind: "FINANCE", title: `${c.card.name} · ${c.title}`, date: d, source: "CARD", href: "/app/credit-cards", recurrence: rec, detail: "Cartão" }));
    }
  }
  return out;
}

/**
 * Os eventos do intervalo (as ocorrências), em ordem. Os automáticos só das áreas que a pessoa vê.
 * `memberId`: só os do responsável (eventos sem responsável não entram).
 */
export async function calendarEvents(userId: string, r: Range, a: Access = ALL, f: { memberId?: string | null } = {}) {
  checkRange(r);
  const none = Promise.resolve([] as CalEvent[]);
  const lists = await Promise.all([
    manualEvents(userId, r),
    sees(a, "vendas") ? saleEvents(userId, r) : none,
    sees(a, "tarefas") ? taskEvents(userId, r) : none,
    birthdayEvents(userId, r, a),
    sees(a, "financeiro") ? financeEvents(userId, r) : none,
  ]);
  let all = lists.flat().filter((e) => e.date <= r.to && (e.endDate ?? e.date) >= r.from);
  if (f.memberId) all = all.filter((e) => e.memberIds.includes(f.memberId!));
  return all.sort(byStart);
}

/* ---------------- Eventos criados aqui ---------------- */

export type EventInput = {
  kind: string; title: string; date: Date; endDate?: Date | null; time?: string | null; endTime?: string | null; recurrence?: string;
  memberIds?: string[]; customerId?: string | null; location?: string | null; notes?: string | null; remind?: boolean;
};

async function checkEvent(userId: string, input: EventInput) {
  if (!(MANUAL_KINDS as string[]).includes(input.kind)) throw new DomainError(400, "Tipo de evento inválido");
  const title = input.title.trim();
  if (!title) throw new DomainError(400, "Dê um nome ao evento");
  const date = dayOf(input.date);
  const endDate = input.endDate ? dayOf(input.endDate) : null;
  if (endDate && endDate < date) throw new DomainError(400, "O fim é antes do começo");
  if (endDate && diffDays(endDate, date) > 366) throw new DomainError(400, "Evento de no máximo um ano");
  const time = input.time?.trim() || null, endTime = input.endTime?.trim() || null;
  if ((time && !isTime(time)) || (endTime && !isTime(endTime))) throw new DomainError(400, "Horário inválido (use HH:MM)");
  if (endTime && !time) throw new DomainError(400, "Informe o horário de início");
  if (time && endTime && (!endDate || endDate === date) && endTime <= time) throw new DomainError(400, "O fim é antes do começo");
  const recurrence = (["NONE", "WEEKLY", "MONTHLY", "YEARLY"].includes(input.recurrence ?? "NONE") ? input.recurrence ?? "NONE" : "NONE") as Recurrence;
  const memberIds = [...new Set(input.memberIds ?? [])];
  if (memberIds.length && (await prisma.teamMember.count({ where: { userId, id: { in: memberIds } } })) !== memberIds.length) throw new DomainError(404, "Membro não encontrado");
  if (input.customerId && !(await prisma.customer.count({ where: { id: input.customerId, userId } }))) throw new DomainError(404, "Cliente não encontrado");
  return {
    kind: input.kind, title: title.slice(0, 200), date: utc(date), endDate: endDate && endDate > date ? utc(endDate) : null, time, endTime: time ? endTime : null,
    recurrence, memberIds, customerId: input.customerId || null, location: input.location?.trim().slice(0, 200) || null, notes: input.notes?.trim().slice(0, 2000) || null,
    remind: input.remind ?? true,
  };
}

export async function saveEvent(userId: string, id: string | null, input: EventInput, actorId: string) {
  const data = await checkEvent(userId, input);
  if (!id) return (await prisma.calendarEvent.create({ data: { userId, ...data, createdById: actorId } })).id;
  const { count } = await prisma.calendarEvent.updateMany({ where: { id, userId }, data });
  if (!count) throw new DomainError(404, "Evento não encontrado");
  return id;
}

export async function deleteEvent(userId: string, id: string) {
  const { count } = await prisma.calendarEvent.deleteMany({ where: { id, userId } });
  if (!count) throw new DomainError(404, "Evento não encontrado");
}

/** Importa um .ics (Google Agenda, Outlook...). Importar o mesmo arquivo de novo atualiza em vez de duplicar. */
export async function importIcs(userId: string, ics: string, kind: string, actorId: string) {
  if (!(MANUAL_KINDS as string[]).includes(kind)) throw new DomainError(400, "Tipo de evento inválido");
  if (!/BEGIN:VCALENDAR/i.test(ics)) throw new DomainError(400, "Arquivo inválido: envie um .ics (exportado do Google Agenda, Outlook ou Apple)");
  const events = parseIcs(ics, 2000);
  if (!events.length) throw new DomainError(400, "Nenhum evento no arquivo");
  const existing = new Set((await prisma.calendarEvent.findMany({ where: { userId, externalUid: { in: events.map((e) => e.uid) } }, select: { externalUid: true } })).map((e) => e.externalUid));
  let created = 0, updated = 0;
  for (let i = 0; i < events.length; i += 200) {
    await prisma.$transaction(events.slice(i, i + 200).map((e) => {
      const data = {
        title: e.title, date: utc(e.date), endDate: e.endDate ? utc(e.endDate) : null, time: e.time, endTime: e.time ? e.endTime : null,
        recurrence: e.recurrence, location: e.location, notes: e.notes,
      };
      if (existing.has(e.uid)) updated++; else created++;
      return prisma.calendarEvent.upsert({
        where: { userId_externalUid: { userId, externalUid: e.uid } },
        create: { userId, kind, source: "IMPORT", externalUid: e.uid, remind: false, createdById: actorId, ...data },
        update: data,
      });
    }));
  }
  return { created, updated };
}

/* ---------------- Link para o Google Agenda ---------------- */

export async function feedStatus(userId: string) {
  const f = await prisma.calendarFeed.findUnique({ where: { userId } });
  return f ? { active: true, createdAt: f.createdAt.toISOString() } : { active: false, createdAt: null };
}

/** Gera (ou troca) o link secreto. O token só aparece agora: o link antigo para de funcionar. */
export async function createFeed(userId: string, actorId: string) {
  const token = randomBytes(24).toString("base64url");
  await prisma.calendarFeed.upsert({ where: { userId }, create: { userId, tokenHash: sha256(token) }, update: { tokenHash: sha256(token), createdAt: new Date() } });
  await audit(prisma, actorId, "calendar.feed", "CalendarFeed", userId, {});
  return token;
}

export async function deleteFeed(userId: string, actorId: string) {
  await prisma.calendarFeed.deleteMany({ where: { userId } });
  await audit(prisma, actorId, "calendar.feed.off", "CalendarFeed", userId, {});
}

/** O .ics do link (de 60 dias atrás a um ano para frente). null = link inválido ou desligado. */
export async function feedIcs(token: string, now = new Date()) {
  if (!token || token.length < 20) return null;
  const f = await prisma.calendarFeed.findUnique({ where: { tokenHash: sha256(token) }, include: { user: { select: { name: true, status: true } } } });
  if (!f || f.user.status !== "ACTIVE") return null;
  const today = brDay(now);
  const events = await calendarEvents(f.userId, { from: addDays(today, -60), to: addDays(today, 365) });
  return toIcs(events.filter((e) => !e.done), `${f.user.name} · MilhasX`, now);
}

/* ---------------- Aviso "Agenda de hoje" ---------------- */

/** Quem já foi checado (no layout, cada página abre isto): sem evento hoje, checa de novo só depois de 10 min. */
const checkedAt = new Map<string, number>();
const RECHECK_MS = 10 * 60_000;

/**
 * Uma vez por dia (no 1º acesso): o aviso com os eventos de hoje (os criados com "avisar" e os automáticos).
 * `memo`: não checa de novo a mesma conta por 10 minutos (o layout chama a cada página).
 */
export async function notifyTodayEvents(userId: string, now = new Date(), opts: { memo?: boolean } = {}) {
  if (opts.memo && Date.now() - (checkedAt.get(userId) ?? 0) < RECHECK_MS) return false;
  if (opts.memo) { checkedAt.set(userId, Date.now()); if (checkedAt.size > 5000) checkedAt.clear(); }
  const today = brDay(now);
  const key = `agenda:${today}`;
  if (await prisma.notification.findUnique({ where: { userId_key: { userId, key } }, select: { id: true } })) return false;
  const events = (await calendarEvents(userId, { from: today, to: today })).filter((e) => e.remind && !e.done && (e.date === today || e.kind !== "HOTEL"));
  if (!events.length) return false;
  const items = events.slice(0, 6).map((e) => `${e.time ? `${e.time} ` : ""}${e.title}${e.detail && e.kind !== "FINANCE" ? ` (${e.detail.split(" · ")[0]})` : ""}`);
  const more = events.length > 6 ? ` e mais ${events.length - 6}` : "";
  try {
    await prisma.notification.create({ data: { userId, key, title: `Agenda de hoje: ${events.length} ${events.length === 1 ? "evento" : "eventos"}`, body: `${items.join(" · ")}${more}.` } });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false; // outra requisição já avisou
    throw e;
  }
}
