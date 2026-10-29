// CRM de pedidos, captação pela página pública e buscador (endereços e cotações)
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as orders from "@/app/api/orders/route";
import * as order from "@/app/api/orders/[id]/route";
import * as move from "@/app/api/orders/[id]/move/route";
import * as archive from "@/app/api/orders/[id]/archive/route";
import * as quotes from "@/app/api/quotes/route";
import * as quote from "@/app/api/quotes/[id]/route";
import * as searches from "@/app/api/flight-searches/route";
import * as publicOrder from "@/app/api/public/orders/[slug]/route";
import * as salesProfile from "@/app/api/sales-profile/route";
import { ordersDashboard } from "@/server/services/orders";
import { PROGRAM_BY_KEY, SEARCH_PROGRAMS, validateSearch } from "@/domain/flight-search";
import { parseSearchLink, parseOffers, preferredOffer } from "@/domain/quote-paste";
import { whatsappLink, whatsappText, routeLabel, orderSummary, WHATSAPP_TEMPLATES } from "@/domain/orders";
import { prisma } from "@/server/db";

let c: Client;
let userId: string;
beforeEach(async () => {
  await resetDb();
  c = new Client();
  userId = (await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" })).data.user.id;
});
const body = (over: Record<string, unknown> = {}) => ({
  customerName: "Godinho", customerPhone: "(21) 99999-0000", tripType: "ONE_WAY", cabin: "ECONOMY",
  segments: [{ origin: "BSB", destination: "GIG", date: "2027-01-23" }], adults: 1, children: 0, infants: 0, budgetCents: 35000, ...over,
});

describe("CRM de pedidos", () => {
  it("cria com número sequencial, move entre etapas e registra o histórico", async () => {
    const a = await c.call(orders.POST, "POST", "/x", body());
    const b = await c.call(orders.POST, "POST", "/x", body({ customerName: "Bia", tripType: "ROUND_TRIP", segments: [{ origin: "GRU", destination: "LIS", date: "2027-02-01" }, { origin: "LIS", destination: "GRU", date: "2027-02-15" }] }));
    expect([a.status, a.data.item.number, b.data.item.number]).toEqual([201, 1, 2]);
    expect(a.data.item).toMatchObject({ stage: "NEW", route: "BSB → GIG · 23/01/2027" });
    expect(b.data.item.route).toBe("GRU ⇄ LIS · 01/02/2027");
    expect((await c.call(move.POST, "POST", "/x", { stage: "QUOTE_SENT" }, { id: a.data.item.id })).status).toBe(200);
    const d = await c.call(order.GET, "GET", "/x", undefined, { id: a.data.item.id });
    expect(d.data.item.stage).toBe("QUOTE_SENT");
    expect(d.data.item.events.map((e: { type: string }) => e.type)).toEqual(["stage", "created"]);
    // validações
    expect((await c.call(orders.POST, "POST", "/x", body({ segments: [{ origin: "BSB", destination: "BSB", date: null }] }))).status).toBe(400);
    expect((await c.call(orders.POST, "POST", "/x", body({ adults: 1, infants: 2 }))).status).toBe(400);
    expect((await c.call(orders.POST, "POST", "/x", body({ tripType: "ROUND_TRIP" }))).status).toBe(400);
  });

  it("arquiva com motivo, desarquiva e isola por usuário", async () => {
    const a = (await c.call(orders.POST, "POST", "/x", body())).data.item;
    expect((await c.call(archive.POST, "POST", "/x", { reason: "Preço alto" }, { id: a.id })).status).toBe(200);
    expect((await c.call(orders.GET, "GET", "/api/orders")).data.items).toHaveLength(0);
    expect((await c.call(orders.GET, "GET", "/api/orders?archived=1")).data.items[0].archiveReason).toBe("Preço alto");
    expect((await c.call(move.POST, "POST", "/x", { stage: "DONE" }, { id: a.id })).status).toBe(409);
    await c.call(archive.DELETE, "DELETE", "/x", undefined, { id: a.id });
    const o = new Client();
    await o.call(register.POST, "POST", "/r", { name: "Outro", email: "o@x.test", password: "senha-forte-2" });
    expect((await o.call(order.GET, "GET", "/x", undefined, { id: a.id })).status).toBe(404);
    expect((await o.call(move.POST, "POST", "/x", { stage: "DONE" }, { id: a.id })).status).toBe(404);
    expect((await o.call(order.DELETE, "DELETE", "/x", undefined, { id: a.id })).status).toBe(404);
  });

  it("dashboard: totais, destinos, comportamento e pipeline", async () => {
    await c.call(orders.POST, "POST", "/x", body());
    await c.call(orders.POST, "POST", "/x", body({ customerName: "Bia", budgetCents: null, flexibleDates: true, checkedBag: true, cabin: "BUSINESS", segments: [{ origin: "GRU", destination: "GIG", date: "2027-03-10" }] }));
    const d = await ordersDashboard(userId, 30);
    expect(d.totals).toMatchObject({ orders: 2, withBudget: 1, budgetCents: 35000, avgBudgetCents: 35000, customers: 2 });
    expect(d.destinations[0]).toEqual({ name: "Rio de Janeiro (GIG)", value: 2 });
    expect(d.behavior).toMatchObject({ flexiblePct: 50, bagPct: 50, oneWay: 2 });
    expect(d.pipeline.find((p) => p.stage === "NEW")!.count).toBe(2);
  });
});

describe("captação pela página pública", () => {
  it("só com página publicada e aceitando pedidos; limita por IP e avisa o dono", async () => {
    const pub = new Client();
    expect((await pub.call(publicOrder.POST, "POST", "/x", body(), { slug: "ana" })).status).toBe(404);
    await c.call(salesProfile.PUT, "PUT", "/x", { slug: "ana", displayName: "Ana Milhas", programIds: [], published: true });
    const r = await pub.call(publicOrder.POST, "POST", "/x", { ...body(), budgetCents: undefined }, { slug: "ana" });
    expect(r.status).toBe(201);
    const created = await prisma.travelOrder.findFirstOrThrow({ where: { userId } });
    expect(created).toMatchObject({ source: "PUBLIC", stage: "NEW", customerName: "Godinho" });
    expect(await prisma.notification.count({ where: { userId, title: "Novo pedido pela sua página" } })).toBe(1);
    // armadilha para robôs e contato obrigatório
    expect((await pub.call(publicOrder.POST, "POST", "/x", { ...body(), budgetCents: undefined, website: "spam" }, { slug: "ana" })).status).toBe(400);
    expect((await pub.call(publicOrder.POST, "POST", "/x", { ...body(), budgetCents: undefined, customerPhone: null }, { slug: "ana" })).status).toBe(400);
    for (let i = 0; i < 4; i++) await pub.call(publicOrder.POST, "POST", "/x", { ...body(), budgetCents: undefined }, { slug: "ana" });
    expect((await pub.call(publicOrder.POST, "POST", "/x", { ...body(), budgetCents: undefined }, { slug: "ana" })).status).toBe(429);
    // dono desliga a captação
    await c.call(salesProfile.PUT, "PUT", "/x", { slug: "ana", displayName: "Ana Milhas", programIds: [], published: true, acceptsOrders: false });
    expect((await new Client().call(publicOrder.POST, "POST", "/x", { ...body(), budgetCents: undefined }, { slug: "ana" })).status).toBe(404);
  });
});

describe("buscador", () => {
  const p = { origin: "BSB", destination: "GIG", departDate: "2027-01-23", returnDate: "2027-01-30", adults: 2, children: 1, infants: 0, cabin: "ECONOMY" as const };

  it("monta o endereço de busca de cada programa", () => {
    for (const prog of SEARCH_PROGRAMS) expect(() => new URL(prog.build(p)), prog.key).not.toThrow();
    expect(PROGRAM_BY_KEY.latam!.build(p)).toBe("https://www.latamairlines.com/br/pt/oferta-voos?origin=BSB&outbound=2027-01-23T12%3A00%3A00.000Z&destination=GIG&inbound=2027-01-30T12%3A00%3A00.000Z&adt=2&chd=1&inf=0&trip=RT&cabin=Economy&redemption=true&sort=RECOMMENDED");
    const smiles = new URL(PROGRAM_BY_KEY.smiles!.build({ ...p, returnDate: null }));
    expect(Object.fromEntries(smiles.searchParams)).toMatchObject({ tripType: "2", originAirport: "BSB", destinationAirport: "GIG", departureDate: String(Date.UTC(2027, 0, 23, 12)), adults: "2", children: "1", cabin: "ECONOMIC" });
    expect(PROGRAM_BY_KEY.azul!.build(p)).toContain("c[0].std=01/23/2027&c[0].as=GIG&c[1].ds=GIG&c[1].std=01/30/2027");
    expect(PROGRAM_BY_KEY.skyscanner!.build(p)).toContain("/bsb/gig/270123/270130/");
    expect(validateSearch({ ...p, returnDate: "2027-01-01" })).toMatch(/volta/);
    expect(validateSearch({ ...p, origin: "GIG" })).toMatch(/diferentes/);
  });

  it("guarda o histórico e as cotações (ligadas ao pedido)", async () => {
    const o = (await c.call(orders.POST, "POST", "/x", body())).data.item;
    expect((await c.call(searches.POST, "POST", "/x", { params: p, programs: ["smiles", "latam", "inexistente"] })).status).toBe(201);
    expect((await c.call(searches.GET, "GET", "/x")).data.items[0].programs).toEqual(["smiles", "latam"]);
    await c.call(quotes.POST, "POST", "/x", { orderId: o.id, program: "smiles", origin: "BSB", destination: "GIG", departDate: "2027-01-23", cabin: "ECONOMY", adults: 2, miles: 32000, taxesCents: 9800 });
    await c.call(quotes.POST, "POST", "/x", { program: "latam", origin: "BSB", destination: "GIG", departDate: "2027-01-23", cabin: "ECONOMY", adults: 2, miles: 28000 });
    expect((await c.call(quotes.POST, "POST", "/x", { program: "latam", origin: "BSB", destination: "GIG", departDate: "2027-01-23", cabin: "ECONOMY", adults: 2 })).status).toBe(400);
    const list = (await c.call(quotes.GET, "GET", "/api/quotes?origin=BSB&destination=GIG")).data.items;
    expect(list.map((q: { program: string }) => q.program)).toEqual(["latam", "smiles"]); // menor primeiro
    expect((await c.call(quotes.GET, "GET", `/api/quotes?orderId=${o.id}`)).data.items).toHaveLength(1);
    expect((await c.call(order.GET, "GET", "/x", undefined, { id: o.id })).data.item.events[0]).toMatchObject({ type: "quote" });
  });

  it("compara cotações pelo custo em reais e permite editar", async () => {
    await prisma.program.create({ data: { name: "Smiles", code: "SMILES", kind: "MILES", marketValueCpmCents: 1700 } });
    const base = { origin: "BSB", destination: "SDU", departDate: "2027-05-29", cabin: "ECONOMY", adults: 1 };
    await c.call(quotes.POST, "POST", "/x", { ...base, program: "latam", miles: 37746, taxesCents: 9717, cashCents: 107856 });
    const smiles = (await c.call(quotes.POST, "POST", "/x", { ...base, program: "smiles", miles: 41000, taxesCents: 9717, cashCents: 79417 })).data.item;
    await c.call(quotes.POST, "POST", "/x", { ...base, program: "smiles", miles: 30000, taxesCents: 9717 }); // sem dinheiro: 30 × R$ 17 + taxas
    const list = (await c.call(quotes.GET, "GET", "/api/quotes?origin=BSB&destination=SDU")).data.items;
    expect(list.map((q: { miles: number; costCents: number; costEstimated: boolean }) => [q.miles, q.costCents, q.costEstimated])).toEqual([[30000, 60717, true], [41000, 79417, false], [37746, 107856, false]]);

    expect((await c.call(quote.PATCH, "PATCH", "/x", { program: "smiles", miles: 41000, taxesCents: 9717, cashCents: 50000, notes: " direto " }, { id: smiles.id })).data.item).toMatchObject({ cashCents: 50000, notes: "direto" });
    expect((await c.call(quotes.GET, "GET", "/api/quotes?origin=BSB&destination=SDU")).data.items[0].id).toBe(smiles.id);
    expect((await c.call(quote.PATCH, "PATCH", "/x", { program: "smiles", miles: null, cashCents: null }, { id: smiles.id })).status).toBe(400);
    expect((await c.call(quote.PATCH, "PATCH", "/x", { program: "smiles", miles: 1 }, { id: "nao-existe" })).status).toBe(404);
  });

  it("potencial de lucro da cotação pelo CPM médio do estoque no programa", async () => {
    const latam = await prisma.program.create({ data: { name: "LATAM Pass", code: "LATAM", kind: "MILES", marketValueCpmCents: 2450 } });
    const [h1, h2, h3] = await Promise.all(["Ana", "Bia", "Caio"].map((name) => prisma.holder.create({ data: { userId, name } })));
    // CPM médio = (300 + 186) ÷ (20.000 + 10.000) × 1000 = R$ 16,20; a arquivada fica fora
    await prisma.account.createMany({ data: [
      { userId, holderId: h1!.id, programId: latam.id, balance: 20000, costCents: 30000 },
      { userId, holderId: h2!.id, programId: latam.id, balance: 10000, costCents: 18600 },
      { userId, holderId: h3!.id, programId: latam.id, balance: 50000, costCents: 10000, archived: true },
    ] });
    const base = { origin: "BSB", destination: "SDU", departDate: "2027-05-29", cabin: "ECONOMY", adults: 1 };
    // 37.746 × R$ 22 + R$ 97,17 = R$ 927,58 em dinheiro
    await c.call(quotes.POST, "POST", "/x", { ...base, program: "latam", miles: 37746, taxesCents: 9717, cashCents: 92758 });
    await c.call(quotes.POST, "POST", "/x", { ...base, program: "smiles", miles: 41000, taxesCents: 9717, cashCents: 79417 });
    const r = (await c.call(quotes.GET, "GET", "/api/quotes?origin=BSB&destination=SDU")).data;
    expect(r.cpm).toEqual({ latam: 1620 });
    const byProg = Object.fromEntries(r.items.map((q: { program: string; profitCents: number | null }) => [q.program, q.profitCents]));
    expect(byProg).toEqual({ latam: 92758 - 9717 - Math.round((37746 * 1620) / 1000), smiles: null }); // sem estoque Smiles: sem lucro

    // Comprando no balcão: o custo do milheiro da cotação vale no lugar do estoque. A taxa de emissão (5% de
    // R$ 650 = R$ 32,50) é cobrada do cliente: já está no valor em dinheiro e é lucro
    const balcao = (await c.call(quotes.POST, "POST", "/x", { ...base, program: "smiles", miles: 30000, taxesCents: 5000, cashCents: 68250, costCpmCents: 1500, issueFeeCents: 3250, issueFeeBps: 500 })).data.item;
    expect(balcao).toMatchObject({ costCpmCents: 1500, issueFeeCents: 3250, issueFeeBps: 500 });
    const profitOf = async (id: string) => (await c.call(quotes.GET, "GET", "/api/quotes?origin=BSB&destination=SDU")).data.items.find((q: { id: string }) => q.id === id).profitCents;
    expect(await profitOf(balcao.id)).toBe(68250 - 5000 - 45000);
    await c.call(quote.PATCH, "PATCH", "/x", { program: "latam", miles: 30000, taxesCents: 5000, cashCents: 70000, costCpmCents: null, issueFeeCents: 2000, issueFeeBps: null }, { id: balcao.id });
    expect(await profitOf(balcao.id)).not.toBeNull();
    expect((await c.call(quotes.GET, "GET", "/api/quotes?origin=BSB&destination=SDU")).data.items.find((q: { id: string }) => q.id === balcao.id)).toMatchObject({ issueFeeCents: 2000, issueFeeBps: null });
    expect(await profitOf(balcao.id)).toBe(70000 - 5000 - Math.round((30000 * 1620) / 1000)); // sem custo informado: volta ao CPM médio do estoque
  });

  it("colar: lê o link da busca de volta e as opções de preço do texto da página", () => {
    const rt = { origin: "BSB", destination: "SDU", departDate: "2027-05-29", returnDate: "2027-05-30", adults: 2, children: 1, infants: 0, cabin: "ECONOMY" as const };
    for (const key of ["latam", "smiles", "azul-mundo"]) expect(parseSearchLink(`olha: ${PROGRAM_BY_KEY[key]!.build(rt)} `), key).toEqual({ program: key, params: rt });
    expect(parseSearchLink(PROGRAM_BY_KEY.latam!.build({ ...rt, returnDate: null, cabin: "BUSINESS" }))!.params).toMatchObject({ returnDate: null, cabin: "BUSINESS" });
    expect(parseSearchLink(PROGRAM_BY_KEY["latam-cash"]!.build(rt))!.program).toBe("latam-cash");
    expect(parseSearchLink(PROGRAM_BY_KEY.azul!.build(rt))).toEqual({ program: "azul", params: { origin: "BSB", destination: "SDU", departDate: "2027-05-29", returnDate: "2027-05-30" } });
    expect(parseSearchLink("https://www.united.com/pt/br/fsr/choose-flights?f=BSB")).toEqual({ program: "mileageplus", params: {} });
    expect(parseSearchLink("sem link aqui")).toBeNull();

    const latam = "Voo direto 06:10 BSB 08:00 SDU Duração 1 h 50 min A partir de 37.746 pontos + R$ 97,17\n06:55 BSB 10:30 SDU 1 escala A partir de 52.110 pontos + R$ 97,17";
    expect(parseOffers(latam)).toEqual([{ miles: 37746, taxesCents: 9717, cashCents: null }, { miles: 52110, taxesCents: 9717, cashCents: null }]);
    expect(parseOffers("59.700 milhas\nTaxas R$ 97,17 ... 41.000 milhas Taxas R$ 1.097,17 ... 41.000 milhas Taxas R$ 1.097,17")).toEqual([{ miles: 41000, taxesCents: 109717, cashCents: null }, { miles: 59700, taxesCents: 9717, cashCents: null }]);
    expect(parseOffers("Tarifa Light R$ 1.014,90 Tarifa Standard R$ 794,17 Bagagem R$ 30,00", true)).toEqual([{ miles: null, taxesCents: null, cashCents: 79417 }, { miles: null, taxesCents: null, cashCents: 101490 }]);
    // Texto real da LATAM (ida e volta): trechos separados e as combinações milhas + dinheiro do total
    const latamReal = ["Brasília a Rio de Janeiro sáb., 29 de mai.", "13:30 BSB Direto 1 h 45 min. 15:15 SDU", "Light Preço por passageiro 10.180 milhas + BRL 34,55", "Rio de Janeiro a Brasília dom., 30 de mai.", "Light Preço por passageiro 27.566 milhas + BRL 62,62", "Selecione a opção que preferir para pagar sua passagem:", "37.746 milhas + BRL 97,17", "33.972 milhas + BRL 293,42", "26.423 milhas + BRL 584,06", "18.873 milhas + BRL 833,22"].join("\n");
    // Só as opções de pagamento do total (os valores de cada trecho ficam de fora); a primeira é a usada
    expect(parseOffers(latamReal).map((o) => [o.miles, o.taxesCents])).toEqual([[18873, 83322], [26423, 58406], [33972, 29342], [37746, 9717]]);
    expect(preferredOffer(latamReal)).toEqual({ miles: 37746, taxesCents: 9717, cashCents: null });
    expect(preferredOffer(latam)).toBeNull(); // lista de voos, sem opções de pagamento: o usuário escolhe

    // Smiles: o link do usuário (com parâmetro extra) e o total da seleção antes de "1 pessoa adulta"
    expect(parseSearchLink("https://www.smiles.com.br/mfe/emissao-passagem?tripType=1&originAirport=BSB&destinationAirport=SDU&departureDate=1811592000000&returnDate=1811678400000&adults=1&children=0&infants=0&searchType=g3&segments=1&isFlexibleDateChecked=false&cabin=ECONOMIC&novo-resultado-voos=true"))
      .toEqual({ program: "smiles", params: { origin: "BSB", destination: "SDU", departDate: "2027-05-29", returnDate: "2027-05-30", adults: 1, children: 0, infants: 0, cabin: "ECONOMY" } });
    const smiles = "Ida 06:00 BSB 07:50 SDU 41.000 milhas R$ 97,17 Volta 18:00 SDU 19:45 BSB 18.700 milhas Total 59.700 milhas + R$ 97,17\n1 pessoa adulta Continuar";
    expect(preferredOffer(smiles)).toEqual({ miles: 59700, taxesCents: 9717, cashCents: null });
    expect(preferredOffer("120.400 milhas + R$ 194,34 2 pessoas adultas")).toEqual({ miles: 120400, taxesCents: 19434, cashCents: null });
    expect(parseOffers("nada de preço")).toEqual([]);
  });

  it("WhatsApp e rótulos", () => {
    expect(whatsappLink("(21) 99999-0000", whatsappText("Olá, {nome}! {rota}", { customerName: "Ana Souza", route: "BSB → GIG" }))).toBe("https://wa.me/5521999990000?text=Ol%C3%A1%2C%20Ana!%20BSB%20%E2%86%92%20GIG");
    expect(whatsappLink("", "x")).toBeNull();
    expect(routeLabel([{ origin: "GRU", destination: "MIA", date: null }, { origin: "MIA", destination: "JFK", date: null }], "MULTI")).toBe("GRU → MIA → JFK");
  });

  it("mensagem de cotação leva o que o cliente pediu e o link da página", () => {
    const pedido = orderSummary({ segments: [{ origin: "GRU", destination: "LIS", date: "2027-03-10" }, { origin: "LIS", destination: "GRU", date: "2027-03-20" }], tripType: "ROUND_TRIP", adults: 2, children: 1, infants: 0, cabin: "BUSINESS", flexibleDates: true, checkedBag: true });
    expect(pedido).toBe("✈️ GRU → LIS · ida 10/03/2027 · volta 20/03/2027\n👥 2 adultos, 1 criança · Executiva\n📝 datas flexíveis · com bagagem despachada");
    const tpl = WHATSAPP_TEMPLATES.find((t) => t.key === "cotacao")!.text;
    const com = whatsappText(tpl, { customerName: "Maria Souza", route: "GRU ⇄ LIS", summary: pedido, link: "https://x.test/p/ana/cotacao/abc" });
    expect(com).toContain("Olá, Maria!");
    expect(com).toContain(pedido);
    expect(com).toContain("Voos, valores e condições aqui: https://x.test/p/ana/cotacao/abc");
    expect(com).toContain("4 últimos dígitos");
    const sem = whatsappText(tpl, { customerName: "Maria Souza", route: "GRU ⇄ LIS", summary: pedido, link: null });
    expect(sem).not.toContain("{link}");
    expect(sem).not.toContain("4 últimos dígitos");
    expect(sem).toContain(pedido);
  });
});

describe("tradutor de milhas", () => {
  it("milhas típicas por programa e por antecedência, por adulto, com valor de mercado", async () => {
    await prisma.program.create({ data: { name: "Smiles", code: "SMILES", kind: "MILES", marketValueCpmCents: 1750 } });
    const q = (program: string, miles: number, createdAt: string, extra: Record<string, unknown> = {}) =>
      prisma.flightQuote.create({ data: { userId, program, origin: "BSB", destination: "GIG", departDate: new Date("2027-01-30T00:00:00Z"), returnDate: new Date("2027-02-05T00:00:00Z"), cabin: "ECONOMY", adults: 1, miles, taxesCents: 5000, createdAt: new Date(createdAt), ...extra } });
    await q("smiles", 20000, "2027-01-25T10:00:00Z"); // 5 dias antes
    await q("smiles", 24000, "2027-01-26T10:00:00Z"); // 4 dias antes
    await q("smiles", 30000, "2026-12-01T10:00:00Z"); // 60 dias antes
    await q("latam", 36000, "2026-11-01T10:00:00Z", { adults: 2, taxesCents: 20000 }); // 18.000 por adulto, 90 dias antes
    await q("latam", 50000, "2026-11-01T10:00:00Z", { cabin: "BUSINESS" }); // outra classe: fora
    await q("latam", 9000, "2026-11-01T10:00:00Z", { returnDate: null }); // só ida: fora
    const { translateRoute } = await import("@/server/services/flight-quotes");
    const r = await translateRoute(userId, { origin: "BSB", destination: "GIG", roundTrip: true, cabin: "ECONOMY" });
    expect(r.samples).toBe(4);
    expect(r.programs.map((p) => p.key)).toEqual(["latam", "smiles"]); // mais barato primeiro
    const smiles = r.programs.find((p) => p.key === "smiles")!;
    expect(smiles).toMatchObject({ samples: 3, typical: 24000, min: 20000, max: 30000, taxesCents: 5000, marketCents: 42000 });
    expect(smiles.byLead.find((b) => b.key === "0-7")).toMatchObject({ samples: 2, typical: 22000 });
    expect(smiles.byLead.find((b) => b.key === "31-60")).toMatchObject({ samples: 1, typical: 30000 });
    expect(r.programs[0]).toMatchObject({ key: "latam", typical: 18000, taxesCents: 10000, marketCents: null });
    const oneWay = await translateRoute(userId, { origin: "BSB", destination: "GIG", roundTrip: false, cabin: "ECONOMY" });
    expect(oneWay.programs).toEqual([expect.objectContaining({ key: "latam", typical: 9000 })]);
  });
});

describe("central de atendimento", () => {
  it("interessados em gestão: só com página publicada, contato obrigatório, limite por IP, avisa o dono", async () => {
    const lead = await import("@/app/api/public/leads/[slug]/route");
    const leadRoute = await import("@/app/api/leads/[id]/route");
    const leads = await import("@/app/api/leads/route");
    const pub = new Client();
    const body = { name: "Interessado", phone: "(11) 96666-3333", message: "Uso Livelo e Smiles" };
    expect((await pub.call(lead.POST, "POST", "/x", body, { slug: "ana" })).status).toBe(404);
    await c.call(salesProfile.PUT, "PUT", "/x", { slug: "ana", displayName: "Ana Milhas", programIds: [], published: true, headline: "Viaje mais pagando menos" });
    expect((await pub.call(lead.POST, "POST", "/x", body, { slug: "ana" })).status).toBe(201);
    expect((await pub.call(lead.POST, "POST", "/x", { name: "Sem contato" }, { slug: "ana" })).status).toBe(400);
    expect((await pub.call(lead.POST, "POST", "/x", { ...body, website: "spam" }, { slug: "ana" })).status).toBe(400);
    expect(await prisma.notification.count({ where: { userId, title: "Novo interesse em Gestão de Milhas" } })).toBe(1);
    for (let i = 0; i < 4; i++) await pub.call(lead.POST, "POST", "/x", body, { slug: "ana" });
    expect((await pub.call(lead.POST, "POST", "/x", body, { slug: "ana" })).status).toBe(429);
    const list = (await c.call(leads.GET, "GET", "/x")).data.items;
    expect(list).toHaveLength(5);
    expect((await c.call(leadRoute.PATCH, "PATCH", "/x", { status: "CONTACTED" }, { id: list[0].id })).status).toBe(200);
    const other = new Client();
    await other.call(register.POST, "POST", "/r", { name: "Outro", email: "o2@x.test", password: "senha-forte-2" });
    expect((await other.call(leadRoute.PATCH, "PATCH", "/x", { status: "CLIENT" }, { id: list[0].id })).status).toBe(404);
    // dono desliga
    await c.call(salesProfile.PUT, "PUT", "/x", { slug: "ana", displayName: "Ana Milhas", programIds: [], published: true, acceptsLeads: false });
    expect((await new Client().call(lead.POST, "POST", "/x", body, { slug: "ana" })).status).toBe(404);
    const { publicSalesProfile } = await import("@/server/services/settings");
    expect(await publicSalesProfile("ana")).toMatchObject({ acceptsLeads: false, headline: null });
  });
});
