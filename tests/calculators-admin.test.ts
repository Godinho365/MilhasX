// Parcerias e catálogo de clubes: só admin grava; referências de CPM do usuário.
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client, seedPrograms } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as calc from "@/app/api/admin/calculators/route";
import * as calcItem from "@/app/api/admin/calculators/[type]/[id]/route";
import { listPartners, listClubPlans, cpmReferences } from "@/server/services/calculators";
import { prisma } from "@/server/db";

let progs: Awaited<ReturnType<typeof seedPrograms>>;
beforeEach(async () => {
  await resetDb();
  progs = await seedPrograms();
});

describe("dados das calculadoras", () => {
  it("parcerias e clubes: só admin, sem duplicar, edita e exclui", async () => {
    const c = new Client();
    await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" });
    const partner = { type: "partner", fromProgramId: progs.livelo.id, toProgramId: progs.latam.id, fromUnits: 1, toUnits: 1, active: true };
    expect((await c.call(calc.POST, "POST", "/x", partner)).status).toBe(403);
    await prisma.user.update({ where: { email: "ana@x.test" }, data: { role: "ADMIN" } });

    const p = await c.call(calc.POST, "POST", "/x", partner);
    expect(p.status).toBe(201);
    expect((await c.call(calc.POST, "POST", "/x", partner)).status).toBe(409);
    expect((await c.call(calc.POST, "POST", "/x", { ...partner, toProgramId: progs.livelo.id })).status).toBe(400);
    const id = p.data.item.id as string;
    expect((await c.call(calcItem.PATCH, "PATCH", "/x", { ...partner, type: undefined, toUnits: 2 }, { type: "partner", id })).status).toBe(200);
    expect((await listPartners())[0]).toMatchObject({ fromUnits: 1, toUnits: 2 });

    const club = { type: "club", programId: progs.latam.id, name: "Clube 1.000", modality: "Mensal", miles: 1000, monthlyCents: 4200, signupBonus: 0, active: true };
    const cl = await c.call(calc.POST, "POST", "/x", club);
    expect(cl.status).toBe(201);
    expect((await c.call(calc.POST, "POST", "/x", club)).status).toBe(409);
    expect((await c.call(calc.POST, "POST", "/x", { ...club, miles: 0 })).status).toBe(400);
    expect(await listClubPlans(true)).toHaveLength(1);

    expect((await c.call(calcItem.DELETE, "DELETE", "/x", undefined, { type: "partner", id })).status).toBe(200);
    expect((await c.call(calcItem.DELETE, "DELETE", "/x", undefined, { type: "nada", id })).status).toBe(404);
    expect(await listPartners()).toHaveLength(0);
  });

  it("referências de CPM: custo médio das contas e valor de mercado", async () => {
    const u = await prisma.user.create({ data: { name: "U", email: "u@x.test", passwordHash: "x" } });
    const h = await prisma.holder.create({ data: { userId: u.id, name: "Titular" } });
    await prisma.account.create({ data: { userId: u.id, holderId: h.id, programId: progs.livelo.id, balance: 10000, costCents: 25000 } });
    await prisma.program.update({ where: { id: progs.latam.id }, data: { marketValueCpmCents: 1750 } });
    const refs = await cpmReferences(u.id);
    expect(refs).toEqual(expect.arrayContaining([
      expect.objectContaining({ detail: "Seu custo médio", cpmCents: 2500 }),
      expect.objectContaining({ label: progs.latam.name, detail: "Valor de mercado", cpmCents: 1750 }),
    ]));
  });
});
