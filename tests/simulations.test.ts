// Simulações salvas ("Recentes" dos simuladores)
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as sims from "@/app/api/simulations/route";
import * as sim from "@/app/api/simulations/[id]/route";
import { prisma } from "@/server/db";

let c: Client;
beforeEach(async () => {
  await resetDb();
  c = new Client();
  await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" });
});
const save = (body: Record<string, unknown>, who = c) => who.call(sims.POST, "POST", "/api/simulations", body);

describe("simulações salvas", () => {
  it("salva, lista as mais recentes primeiro e não duplica a mesma simulação", async () => {
    const a = await save({ kind: "transfer", title: "Livelo → LATAM PASS · 2 mil pts", input: { from: "x", to: "y", points: "2.000", cart: false } });
    expect(a.status).toBe(201);
    await save({ kind: "flight", title: "Passagem · Smiles · 25 mil pts", input: { outbound: "15.000" } });
    const again = await save({ kind: "transfer", title: "Livelo → LATAM PASS · 2 mil pts", input: { from: "x", to: "y", points: "2.000", cart: false } });
    expect(again.data.item.id).toBe(a.data.item.id);
    const list = await c.call(sims.GET, "GET", "/api/simulations");
    expect(list.data.items.map((s: { kind: string }) => s.kind)).toEqual(["transfer", "flight"]);
  });

  it("guarda só as 20 mais recentes", async () => {
    for (let i = 0; i < 23; i++) await save({ kind: "pontos", title: `Compra ${i}`, input: { points: String(i) } });
    expect(await prisma.simulation.count()).toBe(20);
  });

  it("valida e isola por usuário", async () => {
    expect((await save({ kind: "invalido", title: "x", input: {} })).status).toBe(400);
    expect((await save({ kind: "pontos", title: "x", input: { a: { nested: true } } })).status).toBe(400);
    const mine = await save({ kind: "hotel", title: "Hotel", input: { points: "1" } });
    const other = new Client();
    await other.call(register.POST, "POST", "/r", { name: "Bia", email: "bia@x.test", password: "senha-forte-2" });
    expect((await other.call(sims.GET, "GET", "/api/simulations")).data.items).toHaveLength(0);
    const id = mine.data.item.id;
    expect((await other.call(sim.DELETE, "DELETE", `/api/simulations/${id}`, undefined, { id })).status).toBe(404);
    expect((await c.call(sim.DELETE, "DELETE", `/api/simulations/${id}`, undefined, { id })).status).toBe(200);
    expect(await prisma.simulation.count()).toBe(0);
  });
});
