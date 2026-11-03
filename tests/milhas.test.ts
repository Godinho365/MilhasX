// Grupo Milhas: sugestor de compra, prazo do ViajeFácil, clubes e o radar do ViajeFácil (isolado por usuário).
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client, seedPrograms } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as holders from "@/app/api/holders/route";
import * as accounts from "@/app/api/accounts/route";
import * as recurrences from "@/app/api/recurrences/route";
import * as entries from "@/app/api/entries/route";
import * as vf from "@/app/api/viaje-facil/route";
import * as vfOne from "@/app/api/viaje-facil/[id]/route";
import * as vfPaid from "@/app/api/viaje-facil/[id]/paid/route";
import { purchaseLine } from "@/domain/capacity";
import { deadlineStatus } from "@/domain/viaje-facil";
import { listClubs, listViajeFacil } from "@/server/services/miles";
import { prisma } from "@/server/db";

describe("sugestor de compra", () => {
  it("compra o que falta para usar todos os CPFs livres; nunca negativo", () => {
    // 25 CPFs livres × 30 mil = 750 mil; tem 50 mil → compra 700 mil (R$ 15 → R$ 10.500; R$ 26 → R$ 18.200)
    expect(purchaseLine({ balance: 50_000, reserved: 0, cpfFree: 25 }, 30_000, 1500, 2600)).toEqual({ target: 750_000, available: 50_000, buy: 700_000, costCents: 1_050_000, revenueCents: 1_820_000 });
    // milhas reservadas no CRM não contam como saldo livre
    expect(purchaseLine({ balance: 100_000, reserved: 40_000, cpfFree: 2 }, 30_000, 1500, null)).toMatchObject({ available: 60_000, buy: 0, revenueCents: null });
    expect(purchaseLine({ balance: 0, reserved: 0, cpfFree: 0 }, 30_000, 1500, null).buy).toBe(0);
  });
});

describe("prazo do ViajeFácil", () => {
  it("quitada, vencida, vence hoje, em até 7 dias ou no prazo", () => {
    expect(deadlineStatus("2026-11-01", false, "2026-11-02")).toEqual({ status: "overdue", days: -1 });
    expect(deadlineStatus("2026-11-02T00:00:00.000Z", false, "2026-11-02")).toEqual({ status: "today", days: 0 });
    expect(deadlineStatus("2026-11-09", false, "2026-11-02")).toEqual({ status: "soon", days: 7 });
    expect(deadlineStatus("2026-11-10", false, "2026-11-02")).toEqual({ status: "ok", days: 8 });
    expect(deadlineStatus("2026-11-01", true, "2026-11-02").status).toBe("paid");
  });
});

let c: Client;
let userId: string;
let latam: string;
beforeEach(async () => {
  await resetDb();
  const p = await seedPrograms();
  c = new Client();
  userId = (await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" })).data.user.id;
  const h = (await c.call(holders.POST, "POST", "/h", { name: "Ana" })).data.item.id;
  latam = (await c.call(accounts.POST, "POST", "/a", { holderId: h, programId: p.latam.id })).data.item.id;
});

describe("clubes", () => {
  it("lista o clube com pontos e mensalidade por mês e o custo do milheiro", async () => {
    await c.call(recurrences.POST, "POST", "/r", { accountId: latam, type: "CLUB", description: "Clube LATAM", points: 3000, costCents: 7500, frequency: "MONTHLY", nextDate: "2026-12-05", notify: true });
    await c.call(recurrences.POST, "POST", "/r", { accountId: latam, type: "CLUB", description: "Clube anual", points: 12000, costCents: 12000, frequency: "YEARLY", nextDate: "2027-01-10", notify: false });
    const { rows, totals } = await listClubs(userId);
    expect(rows.map((r) => [r.description, r.monthlyPoints, r.monthlyCents, r.cpmCents])).toEqual([["Clube LATAM", 3000, 7500, 2500], ["Clube anual", 1000, 1000, 1000]]);
    expect(totals).toEqual({ active: 2, withoutRecurrence: 0, monthlyPoints: 4000, monthlyCents: 8500, cpmCents: 2125 });
  });

  it("conta sem recorrência entra pelo bônus de clube ou pelos pontos de clube no extrato, fora da soma por mês", async () => {
    await prisma.account.update({ where: { id: latam }, data: { transferBonusPct: 30, transferBonusCap: 30000 } });
    await c.call(entries.POST, "POST", "/e", { accountId: latam, type: "CLUB", points: 10000, occurredAt: new Date().toISOString().slice(0, 10), costs: [{ type: "MENSALIDADE", amountCents: 35680 }] });
    const { rows, totals } = await listClubs(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "entries", active: true, points: 10000, costCents: 35680, cpmCents: 3568, bonusPct: 30, bonusCap: 30000, monthlyPoints: 0 });
    expect(totals).toMatchObject({ active: 1, withoutRecurrence: 1, monthlyPoints: 0 });
  });
});

describe("ViajeFácil", () => {
  const body = (over: Record<string, unknown> = {}) => ({ customerName: "Maria", deadline: "2099-01-10", miles: 45000, roundTrip: true, origin: "gru", destination: "lis", cabin: "ECONOMY", passengers: ["Maria", " João "], ...over });

  it("cria, edita, quita, reabre e exclui; ordena abertas pela data limite", async () => {
    const a = await c.call(vf.POST, "POST", "/x", body());
    expect(a.status).toBe(201);
    expect(a.data.item).toMatchObject({ origin: "GRU", destination: "LIS", passengers: ["Maria", "João"], status: "ok", milesInAccount: false });
    const b = (await c.call(vf.POST, "POST", "/x", body({ customerName: "Bia", deadline: "2098-05-01", milesInAccount: true }))).data.item;
    let list = await listViajeFacil(userId);
    expect(list.items.map((i) => i.customerName)).toEqual(["Bia", "Maria"]);
    expect(list.totals).toMatchObject({ open: 2, miles: 90000, missingMiles: 45000, overdue: 0 });

    expect((await c.call(vfOne.PUT, "PUT", "/x", body({ miles: 50000 }), { id: a.data.item.id })).data.item.miles).toBe(50000);
    expect((await c.call(vfPaid.POST, "POST", "/x", { paid: true }, { id: b.id })).data.item.status).toBe("paid");
    list = await listViajeFacil(userId);
    expect(list.items.map((i) => i.customerName)).toEqual(["Maria", "Bia"]); // quitada vai para o fim
    expect(list.totals).toMatchObject({ open: 1, miles: 50000 });
    expect((await c.call(vfPaid.POST, "POST", "/x", { paid: false }, { id: b.id })).data.item.paidAt).toBeNull();
    expect((await c.call(vfOne.DELETE, "DELETE", "/x", undefined, { id: b.id })).status).toBe(200);
    expect(await prisma.viajeFacil.count({ where: { userId } })).toBe(1);
  });

  it("valida e isola por usuário", async () => {
    expect((await c.call(vf.POST, "POST", "/x", body({ miles: 0 }))).status).toBe(400);
    expect((await c.call(vf.POST, "POST", "/x", body({ origin: "GRUU" }))).status).toBe(400);
    const id = (await c.call(vf.POST, "POST", "/x", body())).data.item.id;
    const o = new Client();
    await o.call(register.POST, "POST", "/r", { name: "Outro", email: "o@x.test", password: "senha-forte-2" });
    expect((await o.call(vf.GET, "GET", "/x")).data.items).toHaveLength(0);
    expect((await o.call(vfOne.PUT, "PUT", "/x", body(), { id })).status).toBe(404);
    expect((await o.call(vfPaid.POST, "POST", "/x", { paid: true }, { id })).status).toBe(404);
    expect((await o.call(vfOne.DELETE, "DELETE", "/x", undefined, { id })).status).toBe(404);
  });
});
