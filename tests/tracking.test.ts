// Acompanhamentos: as linhas de cada item (voo em trechos), a situação, os períodos, os indicadores, a busca,
// as viagens do mapa (ida e volta em vendas diferentes), a marcação que sobrevive à edição da venda, as rotas,
// as permissões e o calendário com companhia, horário e check-in feito. Isolado por conta.
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client, seedPrograms } from "./helpers";
import { prisma } from "@/server/db";
import { brDay } from "@/domain/brasilia";
import { addDays, type CalEvent } from "@/domain/calendar";
import { apiRequirement, pageRequirement } from "@/domain/permissions";
import { COORDS, pointOf, project, MAP_W, MAP_H, placeName } from "@/domain/geo";
import { AIRPORTS } from "@/domain/airports";
import {
  rowsOf, rowStatus, isPending, periodRange, inRange, previousRange, trackKpis, matches, mapTrips, activeClients, brNow, tabOfKind,
  type TrackItem, type Trip,
} from "@/domain/tracking";
import { carryMarks } from "@/server/services/sales";
import * as register from "@/app/api/auth/register/route";
import * as holders from "@/app/api/holders/route";
import * as accounts from "@/app/api/accounts/route";
import * as entries from "@/app/api/entries/route";
import * as sales from "@/app/api/sales/route";
import * as saleRoute from "@/app/api/sales/[id]/route";
import * as refund from "@/app/api/sales/[id]/refund/route";
import * as customers from "@/app/api/customers/route";
import * as members from "@/app/api/team/members/route";
import * as inviteRoute from "@/app/api/team/members/[id]/invite/route";
import * as acceptRoute from "@/app/api/auth/invite/[token]/route";
import * as tracking from "@/app/api/tracking/route";
import * as mapRoute from "@/app/api/tracking/map/route";
import * as itemRoute from "@/app/api/tracking/items/[id]/route";
import * as calendar from "@/app/api/calendar/route";

const T = "2026-11-12";
const item = (o: Partial<TrackItem> & Pick<TrackItem, "id" | "kind">): TrackItem => ({
  saleId: `s-${o.id}`, origin: null, destination: null, departureDate: null, returnDate: null, departureTime: null, returnTime: null, provider: null,
  reservation: null, passengers: 1, description: null, customers: [], issuerIds: [], valueCents: 10_000, program: null, doneOutAt: null, doneRetAt: null, ...o,
});

describe("linhas, situação e períodos", () => {
  it("voo com volta vira dois trechos (valor só na ida); o resto vira uma linha; sem data não entra", () => {
    const v = rowsOf(item({ id: "v", kind: "FLIGHT", origin: "GRU", destination: "LIS", departureDate: "2026-11-13", departureTime: "10:30", returnDate: "2026-11-20", returnTime: "18:00", doneRetAt: "x" }));
    expect(v.map((r) => [r.id, r.leg, r.from, r.to, r.date, r.time, r.valueCents, r.done])).toEqual([
      ["v:out", "OUT", "GRU", "LIS", "2026-11-13", "10:30", 10_000, false],
      ["v:ret", "RET", "LIS", "GRU", "2026-11-20", "18:00", 0, true],
    ]);
    const h = rowsOf(item({ id: "h", kind: "HOTEL", destination: "LIS", departureDate: "2026-11-13", returnDate: "2026-11-16", provider: "Hotel Avenida" }));
    expect(h).toMatchObject([{ id: "h", leg: "STAY", place: "LIS", from: null, endDate: "2026-11-16", hasReturn: true }]);
    expect(rowsOf(item({ id: "b", kind: "BAGGAGE", origin: "GRU", destination: "MIA", departureDate: "2026-11-13" }))).toMatchObject([{ leg: "STAY", from: "GRU", to: "MIA", place: null }]);
    expect(rowsOf(item({ id: "x", kind: "FLIGHT", origin: "GRU", destination: "LIS" }))).toEqual([]);
    expect([tabOfKind("FLIGHT"), tabOfKind("TRANSFER"), tabOfKind("SEAT"), tabOfKind("INSURANCE")]).toEqual(["voos", "transportes", "adicionais", "seguros"]);
  });

  it("situação: voou, hoje, amanhã, em N dias; hospedado, encerrada; seguro vigente e vencido; pendência na janela", () => {
    const at = (o: Partial<TrackItem>) => rowsOf(item({ id: "a", kind: "FLIGHT", origin: "GRU", destination: "LIS", ...o }))[0]!;
    expect(rowStatus(at({ departureDate: "2026-11-11" }), T)).toMatchObject({ key: "past", label: "Voou" });
    expect(rowStatus(at({ departureDate: T, departureTime: "22:10" }), T)).toMatchObject({ key: "today", label: "Hoje, 22:10" });
    expect(rowStatus(at({ departureDate: "2026-11-13" }), T).label).toBe("Amanhã");
    expect(rowStatus(at({ departureDate: "2026-11-20" }), T).label).toBe("Em 8 dias");
    const hotel = (dep: string, ret: string) => rowsOf(item({ id: "h", kind: "HOTEL", destination: "LIS", departureDate: dep, returnDate: ret }))[0]!;
    expect(rowStatus(hotel("2026-11-10", "2026-11-14"), T)).toMatchObject({ key: "ongoing", label: "Hospedado" });
    expect(rowStatus(hotel("2026-11-01", "2026-11-05"), T).label).toBe("Encerrada");
    const ins = (dep: string, ret: string) => rowsOf(item({ id: "s", kind: "INSURANCE", destination: "LIS", departureDate: dep, returnDate: ret }))[0]!;
    expect(rowStatus(ins("2026-11-01", "2026-11-30"), T).label).toBe("Vigente");
    expect(rowStatus(ins("2026-10-01", "2026-10-30"), T).label).toBe("Vencido");
    // check-in: 2 dias antes; o resto, 7 dias
    expect(isPending(at({ departureDate: "2026-11-14" }), T)).toBe(true);
    expect(isPending(at({ departureDate: "2026-11-15" }), T)).toBe(false);
    expect(isPending(at({ departureDate: "2026-11-14", doneOutAt: "x" }), T)).toBe(false);
    expect(isPending(at({ departureDate: "2026-11-11" }), T)).toBe(false);
    expect(isPending(hotel("2026-11-19", "2026-11-21"), T)).toBe(true);
    expect(isPending(hotel("2026-11-20", "2026-11-21"), T)).toBe(false);
  });

  it("períodos: próximos (com a hospedagem em andamento), 7 e 30 dias, todos (um ano), personalizado e o anterior", () => {
    expect(periodRange("proximos", T)).toEqual({ from: T, to: null });
    expect(periodRange("7", T)).toEqual({ from: T, to: "2026-11-19" });
    expect(periodRange("todos", T)).toEqual({ from: "2025-11-12", to: null });
    expect(periodRange("custom", T, { from: "2026-12-01", to: "2026-12-31" })).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    const ongoing = rowsOf(item({ id: "h", kind: "HOTEL", departureDate: "2026-11-10", returnDate: "2026-11-14" }))[0]!;
    expect(inRange(ongoing, periodRange("proximos", T))).toBe(true);
    expect(inRange(ongoing, { from: "2026-11-15", to: null })).toBe(false);
    expect(previousRange({ from: "2026-11-12", to: "2026-11-18" })).toEqual({ from: "2026-11-05", to: "2026-11-11" });
    expect(previousRange({ from: T, to: null })).toBeNull();
  });

  it("indicadores e busca (cidade sem acento, companhia, localizador, cliente)", () => {
    const rows = [
      ...rowsOf(item({ id: "1", kind: "FLIGHT", origin: "GRU", destination: "LIS", departureDate: "2026-11-13", returnDate: "2026-11-20", passengers: 2, reservation: "abc123", provider: "LATAM", customers: [{ id: "c1", name: "Maria Souza" }] })),
      ...rowsOf(item({ id: "2", kind: "FLIGHT", origin: "GRU", destination: "MIA", departureDate: "2026-11-30", passengers: 1, reservation: "ABC123", valueCents: 5_000 })),
    ];
    expect(trackKpis(rows, T)).toEqual({ valueCents: 15_000, count: 3, people: 3, reservations: 1, missing: 1, pending: 1, now: 0 });
    const find = (q: string) => rows.filter((r) => matches(r, q)).map((r) => r.id);
    expect(find("lisboa")).toEqual(["1:out", "1:ret"]);
    expect(find("MIAMI")).toEqual(["2:out"]);
    expect(find("latam")).toEqual(["1:out", "1:ret"]);
    expect(find("maria lis")).toEqual(["1:out", "1:ret"]);
    expect(find("são paulo")).toHaveLength(3);
    expect(find("xyz")).toEqual([]);
  });
});

describe("mapa de viagens", () => {
  const now = { day: T, time: "09:00" };
  const maria = { id: "c1", name: "Maria" }, joao = { id: "c2", name: "João" };
  it("em viagem, embarque em 48h (com e sem horário) e retorno hoje; fora da janela não aparece", () => {
    const trips = mapTrips([
      item({ id: "a", kind: "FLIGHT", origin: "GRU", destination: "LIS", departureDate: "2026-11-10", returnDate: "2026-11-17", customers: [maria] }),
      item({ id: "b", kind: "FLIGHT", origin: "CNF", destination: "MIA", departureDate: "2026-11-14", departureTime: "08:00", customers: [joao] }), // 47h
      item({ id: "c", kind: "FLIGHT", origin: "CNF", destination: "MCO", departureDate: "2026-11-14", departureTime: "10:00" }), // 49h
      item({ id: "d", kind: "FLIGHT", origin: "POA", destination: "SCL", departureDate: "2026-11-05", returnDate: T, returnTime: "07:00" }),
      item({ id: "e", kind: "FLIGHT", origin: "GIG", destination: "SSA", departureDate: T }), // hoje, sem horário: ainda não saiu
      item({ id: "f", kind: "FLIGHT", origin: "GRU", destination: "REC", departureDate: "2026-11-01", returnDate: "2026-11-08" }), // acabou
    ], now);
    expect(trips.map((t) => [t.id, t.status, t.at])).toEqual([
      ["trip:e:out", "boarding", "GIG"], ["trip:b:out", "boarding", "CNF"], ["trip:d:out", "returning", "SCL"], ["trip:a:out", "traveling", "LIS"],
    ]);
    expect(activeClients(trips)).toBe(4); // Maria, João e duas sem cliente
  });

  it("ida e volta emitidas em vendas diferentes viram uma viagem (mesmo cliente); de outro cliente, não", () => {
    const ida = item({ id: "i", saleId: "A", kind: "FLIGHT", origin: "GRU", destination: "LIS", departureDate: "2026-11-08", customers: [maria] });
    const volta = item({ id: "v", saleId: "B", kind: "FLIGHT", origin: "LIS", destination: "GRU", departureDate: "2026-11-25", customers: [maria] });
    const [t] = mapTrips([ida, volta], now);
    expect(t).toMatchObject({ status: "traveling", at: "LIS", saleIds: ["A", "B"], start: "2026-11-08", end: "2026-11-25" });
    expect(mapTrips([ida, { ...volta, customers: [joao] }], now)).toEqual([]); // só ida (de outro dia) não aparece
  });

  it("hospedagem e cruzeiro entram quando o cliente não tem voo no mapa", () => {
    const trips: Trip[] = mapTrips([
      item({ id: "v", saleId: "S1", kind: "FLIGHT", origin: "GRU", destination: "LIS", departureDate: "2026-11-10", returnDate: "2026-11-17", customers: [maria] }),
      item({ id: "h1", saleId: "S2", kind: "HOTEL", destination: "LIS", departureDate: "2026-11-10", returnDate: "2026-11-17", customers: [maria] }),
      item({ id: "h2", saleId: "S3", kind: "HOTEL", destination: "FLN", departureDate: "2026-11-11", returnDate: T, customers: [joao] }),
      item({ id: "cr", saleId: "S4", kind: "CRUISE", destination: "RIO", departureDate: "2026-11-13", returnDate: "2026-11-20" }),
    ], now);
    expect(trips.map((t) => [t.id, t.status, t.at, t.kind])).toEqual([
      ["trip:cr", "boarding", "RIO", "CRUISE"], ["trip:v:out", "traveling", "LIS", "FLIGHT"], ["trip:h2", "traveling", "FLN", "HOTEL"],
    ]);
  });

  it("hora de Brasília, coordenadas e projeção", () => {
    expect(brNow(new Date("2026-11-12T12:30:00Z"))).toEqual({ day: "2026-11-12", time: "09:30" });
    expect(brNow(new Date("2026-11-13T01:00:00Z"))).toEqual({ day: "2026-11-12", time: "22:00" });
    expect(AIRPORTS.filter((a) => !COORDS[a.code]).map((a) => a.code)).toEqual([]); // todo aeroporto da lista tem coordenada
    const [x, y] = project(0, 0);
    expect(x).toBe(MAP_W / 2);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(MAP_H);
    expect(pointOf("GRU")![0]).toBeLessThan(pointOf("LIS")![0]); // São Paulo a oeste de Lisboa
    expect(pointOf("GRU")![1]).toBeGreaterThan(pointOf("LIS")![1]); // e ao sul
    expect(pointOf("ZZZ")).toBeNull();
    expect([placeName("GIG"), placeName("NYC"), placeName("ZZZ"), placeName(null)]).toEqual(["Rio de Janeiro", "Nova York", "ZZZ", null]);
  });
});

describe("marcação na edição da venda", () => {
  it("continua no trecho igual; some quando muda o dia, o destino ou o tipo", () => {
    const at = new Date("2026-11-10T12:00:00Z");
    const d = (s: string) => new Date(`${s}T00:00:00Z`);
    const old = [
      { kind: "FLIGHT", origin: "GRU", destination: "LIS", departureDate: d("2026-11-20"), returnDate: d("2026-11-27"), doneOutAt: at, doneRetAt: at },
      { kind: "HOTEL", origin: null, destination: "LIS", departureDate: d("2026-11-20"), returnDate: d("2026-11-27"), doneOutAt: at, doneRetAt: null },
    ];
    const base = { issuedWith: "POINTS" as const, points: 1, salePriceCents: 1, clientType: "FINAL" as const };
    expect(carryMarks(old, [
      { ...base, kind: "FLIGHT", origin: "GRU", destination: "LIS", departureDate: d("2026-11-20"), returnDate: d("2026-11-28") },
      { ...base, kind: "HOTEL", destination: "LIS", departureDate: d("2026-11-20"), returnDate: d("2026-11-28") },
    ])).toEqual([{ doneOutAt: at, doneRetAt: null }, { doneOutAt: at, doneRetAt: null }]);
    expect(carryMarks(old, [{ ...base, kind: "FLIGHT", origin: "GRU", destination: "OPO", departureDate: d("2026-11-20"), returnDate: d("2026-11-27") }])).toEqual([{ doneOutAt: null, doneRetAt: null }]);
    expect(carryMarks(old, [{ ...base, kind: "SEAT", origin: "GRU", destination: "LIS", departureDate: d("2026-11-20") }])).toEqual([{ doneOutAt: null, doneRetAt: null }]);
  });
});

describe("permissões", () => {
  it("acompanhamentos seguem Vendas: ver para listar, editar para marcar", () => {
    expect(apiRequirement("/api/tracking", "GET")).toEqual({ area: "vendas", level: "view" });
    expect(apiRequirement("/api/tracking/map", "GET")).toEqual({ area: "vendas", level: "view" });
    expect(apiRequirement("/api/tracking/items/x", "PATCH")).toEqual({ area: "vendas", level: "edit" });
    expect(pageRequirement("/app/acompanhamentos/voos")).toEqual({ area: "vendas", level: "view" });
    expect(pageRequirement("/app/acompanhamentos/mapa")).toEqual({ area: "vendas", level: "view" });
  });
});

/* ---------------- Serviço e rotas ---------------- */

let c: Client, o: Client, acc: string;
const today = brDay();
const d = (n: number) => addDays(today, n);
type Row = { id: string; itemId: string; leg: string; done: boolean; provider: string | null; time: string | null; date: string };

async function sale(items: object[], customerIds: string[] = [], cl = c) {
  const r = await cl.call(sales.POST, "POST", "/api/sales", { origin: "OWN", accountId: acc, occurredAt: today, items: items.map((i) => ({ issuedWith: "POINTS", points: 1_000, salePriceCents: 10_000, passengers: 1, customerIds, ...i })) });
  expect(r.status).toBe(201);
  return r.data.item.id as string;
}
const list = (cl: Client, qs: string) => cl.call(tracking.GET, "GET", `/api/tracking?${qs}`);
const patch = (cl: Client, id: string, body: object) => cl.call(itemRoute.PATCH, "PATCH", `/api/tracking/items/${id}`, body, { id });
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
  await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" });
  o = new Client();
  await o.call(register.POST, "POST", "/r", { name: "Outro", email: "o@x.test", password: "senha-forte-2" });
  const p = await prisma.program.findFirstOrThrow({ where: { code: "LATAM" } });
  const h = (await c.call(holders.POST, "POST", "/h", { name: "Ana" })).data.item.id;
  acc = (await c.call(accounts.POST, "POST", "/a", { holderId: h, programId: p.id })).data.item.id;
  await c.call(entries.POST, "POST", "/e", { accountId: acc, type: "PURCHASE", points: 100_000, occurredAt: today, costs: [{ type: "PONTOS", amountCents: 250_000 }] });
});

describe("listas e marcação", () => {
  it("voos em trechos, indicadores, períodos, tipos novos, horário inválido, reembolsada some e outra conta não vê", async () => {
    const maria = (await c.call(customers.POST, "POST", "/api/customers", { name: "Maria Souza" })).data.item.id as string;
    const s1 = await sale([
      { kind: "FLIGHT", origin: "GRU", destination: "LIS", departureDate: d(1), departureTime: "10:30", returnDate: d(8), returnTime: "18:00", provider: "LATAM", reservation: "ABC123", costs: [{ type: "TAXA_EMBARQUE", amountCents: 500 }] },
      { kind: "HOTEL", issuedWith: "CASH", points: 0, cashCostCents: 5_000, destination: "LIS", departureDate: d(1), returnDate: d(8), provider: "Hotel Avenida" },
      { kind: "TRANSFER", issuedWith: "CASH", points: 0, destination: "LIS", departureDate: d(1), departureTime: "21:00" },
      { kind: "CRUISE", issuedWith: "CASH", points: 0, destination: "RIO", departureDate: d(20), returnDate: d(27), provider: "MSC Seaview" },
      { kind: "INSURANCE", issuedWith: "CASH", points: 0, destination: "LIS", departureDate: d(1), returnDate: d(8), provider: "Assist Card" },
      { kind: "BAGGAGE", issuedWith: "CASH", points: 0, origin: "GRU", destination: "LIS", departureDate: d(1) },
    ], [maria]);
    await sale([{ kind: "FLIGHT", origin: "GRU", destination: "SSA", departureDate: d(-30) }]); // passado
    await sale([{ kind: "FLIGHT", origin: "GRU", destination: "REC" }]); // sem data
    const refunded = await sale([{ kind: "FLIGHT", origin: "GRU", destination: "MIA", departureDate: d(3) }]);
    expect((await c.call(refund.POST, "POST", "/x", { feeCents: 0, date: today }, { id: refunded })).status).toBe(200);
    await sale([{ kind: "FLIGHT", origin: "GRU", destination: "POA", departureDate: d(2) }]);

    const v = await list(c, "tipo=voos");
    expect(v.status).toBe(200);
    expect(v.data.rows.map((r: Row) => [r.leg, r.date, r.time, r.provider])).toEqual([
      ["OUT", d(1), "10:30", "LATAM"], ["OUT", d(2), null, null], ["RET", d(8), "18:00", "LATAM"],
    ]);
    expect(v.data.counts).toEqual({ proximos: 3, "7": 2, "30": 3, todos: 4 });
    expect(v.data.undated).toBe(1);
    expect(v.data.kpis).toMatchObject({ valueCents: 10_500 + 10_000, count: 3, people: 2, missing: 1, pending: 2 });
    expect((await list(c, "tipo=voos&periodo=todos")).data.rows).toHaveLength(4);
    expect((await list(c, "tipo=voos&periodo=7")).data.prevValueCents).toBe(0);
    const custom = await list(c, `tipo=voos&periodo=custom&de=${d(-31)}&ate=${d(-29)}`);
    expect(custom.data.rows.map((r: Row) => r.date)).toEqual([d(-30)]);
    expect((await list(c, `tipo=voos&periodo=custom&de=${d(5)}&ate=${d(1)}`)).status).toBe(400);
    expect((await list(c, "tipo=trem")).status).toBe(400);

    for (const [tipo, n] of [["hospedagens", 1], ["transportes", 1], ["cruzeiros", 1], ["seguros", 1], ["adicionais", 1]] as const) {
      expect((await list(c, `tipo=${tipo}`)).data.rows, tipo).toHaveLength(n);
    }
    expect((await list(c, "tipo=hospedagens")).data.rows[0]).toMatchObject({ leg: "STAY", place: "LIS", provider: "Hotel Avenida", endDate: d(8) });
    expect((await list(o, "tipo=voos")).data.rows).toEqual([]);

    const bad = await c.call(sales.POST, "POST", "/api/sales", { origin: "OWN", accountId: acc, occurredAt: today, items: [{ kind: "FLIGHT", issuedWith: "POINTS", points: 10, salePriceCents: 100, passengers: 1, departureDate: d(1), departureTime: "25:00" }] });
    expect(bad.status).toBe(400);
    const s = await prisma.sale.findUniqueOrThrow({ where: { id: s1 }, include: { items: { orderBy: { position: "asc" } } } });
    expect(s.items.map((i) => i.kind)).toEqual(["FLIGHT", "HOTEL", "TRANSFER", "CRUISE", "INSURANCE", "BAGGAGE"]);
    expect(s.items[2]).toMatchObject({ origin: null, destination: "LIS", departureTime: "21:00", returnTime: null });
  });

  it("marca check-in e confirmação, completa companhia e horário; a edição da venda mantém o que não mudou", async () => {
    const id = await sale([
      { kind: "FLIGHT", origin: "GRU", destination: "LIS", departureDate: d(1), returnDate: d(8) },
      { kind: "HOTEL", issuedWith: "CASH", points: 0, destination: "LIS", departureDate: d(1), returnDate: d(8) },
    ]);
    const [flight, hotel] = await prisma.saleItem.findMany({ where: { saleId: id }, orderBy: { position: "asc" } });
    let r = await patch(c, flight!.id, { doneOut: true, provider: "  TAP  ", departureTime: "07:45" });
    expect(r.status).toBe(200);
    expect(r.data.rows.map((x: Row) => [x.leg, x.done, x.provider, x.time])).toEqual([["OUT", true, "TAP", "07:45"], ["RET", false, "TAP", null]]);
    expect((await patch(c, hotel!.id, { doneOut: true })).data.rows[0].done).toBe(true);
    expect((await patch(c, hotel!.id, { doneRet: true })).status).toBe(400);
    expect((await patch(c, flight!.id, {})).status).toBe(400);
    expect((await patch(o, flight!.id, { doneOut: false })).status).toBe(404);
    expect((await list(c, "tipo=voos")).data.kpis).toMatchObject({ pending: 0, missing: 0 });
    expect(await prisma.auditLog.count({ where: { action: "tracking.mark" } })).toBe(2);

    // calendário: check-in feito, horário e companhia
    const ev: CalEvent[] = (await c.call(calendar.GET, "GET", `/api/calendar?from=${d(-2)}&to=${d(10)}`)).data.events;
    expect(ev.find((e) => e.id === `sale:${flight!.id}:dep-checkin`)).toMatchObject({ done: true });
    expect(ev.find((e) => e.id === `sale:${flight!.id}:dep`)).toMatchObject({ time: "07:45", detail: "TAP" });
    expect(ev.find((e) => e.id === `sale:${flight!.id}:ret-checkin`)).toMatchObject({ done: false });

    // edita a venda: muda só a volta do voo
    const view = (await c.call(saleRoute.GET, "GET", `/api/sales/${id}`, undefined, { id })).data.item;
    const items = view.items.map((i: Record<string, unknown>) => ({
      kind: i.kind, issuedWith: i.issuedWith, points: i.points, salePriceCents: i.salePriceCents, passengers: i.passengers, origin: i.origin, destination: i.destination,
      departureDate: String(i.departureDate).slice(0, 10), returnDate: i.kind === "FLIGHT" ? d(9) : String(i.returnDate).slice(0, 10), departureTime: i.departureTime, provider: i.provider,
    }));
    expect((await c.call(saleRoute.PATCH, "PATCH", `/api/sales/${id}`, { origin: "OWN", accountId: acc, occurredAt: today, items }, { id })).status).toBe(200);
    const after = await prisma.saleItem.findMany({ where: { saleId: id }, orderBy: { position: "asc" } });
    expect(after.map((i) => [i.kind, !!i.doneOutAt, i.provider, i.departureTime])).toEqual([["FLIGHT", true, "TAP", "07:45"], ["HOTEL", true, null, null]]);
  });

  it("mapa: embarque em 48h, em viagem e ida e volta separadas do mesmo cliente", async () => {
    const maria = (await c.call(customers.POST, "POST", "/api/customers", { name: "Maria" })).data.item.id as string;
    await sale([{ kind: "FLIGHT", origin: "GRU", destination: "LIS", departureDate: d(1) }]);
    await sale([{ kind: "FLIGHT", origin: "GRU", destination: "MIA", departureDate: d(-3) }], [maria]);
    await sale([{ kind: "FLIGHT", origin: "MIA", destination: "GRU", departureDate: d(30) }], [maria]);
    await sale([{ kind: "HOTEL", issuedWith: "CASH", points: 0, destination: "FLN", departureDate: d(-1), returnDate: d(2) }]);
    const r = await c.call(mapRoute.GET, "GET", "/api/tracking/map");
    expect(r.status).toBe(200);
    expect(r.data.trips.map((t: Trip) => [t.status, t.at, t.saleIds.length])).toEqual([["boarding", "GRU", 1], ["traveling", "MIA", 2], ["traveling", "FLN", 1]]);
    expect((await o.call(mapRoute.GET, "GET", "/api/tracking/map")).data.trips).toEqual([]);
  });

  it("equipe: quem só vê vendas lista mas não marca; o emissor marca", async () => {
    const id = await sale([{ kind: "FLIGHT", origin: "GRU", destination: "LIS", departureDate: d(1) }]);
    const it = await prisma.saleItem.findFirstOrThrow({ where: { saleId: id } });
    const bia = (await c.call(members.POST, "POST", "/m", { name: "Bia", email: "bia@x.test" })).data.id as string;
    const edu = (await c.call(members.POST, "POST", "/m", { name: "Edu", email: "edu@x.test" })).data.id as string;
    const atend = await join(bia, "ATENDIMENTO");
    const emissor = await join(edu, "EMISSOR");
    expect((await list(atend, "tipo=voos")).data.rows).toHaveLength(1);
    expect((await patch(atend, it.id, { doneOut: true })).status).toBe(403);
    expect((await patch(emissor, it.id, { doneOut: true })).status).toBe(200);
  });
});
