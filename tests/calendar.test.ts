// Calendário e Visão geral: as datas (repetição, aniversários, visões), o .ics (importar e o link do Google Agenda),
// os eventos automáticos (vendas, tarefas, aniversários, vencimentos), os criados à mão, o filtro por responsável,
// o aviso "Agenda de hoje", os blocos da Visão geral e as permissões, isolado por conta.
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client, seedPrograms } from "./helpers";
import { prisma } from "@/server/db";
import { brDay } from "@/domain/brasilia";
import { occurrences, birthdays, viewRange, stepAnchor, addDays, addMonths, parseIcs, toIcs, type CalEvent } from "@/domain/calendar";
import { apiRequirement, pageRequirement, rolePermissions } from "@/domain/permissions";
import { visibleWidgets, hiddenWidgets } from "@/domain/overview";
import { notifyTodayEvents } from "@/server/services/calendar";
import { overviewData } from "@/server/services/overview";
import * as register from "@/app/api/auth/register/route";
import * as holders from "@/app/api/holders/route";
import * as accounts from "@/app/api/accounts/route";
import * as entries from "@/app/api/entries/route";
import * as sales from "@/app/api/sales/route";
import * as refund from "@/app/api/sales/[id]/refund/route";
import * as issuersRoute from "@/app/api/sales/[id]/issuers/route";
import * as customers from "@/app/api/customers/route";
import * as passengers from "@/app/api/passengers/route";
import * as tasks from "@/app/api/tasks/route";
import * as members from "@/app/api/team/members/route";
import * as inviteRoute from "@/app/api/team/members/[id]/invite/route";
import * as acceptRoute from "@/app/api/auth/invite/[token]/route";
import * as calendar from "@/app/api/calendar/route";
import * as eventsRoute from "@/app/api/calendar/events/route";
import * as eventRoute from "@/app/api/calendar/events/[id]/route";
import * as importRoute from "@/app/api/calendar/import/route";
import * as feedRoute from "@/app/api/calendar/feed/route";
import * as feedPublic from "@/app/api/calendar/feed/[token]/route";
import * as overviewPrefs from "@/app/api/preferences/overview/route";

describe("datas do calendário", () => {
  it("repetição: semana, mês (31 vira o último dia), ano (29/fev) e eventos de vários dias", () => {
    expect(occurrences({ date: "2026-11-10" }, "2026-11-01", "2026-11-30")).toEqual(["2026-11-10"]);
    expect(occurrences({ date: "2026-10-30", endDate: "2026-11-02" }, "2026-11-01", "2026-11-30")).toEqual(["2026-10-30"]); // hospedagem que vira o mês
    expect(occurrences({ date: "2026-12-01" }, "2026-11-01", "2026-11-30")).toEqual([]);
    expect(occurrences({ date: "2026-10-27", recurrence: "WEEKLY" }, "2026-11-01", "2026-11-30")).toEqual(["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24"]);
    expect(occurrences({ date: "2026-01-31", recurrence: "MONTHLY" }, "2026-02-01", "2026-04-30")).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(occurrences({ date: "2024-02-29", recurrence: "YEARLY" }, "2027-01-01", "2028-12-31")).toEqual(["2027-02-28", "2028-02-29"]);
    expect(occurrences({ date: "1990-05-10", recurrence: "YEARLY" }, "2026-01-01", "2026-12-31")).toEqual(["1990-05-10".replace("1990", "2026")]); // começo distante: sem andar desde 1990
    expect(occurrences({ date: "2026-11-20", recurrence: "WEEKLY" }, "2026-11-01", "2026-11-19")).toEqual([]); // não volta antes do começo
    expect(birthdays("1996-11-14", "2026-11-01", "2026-11-30")).toEqual([{ date: "2026-11-14", age: 30 }]);
    expect(birthdays("2026-11-14", "2026-11-01", "2026-11-30")).toEqual([]); // nasceu: não é aniversário
  });

  it("visões: mês de domingo a sábado (6 semanas), semana, dia, lista e as setas", () => {
    expect(viewRange("mes", "2026-11-12")).toEqual({ from: "2026-11-01", to: "2026-12-12" }); // 1/11/2026 é domingo
    expect(viewRange("mes", "2026-12-25")).toEqual({ from: "2026-11-29", to: "2027-01-09" });
    expect(viewRange("semana", "2026-11-12")).toEqual({ from: "2026-11-08", to: "2026-11-14" });
    expect(viewRange("dia", "2026-11-12")).toEqual({ from: "2026-11-12", to: "2026-11-12" });
    expect(viewRange("lista", "2026-11-12")).toEqual({ from: "2026-11-12", to: "2026-12-11" });
    expect(stepAnchor("mes", "2026-01-31", 1)).toBe("2026-02-01");
    expect(stepAnchor("semana", "2026-11-12", -1)).toBe("2026-11-05");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });
});

describe(".ics", () => {
  const sample = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
    "BEGIN:VEVENT", "UID:abc@google.com", "DTSTART;VALUE=DATE:20261120", "DTEND;VALUE=DATE:20261123",
    "SUMMARY:Férias da Bia\\, sem\\; contato", "DESCRIPTION:Linha 1\\nLinha 2 com texto bem comprido que o Google dobra em",
    "  várias linhas", "END:VEVENT",
    "BEGIN:VEVENT", "UID:def@google.com", "DTSTART:20261115T120000Z", "DTEND:20261115T133000Z", "SUMMARY:Reunião", "LOCATION:Escritório",
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Lembrete do alarme", "TRIGGER:-PT10M", "END:VALARM", "END:VEVENT",
    "BEGIN:VEVENT", "UID:ghi", "DTSTART;TZID=America/Sao_Paulo:20261116T083000", "SUMMARY:Aniversário da Ana", "RRULE:FREQ=YEARLY", "END:VEVENT",
    "BEGIN:VEVENT", "UID:jkl", "DTSTART:20261117T100000", "SUMMARY:A cada 2 semanas", "RRULE:FREQ=WEEKLY;INTERVAL=2", "END:VEVENT",
    "BEGIN:VEVENT", "UID:x", "DTSTART;VALUE=DATE:20261118", "SUMMARY:Cancelado", "STATUS:CANCELLED", "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  it("lê dia todo (fim exclusivo), UTC em horário de Brasília, fuso local, texto escapado, repetição simples; ignora alarme e cancelado", () => {
    const ev = parseIcs(sample);
    expect(ev.map((e) => e.uid)).toEqual(["abc@google.com", "def@google.com", "ghi", "jkl"]);
    expect(ev[0]).toMatchObject({ title: "Férias da Bia, sem; contato", date: "2026-11-20", endDate: "2026-11-22", time: null, notes: "Linha 1\nLinha 2 com texto bem comprido que o Google dobra em várias linhas" });
    expect(ev[1]).toMatchObject({ title: "Reunião", date: "2026-11-15", time: "09:00", endTime: "10:30", endDate: null, location: "Escritório", notes: null });
    expect(ev[2]).toMatchObject({ date: "2026-11-16", time: "08:30", recurrence: "YEARLY" });
    expect(ev[3]).toMatchObject({ recurrence: "NONE" }); // a cada 2 semanas: não dá para repetir igual, entra só a primeira
  });

  it("gera o calendário (UTC, dia todo com fim exclusivo, linhas dobradas) e lê de volta igual", () => {
    const base = { eventId: null, seriesDate: null, endDate: null, endTime: null, href: null, editable: false, memberIds: [] as string[], customer: null, location: null, notes: null, detail: null, recurrence: "NONE" as const, remind: true, done: false };
    const events: CalEvent[] = [
      { ...base, id: "sale:1:dep", kind: "BOARDING", title: "Embarque · GRU → LIS", date: "2026-11-20", time: null, source: "SALE", detail: "Maria Souza; Localizador ABC123" },
      { ...base, id: "ev:2:2026-11-21", kind: "REMINDER", title: "Ligar para o cliente, sobre o visto americano e a entrevista no consulado", date: "2026-11-21", time: "14:00", endTime: "15:30", source: "MANUAL", location: "Consulado" },
      { ...base, id: "sale:3", kind: "HOTEL", title: "Hospedagem · Lisboa", date: "2026-11-20", endDate: "2026-11-24", time: null, source: "SALE" },
    ];
    const ics = toIcs(events, "Agência · MilhasX", new Date("2026-11-12T10:00:00Z"));
    expect(ics).toContain("DTSTART:20261121T170000Z");
    expect(ics).toContain("DTEND:20261121T183000Z");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261120\r\nDTEND;VALUE=DATE:20261125");
    expect(ics).toContain("CATEGORIES:Embarque");
    expect(ics.split("\r\n").every((l) => Buffer.byteLength(l, "utf8") <= 75)).toBe(true);
    const back = parseIcs(ics);
    expect(back.map((e) => [e.title, e.date, e.endDate, e.time, e.endTime])).toEqual([
      ["Embarque · GRU → LIS", "2026-11-20", null, null, null],
      ["Ligar para o cliente, sobre o visto americano e a entrevista no consulado", "2026-11-21", null, "14:00", "15:30"],
      ["Hospedagem · Lisboa", "2026-11-20", "2026-11-24", null, null],
    ]);
    expect(back[0]!.notes).toBe("Embarque\nMaria Souza; Localizador ABC123");
  });
});

describe("permissões do calendário", () => {
  it("área própria; o link do Google é só do dono; a Visão geral é de todos (os blocos seguem a função)", () => {
    expect(apiRequirement("/api/calendar", "GET")).toEqual({ area: "calendario", level: "view" });
    expect(apiRequirement("/api/calendar/events/x", "PUT")).toEqual({ area: "calendario", level: "edit" });
    expect(apiRequirement("/api/calendar/feed", "POST")).toBe("owner");
    expect(pageRequirement("/app/calendario")).toEqual({ area: "calendario", level: "view" });
    expect(pageRequirement("/app/visao-geral")).toBe("any");
    expect(apiRequirement("/api/preferences/overview", "PATCH")).toBe("any");
    for (const r of ["EMISSOR", "ATENDIMENTO", "FINANCEIRO", "ADMIN"] as const) expect(rolePermissions(r)).toContain("calendario:edit");
    expect(rolePermissions("CONTADOR").some((p) => p.startsWith("calendario"))).toBe(false);
    // blocos: os da função, na ordem escolhida; os escondidos para "Adicionar"
    const atend = rolePermissions("ATENDIMENTO");
    expect(visibleWidgets([], atend)).toEqual(["agenda", "tarefas", "kpis", "emissoes", "clientes", "atalhos"]); // CRM Milhas: emissões
    expect(visibleWidgets(["clientes", "financeiro", "agenda"], atend)).toEqual(["clientes", "agenda"]);
    expect(hiddenWidgets(["clientes", "agenda"], atend)).toEqual(["tarefas", "kpis", "emissoes", "atalhos"]);
    expect(visibleWidgets([], "ALL")).toHaveLength(9);
  });
});

/* ---------------- Serviço e rotas ---------------- */

let c: Client, o: Client, userId: string, acc: string;
const today = brDay();
const d = (n: number) => addDays(today, n);
const get = (cl: Client, from = d(-1), to = d(40), extra = "") => cl.call(calendar.GET, "GET", `/api/calendar?from=${from}&to=${to}${extra}`);

async function sale(items: object[], customerIds: string[] = []) {
  const r = await c.call(sales.POST, "POST", "/api/sales", { origin: "OWN", accountId: acc, occurredAt: today, items: items.map((i) => ({ issuedWith: "POINTS", points: 1_000, salePriceCents: 10_000, passengers: 1, customerIds, ...i })) });
  expect(r.status).toBe(201);
  return r.data.item.id as string;
}
async function join(memberId: string, role: string) {
  const inv = await c.call(inviteRoute.POST, "POST", `/api/team/members/${memberId}/invite`, { role }, { id: memberId });
  expect(inv.status).toBe(201);
  const m = new Client();
  expect((await m.call(acceptRoute.POST, "POST", "/api/auth/invite/x", { name: "Membro", password: "senha-do-membro-1" }, { token: inv.data.item.link.split("/convite/")[1] })).status).toBe(201);
  return m;
}

beforeEach(async () => {
  await resetDb();
  await seedPrograms();
  c = new Client();
  userId = (await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" })).data.user.id;
  o = new Client();
  await o.call(register.POST, "POST", "/r", { name: "Outro", email: "o@x.test", password: "senha-forte-2" });
  const p = await prisma.program.findFirstOrThrow({ where: { code: "LATAM" } });
  const h = (await c.call(holders.POST, "POST", "/h", { name: "Ana" })).data.item.id;
  acc = (await c.call(accounts.POST, "POST", "/a", { holderId: h, programId: p.id })).data.item.id;
  await c.call(entries.POST, "POST", "/e", { accountId: acc, type: "PURCHASE", points: 100_000, occurredAt: today, costs: [{ type: "PONTOS", amountCents: 250_000 }] });
});

describe("eventos automáticos", () => {
  it("voo (embarque, volta e check-in), hospedagem, tarefa, aniversários e vencimentos; reembolsada some; outra conta não vê", async () => {
    const maria = (await c.call(customers.POST, "POST", "/api/customers", { name: "Maria Souza" })).data;
    const mariaId = maria.item?.id ?? maria.id;
    await sale([{ kind: "FLIGHT", origin: "GRU", destination: "LIS", departureDate: d(10), returnDate: d(15), reservation: "ABC123" }, { kind: "HOTEL", issuedWith: "CASH", points: 0, description: "Hotel Lisboa", departureDate: d(10), returnDate: d(14) }], [mariaId]);
    const refunded = await sale([{ kind: "FLIGHT", origin: "GRU", destination: "MIA", departureDate: d(12) }]);
    expect((await c.call(refund.POST, "POST", "/r", { feeCents: 0, date: today }, { id: refunded })).status).toBe(200);
    await c.call(tasks.POST, "POST", "/api/tasks", { title: "Emitir pedido 12", priority: "HIGH", dueDate: d(3), dueTime: "10:00" });
    const born = `${Number(d(7).slice(0, 4)) - 30}${d(7).slice(4)}`;
    await c.call(passengers.POST, "POST", "/api/passengers", { name: "Pedro Lima", birthDate: born });
    const holder = await prisma.holder.findFirstOrThrow({ where: { userId } });
    await prisma.holder.update({ where: { id: holder.id }, data: { birthDate: new Date(`${born}T00:00:00Z`) } });
    const conta = await prisma.finAccount.create({ data: { userId, name: "Banco", kind: "BANK" } });
    await prisma.finTransaction.create({ data: { userId, type: "EXPENSE", accountId: conta.id, category: "Escritório", description: "Aluguel", amountCents: 150_000, competence: new Date(`${d(5)}T00:00:00Z`), dueDate: new Date(`${d(5)}T00:00:00Z`) } });

    const ev: CalEvent[] = (await get(c)).data.events;
    const pick = (kind: string) => ev.filter((e) => e.kind === kind).map((e) => [e.title, e.date, e.endDate]);
    expect(pick("BOARDING")).toEqual([["Embarque · GRU → LIS", d(10), null], ["Volta · LIS → GRU", d(15), null]]);
    expect(pick("CHECKIN")).toEqual([["Check-in · GRU → LIS", d(8), null], ["Check-in · LIS → GRU", d(13), null]]);
    expect(pick("HOTEL")).toEqual([["Hospedagem · Hotel Lisboa", d(10), d(14)]]);
    expect(pick("TASK")).toEqual([["Emitir pedido 12", d(3), null]]);
    expect(pick("BIRTHDAY").map((x) => x[0])).toEqual(["Aniversário · Ana", "Aniversário · Pedro Lima"]);
    expect(pick("FINANCE")).toEqual([["A pagar · Aluguel", d(5), null]]);
    const board = ev.find((e) => e.kind === "BOARDING")!;
    expect(board).toMatchObject({ editable: false, source: "SALE", customer: { name: "Maria Souza" }, detail: "Maria Souza · Localizador ABC123" });
    expect(board.href).toMatch(/^\/app\/sales\?edit=/);
    expect(ev.find((e) => e.kind === "TASK")).toMatchObject({ time: "10:00", detail: "Prioridade alta" });
    expect(ev.find((e) => e.title === "Aniversário · Pedro Lima")!.detail).toBe("30 anos · passageiro");
    // a hospedagem aparece num período que só pega o meio dela
    expect((await get(c, d(12), d(12))).data.events.map((e: CalEvent) => e.kind)).toEqual(["HOTEL"]);
    expect((await get(o)).data.events).toEqual([]);
    // período inválido
    expect((await get(c, d(5), d(1))).status).toBe(400);
    expect((await get(c, d(0), d(500))).status).toBe(400); // mais de 450 dias
  });
});

describe("eventos criados aqui", () => {
  it("cria, repete, edita e apaga; valida; filtro por responsável; isolado", async () => {
    const bia = (await c.call(members.POST, "POST", "/m", { name: "Bia" })).data.id as string;
    const other = (await o.call(members.POST, "POST", "/m", { name: "Zé" })).data.id as string;
    const body = { kind: "FOLLOWUP", title: "Ligar para a Maria", date: d(2), time: "09:00", endTime: "09:30", recurrence: "WEEKLY", memberIds: [bia], notes: "Sobre a cotação" };
    expect((await c.call(eventsRoute.POST, "POST", "/x", { ...body, endTime: "08:00" })).status).toBe(400); // fim antes do começo
    expect((await c.call(eventsRoute.POST, "POST", "/x", { ...body, kind: "TASK" })).status).toBe(400); // tarefa é no quadro
    expect((await c.call(eventsRoute.POST, "POST", "/x", { ...body, time: "9h" })).status).toBe(400);
    expect((await c.call(eventsRoute.POST, "POST", "/x", { ...body, memberIds: [other] })).status).toBe(404);
    const r = await c.call(eventsRoute.POST, "POST", "/x", body);
    expect(r.status).toBe(201);
    let ev: CalEvent[] = (await get(c, d(0), d(20))).data.events;
    expect(ev.map((e) => e.date)).toEqual([d(2), d(9), d(16)]);
    expect(ev[1]).toMatchObject({ eventId: r.data.id, seriesDate: d(2), editable: true, time: "09:00", endTime: "09:30", recurrence: "WEEKLY", memberIds: [bia], source: "MANUAL" });
    // filtro por responsável: a venda emitida pela Bia entra; a sem responsável não
    const s = await sale([{ kind: "FLIGHT", origin: "GRU", destination: "SSA", departureDate: d(4) }]);
    await c.call(issuersRoute.POST, "POST", "/i", { memberIds: [bia] }, { id: s });
    await sale([{ kind: "FLIGHT", origin: "GRU", destination: "REC", departureDate: d(4) }]);
    const mine: CalEvent[] = (await get(c, d(0), d(20), `&membro=${bia}`)).data.events;
    expect(mine.filter((e) => e.kind === "BOARDING").map((e) => e.title)).toEqual(["Embarque · GRU → SSA"]);
    expect(mine.filter((e) => e.kind === "FOLLOWUP")).toHaveLength(3);
    // editar vale para a série; vários dias
    expect((await c.call(eventRoute.PUT, "PUT", "/x", { kind: "VISA", title: "Visto da Maria", date: d(1), endDate: d(3) }, { id: r.data.id })).status).toBe(200);
    ev = (await get(c, d(0), d(20))).data.events.filter((e: CalEvent) => e.source === "MANUAL");
    expect(ev.map((e) => [e.kind, e.date, e.endDate, e.time, e.recurrence])).toEqual([["VISA", d(1), d(3), null, "NONE"]]);
    // outra conta não mexe
    expect((await o.call(eventRoute.PUT, "PUT", "/x", body, { id: r.data.id })).status).toBe(404);
    expect((await o.call(eventRoute.DELETE, "DELETE", "/x", undefined, { id: r.data.id })).status).toBe(404);
    expect((await c.call(eventRoute.DELETE, "DELETE", "/x", undefined, { id: r.data.id })).status).toBe(200);
    expect(await prisma.calendarEvent.count()).toBe(0);
  });

  it("importa .ics (de novo atualiza, sem duplicar) e o link do Google Agenda (só o dono; trocar e desligar)", async () => {
    const ics = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:1@g", `DTSTART;VALUE=DATE:${d(3).replace(/-/g, "")}`, "SUMMARY:Feriado", "END:VEVENT",
      "BEGIN:VEVENT", "UID:2@g", `DTSTART:${d(4).replace(/-/g, "")}T130000Z`, "SUMMARY:Reunião", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    expect((await c.call(importRoute.POST, "POST", "/x", { ics: "não é ics", kind: "REMINDER" })).status).toBe(400);
    expect((await c.call(importRoute.POST, "POST", "/x", { ics, kind: "REMINDER" })).data).toMatchObject({ created: 2, updated: 0 });
    expect((await c.call(importRoute.POST, "POST", "/x", { ics: ics.replace("Feriado", "Feriado nacional"), kind: "REMINDER" })).data).toMatchObject({ created: 0, updated: 2 });
    const ev: CalEvent[] = (await get(c, d(0), d(10))).data.events;
    expect(ev.map((e) => [e.title, e.date, e.time, e.source])).toEqual([["Feriado nacional", d(3), null, "IMPORT"], ["Reunião", d(4), "10:00", "IMPORT"]]);
    expect(await prisma.calendarEvent.count({ where: { userId } })).toBe(2);

    // link do Google Agenda
    expect((await c.call(feedRoute.GET, "GET", "/api/calendar/feed")).data).toEqual({ active: false, createdAt: null });
    const f = await c.call(feedRoute.POST, "POST", "/api/calendar/feed");
    expect(f.status).toBe(201);
    const token = (f.data.url as string).split("/feed/")[1]!;
    expect(token).toMatch(/\.ics$/);
    const read = (t: string) => feedPublic.GET(new Request(`http://localhost:3100/api/calendar/feed/${t}`), { params: Promise.resolve({ token: t }) });
    let res = await read(token);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    const text = await res.text();
    expect(text).toContain("SUMMARY:Feriado nacional");
    expect(text).toContain("X-WR-CALNAME:Ana · MilhasX");
    expect((await read("token-que-nao-existe-123456")).status).toBe(404);
    const f2 = await c.call(feedRoute.POST, "POST", "/api/calendar/feed");
    expect((await read(token)).status).toBe(404); // o antigo para de funcionar
    const token2 = (f2.data.url as string).split("/feed/")[1]!;
    expect((await read(token2)).status).toBe(200);
    expect((await c.call(feedRoute.DELETE, "DELETE", "/api/calendar/feed")).status).toBe(200);
    res = await read(token2);
    expect(res.status).toBe(404);
  });
});

describe("equipe com login", () => {
  it("o membro vê só os automáticos das áreas dele; sem a área, nada; o link do Google é só do dono", async () => {
    await sale([{ kind: "FLIGHT", origin: "GRU", destination: "LIS", departureDate: d(10) }]);
    await c.call(passengers.POST, "POST", "/api/passengers", { name: "Pedro", birthDate: `1990${d(6).slice(4)}` });
    const conta = await prisma.finAccount.create({ data: { userId, name: "Banco", kind: "BANK" } });
    await prisma.finTransaction.create({ data: { userId, type: "INCOME", accountId: conta.id, category: "Vendas", description: "Recebível", amountCents: 1_000, competence: new Date(`${d(5)}T00:00:00Z`), dueDate: new Date(`${d(5)}T00:00:00Z`) } });
    await c.call(eventsRoute.POST, "POST", "/x", { kind: "REMINDER", title: "Reunião de equipe", date: d(1) });
    const bia = (await c.call(members.POST, "POST", "/m", { name: "Bia", email: "bia@x.test" })).data.id as string;
    const caio = (await c.call(members.POST, "POST", "/m", { name: "Caio", email: "caio@x.test" })).data.id as string;
    const atend = await join(bia, "ATENDIMENTO");
    const contador = await join(caio, "CONTADOR");
    const kinds = (r: { data: { events: CalEvent[] } }) => [...new Set(r.data.events.map((e) => e.kind))].sort();
    expect(kinds(await get(c))).toEqual(["BIRTHDAY", "BOARDING", "CHECKIN", "FINANCE", "REMINDER"]);
    expect(kinds(await get(atend))).toEqual(["BIRTHDAY", "BOARDING", "CHECKIN", "REMINDER"]); // sem Financeiro
    expect((await get(contador)).status).toBe(403);
    expect((await atend.call(eventsRoute.POST, "POST", "/api/calendar/events", { kind: "REMINDER", title: "Meu lembrete", date: d(2) })).status).toBe(201);
    expect((await atend.call(feedRoute.POST, "POST", "/api/calendar/feed")).status).toBe(403);
  });
});

describe("aviso do dia e Visão geral", () => {
  it("'Agenda de hoje' sai uma vez por dia, só com o que avisa", async () => {
    expect(await notifyTodayEvents(userId)).toBe(false); // nada hoje
    await c.call(eventsRoute.POST, "POST", "/x", { kind: "REMINDER", title: "Sem aviso", date: today, remind: false });
    expect(await notifyTodayEvents(userId)).toBe(false);
    await c.call(eventsRoute.POST, "POST", "/x", { kind: "FOLLOWUP", title: "Ligar para a Maria", date: today, time: "15:00" });
    await sale([{ kind: "FLIGHT", origin: "GRU", destination: "LIS", departureDate: today }]);
    expect(await notifyTodayEvents(userId)).toBe(true);
    expect(await notifyTodayEvents(userId)).toBe(false);
    const n = await prisma.notification.findFirstOrThrow({ where: { userId, key: `agenda:${today}` } });
    expect(n.title).toBe("Agenda de hoje: 2 eventos");
    expect(n.body).toContain("Embarque · GRU → LIS");
    expect(n.body).toContain("15:00 Ligar para a Maria");
    expect(n.body).not.toContain("Sem aviso");
  });

  it("blocos da Visão geral: os dados de cada um e a escolha de cada pessoa", async () => {
    await c.call(tasks.POST, "POST", "/api/tasks", { title: "Atrasada", priority: "URGENT", dueDate: d(-2) });
    await c.call(eventsRoute.POST, "POST", "/x", { kind: "REMINDER", title: "Amanhã", date: d(1) });
    const data = await overviewData(userId, visibleWidgets([], "ALL"), { perms: "ALL" });
    expect(Object.keys(data).sort()).toEqual(["agenda", "clientes", "emissoes", "financeiro", "kpis", "metas", "milhas", "tarefas"]);
    expect(data.agenda!.events.map((e) => e.title)).toEqual(["Amanhã"]);
    expect(data.tarefas!.tasks.map((t) => [t.title, t.dueDate])).toEqual([["Atrasada", d(-2)]]);
    expect(data.milhas).toMatchObject({ balance: 100_000, accounts: 1 });
    expect(data.emissoes!.stages.map((s) => s.key)).toEqual(["NEW", "NEGOTIATION", "AWAITING", "ISSUED", "PAID"]);
    expect(Object.keys(await overviewData(userId, ["kpis"], { perms: "ALL" }))).toEqual(["kpis"]);
    // preferências: só chaves válidas, sem repetir, por pessoa
    const r = await c.call(overviewPrefs.PATCH, "PATCH", "/api/preferences/overview", { widgets: ["tarefas", "agenda", "nao-existe", "agenda"] });
    expect(r.data.widgets).toEqual(["tarefas", "agenda"]);
    expect((await prisma.userPreference.findUniqueOrThrow({ where: { userId } })).overviewWidgets).toEqual(["tarefas", "agenda"]);
  });
});
