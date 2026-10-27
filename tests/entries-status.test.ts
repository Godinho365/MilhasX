// Extrato: "Ignorar nos relatórios", "Somente desatualizados" e "Excluir ignorados"
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client, seedPrograms } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as holders from "@/app/api/holders/route";
import * as accounts from "@/app/api/accounts/route";
import * as entries from "@/app/api/entries/route";
import * as ignore from "@/app/api/entries/[id]/ignore/route";
import { overviewReport } from "@/server/services/reports";
import { prisma } from "@/server/db";

let c: Client;
let userId: string;
let liv: string;
beforeEach(async () => {
  await resetDb();
  const p = await seedPrograms();
  c = new Client();
  userId = (await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" })).data.user.id;
  const h = await c.call(holders.POST, "POST", "/api/holders", { name: "Ana" });
  liv = (await c.call(accounts.POST, "POST", "/api/accounts", { holderId: h.data.item.id, programId: p.livelo.id })).data.item.id;
});
const add = (body: Record<string, unknown>) => c.call(entries.POST, "POST", "/api/entries", { accountId: liv, occurredAt: "2026-10-01", ...body });
const list = (qs: string) => c.call(entries.GET, "GET", `/api/entries?${qs}`);

describe("status do extrato", () => {
  it("ignorado sai dos relatórios mas continua no saldo e some com o filtro", async () => {
    const a = await add({ type: "PURCHASE", points: 10000, costCents: 30000 });
    await add({ type: "BONUS", points: 2000 });
    const id = a.data.item?.id ?? a.data.items?.[0]?.id ?? (await prisma.entry.findFirst({ where: { type: "PURCHASE" } }))!.id;
    expect((await c.call(ignore.POST, "POST", "/x", { ignored: true }, { id })).status).toBe(200);
    expect((await prisma.account.findUniqueOrThrow({ where: { id: liv } })).balance).toBe(12000);
    const rep = await overviewReport({ userId, period: { key: "all" } });
    expect(rep.byProgram[0]!.value).toBe(2000);
    expect((await list("")).data.total).toBe(2);
    expect((await list("excludeIgnored=1")).data.total).toBe(1);
    // outro usuário não consegue marcar
    const o = new Client();
    await o.call(register.POST, "POST", "/r", { name: "Bia", email: "bia@x.test", password: "senha-forte-2" });
    expect((await o.call(ignore.POST, "POST", "/x", { ignored: false }, { id })).status).toBe(404);
  });

  it("desatualizado = a receber com data já passada", async () => {
    await add({ type: "PURCHASE", points: 5000, costCents: 10000, status: "PENDING", occurredAt: "2026-01-10" });
    await add({ type: "PURCHASE", points: 7000, costCents: 10000, status: "PENDING", occurredAt: "2099-01-10" });
    await add({ type: "BONUS", points: 100 });
    const r = await list("outdated=1");
    expect(r.data.total).toBe(1);
    expect(r.data.items[0].points).toBe(5000);
  });
});
