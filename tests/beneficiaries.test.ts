// Limite de beneficiários (CPFs) por conta: vendas e lançamentos à mão, CPFs distintos na janela.
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client, seedPrograms } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as holders from "@/app/api/holders/route";
import * as accounts from "@/app/api/accounts/route";
import * as entries from "@/app/api/entries/route";
import * as sales from "@/app/api/sales/route";
import * as sale from "@/app/api/sales/[id]/route";
import * as customers from "@/app/api/customers/route";
import * as benef from "@/app/api/accounts/[id]/beneficiaries/route";
import * as benefOne from "@/app/api/accounts/[id]/beneficiaries/[bid]/route";
import { beneficiaryExpiry, countDistinct, windowStart } from "@/domain/beneficiaries";

let c: Client;
let lat: string;
let liv: string;
beforeEach(async () => {
  await resetDb();
  const p = await seedPrograms();
  c = new Client();
  await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" });
  const h = await c.call(holders.POST, "POST", "/h", { name: "Ana" });
  lat = (await c.call(accounts.POST, "POST", "/a", { holderId: h.data.item.id, programId: p.latam.id })).data.item.id;
  liv = (await c.call(accounts.POST, "POST", "/a", { holderId: h.data.item.id, programId: p.livelo.id })).data.item.id;
  await c.call(entries.POST, "POST", "/e", { accountId: lat, type: "PURCHASE", points: 100000, occurredAt: "2026-01-01", costs: [{ type: "PONTOS", amountCents: 250000 }] });
});

const state = async (id = lat) => (await c.call(benef.GET, "GET", "/x", undefined, { id })).data.item;
const customer = async (name: string, doc: string) => (await c.call(customers.POST, "POST", "/c", { name, kind: "FINAL", docType: "CPF", docNumber: doc })).data.item.id;
const sell = async (customerIds: string[], date: string) =>
  (await c.call(sales.POST, "POST", "/s", { origin: "OWN", accountId: lat, occurredAt: date, items: [{ kind: "FLIGHT", issuedWith: "POINTS", points: 10000, salePriceCents: 30000, passengers: customerIds.length || 1, customerIds }] })).data.item;

describe("limite de beneficiários", () => {
  it("janela e contagem por CPF distinto", () => {
    const now = new Date("2026-10-27T12:00:00Z");
    expect(windowStart("ROLLING_12M", now).toISOString().slice(0, 10)).toBe("2025-10-27");
    expect(windowStart("CALENDAR_YEAR", now).toISOString().slice(0, 10)).toBe("2026-01-01");
    const since = windowStart("ROLLING_12M", now);
    expect(countDistinct([
      { name: "Maria", document: "123.456.789-09", usedAt: "2026-03-01" },
      { name: "Maria S.", document: "12345678909", usedAt: "2026-05-01" }, // mesmo CPF
      { name: "João", document: null, usedAt: "2026-06-01" },
      { name: "joão ", document: null, usedAt: "2026-07-01" }, // mesmo nome
      { name: "Antigo", document: "11111111111", usedAt: "2025-01-01" }, // fora da janela
    ], since)).toBe(2);
    // a vaga volta 12 meses depois da emissão (ou na virada do ano)
    expect(beneficiaryExpiry("ROLLING_12M", "2026-03-15").toISOString().slice(0, 10)).toBe("2027-03-15");
    expect(beneficiaryExpiry("CALENDAR_YEAR", "2026-03-15").toISOString().slice(0, 10)).toBe("2027-01-01");
  });

  it("titular sempre vinculado ocupa uma vaga fixa e não conta duas vezes", async () => {
    const s0 = await state();
    expect(s0.holder.name).toBe("Ana");
    await c.call(benef.POST, "POST", "/x", { name: "Ana", usedAt: "2026-09-01" }, { id: lat });
    await c.call(benef.POST, "POST", "/x", { name: "Outra Pessoa", usedAt: "2026-09-01" }, { id: lat });
    const s1 = await state();
    expect(s1.used).toBe(2); // titular + Outra Pessoa (Ana emitida para si não conta de novo)
    expect(s1.items.find((b: { name: string }) => b.name === "Ana").isHolder).toBe(true);
    expect(s1.items.find((b: { name: string }) => b.name === "Outra Pessoa").expiresAt.slice(0, 10)).toBe("2027-09-01");
  });

  it("clientes das vendas entram sozinhos; à mão também; limite editável; venda some ao excluir", async () => {
    // LATAM tem sugestão de 25 CPFs nos últimos 12 meses
    expect(await state()).toMatchObject({ limit: 25, window: "ROLLING_12M", suggested: true, used: 1 }); // só o titular
    const maria = await customer("Maria Cliente", "123.456.789-09");
    const joao = await customer("João Cliente", "987.654.321-00");
    const s1 = await sell([maria, joao], "2026-10-10");
    await sell([maria], "2026-10-20"); // Maria de novo: não conta duas vezes
    expect(await state()).toMatchObject({ used: 3 });

    // à mão (emissão feita fora do sistema)
    const add = await c.call(benef.POST, "POST", "/x", { name: "Pedro Manual", document: "111.222.333-44", usedAt: "2026-09-01" }, { id: lat });
    expect(add.status).toBe(201);
    expect((await state()).used).toBe(4);

    // limite próprio da conta
    expect((await c.call(benef.PUT, "PUT", "/x", { limit: 5, window: "CALENDAR_YEAR" }, { id: lat })).status).toBe(200);
    expect(await state()).toMatchObject({ limit: 5, window: "CALENDAR_YEAR", suggested: false, used: 4 });

    // beneficiário de venda não sai à mão; excluir a venda tira os dela
    const fromSale = (await state()).items.find((b: { fromSale: boolean }) => b.fromSale);
    expect((await c.call(benefOne.DELETE, "DELETE", "/x", undefined, { id: lat, bid: fromSale.id })).status).toBe(409);
    await c.call(sale.DELETE, "DELETE", "/x", undefined, { id: s1.id });
    expect((await state()).used).toBe(3); // titular + Maria (2ª venda) + Pedro

    // manual sai normalmente
    expect((await c.call(benefOne.DELETE, "DELETE", "/x", undefined, { id: lat, bid: add.data.item.id })).status).toBe(200);
    expect((await state()).used).toBe(2);

    // Livelo (pontos) não tem sugestão de limite
    expect(await state(liv)).toMatchObject({ limit: null, used: 1 });

    // outro usuário não vê nem altera
    const b = new Client();
    await b.call(register.POST, "POST", "/r", { name: "Bia", email: "bia@x.test", password: "senha-forte-2" });
    expect((await b.call(benef.GET, "GET", "/x", undefined, { id: lat })).status).toBe(404);
    expect((await b.call(benef.POST, "POST", "/x", { name: "X Y", usedAt: "2026-01-01" }, { id: lat })).status).toBe(404);
  });
});
