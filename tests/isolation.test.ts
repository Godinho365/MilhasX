import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client, seedPrograms } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as holders from "@/app/api/holders/route";
import * as holder from "@/app/api/holders/[id]/route";
import * as accounts from "@/app/api/accounts/route";
import * as entries from "@/app/api/entries/route";
import * as entry from "@/app/api/entries/[id]/route";
import * as transfers from "@/app/api/transfers/route";
import * as sales from "@/app/api/sales/route";
import * as summary from "@/app/api/summary/route";
import * as alerts from "@/app/api/alerts/route";
import * as batch from "@/app/api/entries/batch/route";
import * as bulkDelete from "@/app/api/entries/bulk-delete/route";
import * as selfHolder from "@/app/api/holders/[id]/self/route";
import { prisma } from "@/server/db";

let a: Client, b: Client;
let aAcc: string, bAcc: string, aHolder: string, aEntry: string;

beforeEach(async () => {
  await resetDb();
  const p = await seedPrograms();
  a = new Client();
  b = new Client();
  await a.call(register.POST, "POST", "/r", { name: "Ana", email: "a@x.test", password: "senha-forte-1" });
  await b.call(register.POST, "POST", "/r", { name: "Bia", email: "b@x.test", password: "senha-forte-1" });
  aHolder = (await a.call(holders.POST, "POST", "/h", { name: "A" })).data.item.id;
  const bHolder = (await b.call(holders.POST, "POST", "/h", { name: "B" })).data.item.id;
  aAcc = (await a.call(accounts.POST, "POST", "/a", { holderId: aHolder, programId: p.livelo.id })).data.item.id;
  bAcc = (await b.call(accounts.POST, "POST", "/a", { holderId: bHolder, programId: p.livelo.id })).data.item.id;
  aEntry = (await a.call(entries.POST, "POST", "/e", { accountId: aAcc, type: "CARD", points: 1000, occurredAt: "2026-10-01" })).data.item.id;
});

describe("separação de dados entre usuários", () => {
  it("B não vê dados de A", async () => {
    expect((await b.call(entries.GET, "GET", "/api/entries")).data.total).toBe(0);
    expect((await b.call(summary.GET, "GET", "/api/summary")).data.totals.balance).toBe(0);
    expect((await b.call(holders.GET, "GET", "/api/holders")).data.items).toHaveLength(1);
    expect((await b.call(entries.GET, "GET", `/api/entries?accountId=${aAcc}`)).data.total).toBe(0);
  });

  it("B não altera nem usa recursos de A", async () => {
    expect((await b.call(entries.POST, "POST", "/e", { accountId: aAcc, type: "CARD", points: 1, occurredAt: "2026-10-01" })).status).toBe(404);
    expect((await b.call(entry.DELETE, "DELETE", "/x", undefined, { id: aEntry })).status).toBe(404);
    expect((await b.call(entry.PATCH, "PATCH", "/x", { points: 1 }, { id: aEntry })).status).toBe(404);
    expect((await b.call(holder.DELETE, "DELETE", "/x", undefined, { id: aHolder })).status).toBe(404);
    expect((await b.call(accounts.POST, "POST", "/a", { holderId: aHolder, programId: "x" })).status).toBe(404);
    expect((await b.call(transfers.POST, "POST", "/t", { fromAccountId: aAcc, toAccountId: bAcc, points: 10, bonusPercent: 0, occurredAt: "2026-10-02" })).status).toBe(404);
    expect((await b.call(sales.POST, "POST", "/s", { origin: "OWN", accountId: aAcc, occurredAt: "2026-10-02", items: [{ kind: "OTHER", issuedWith: "POINTS", points: 10, salePriceCents: 2000 }] })).status).toBe(404);
    expect((await b.call(alerts.POST, "POST", "/al", { type: "MIN_BALANCE", accountId: aAcc, threshold: 1 })).status).toBe(400);
    expect((await b.call(bulkDelete.POST, "POST", "/d", { ids: [aEntry] })).status).toBe(404);
    expect((await b.call(batch.POST, "POST", "/b", { items: [{ accountId: aAcc, type: "CARD", points: 1, occurredAt: "2026-10-02" }] })).status).toBe(404);
    expect((await a.call(summary.GET, "GET", "/api/summary")).data.totals.balance).toBe(1000);
  });

  it("marcar \"sou eu\": um por usuário e só nos próprios titulares", async () => {
    expect((await b.call(selfHolder.POST, "POST", "/x", { isSelf: true }, { id: aHolder })).status).toBe(404);
    const second = (await a.call(holders.POST, "POST", "/h", { name: "Ana Dois" })).data.item.id;
    expect((await a.call(selfHolder.POST, "POST", "/x", { isSelf: true }, { id: aHolder })).status).toBe(200);
    expect((await a.call(selfHolder.POST, "POST", "/x", { isSelf: true }, { id: second })).status).toBe(200);
    const marked = await prisma.holder.findMany({ where: { isSelf: true } });
    expect(marked.map((h) => h.id)).toEqual([second]);
  });

  it("sem sessão → 401", async () => {
    const anon = new Client();
    expect((await anon.call(entries.GET, "GET", "/api/entries")).status).toBe(401);
    expect((await anon.call(summary.GET, "GET", "/api/summary")).status).toBe(401);
  });
});
