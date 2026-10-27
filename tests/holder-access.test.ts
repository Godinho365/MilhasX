// Página do titular: link de uso único por e-mail, sessão só de leitura e revogação
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createHash } from "node:crypto";
import { resetDb, Client, seedPrograms } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as holders from "@/app/api/holders/route";
import * as holderRoute from "@/app/api/holders/[id]/route";
import * as access from "@/app/api/holders/[id]/access/route";
import * as link from "@/app/api/holder-access/[token]/route";
import * as accounts from "@/app/api/accounts/route";
import * as entries from "@/app/api/entries/route";
import { holderView, consumeHolderLink } from "@/server/services/holder-access";
import { prisma } from "@/server/db";

const prevUrl = process.env.APP_URL;
process.env.APP_URL = "http://localhost:3100";
afterAll(() => {
  process.env.APP_URL = prevUrl;
});

let c: Client;
let holderId: string;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

beforeEach(async () => {
  await resetDb();
  const p = await seedPrograms();
  c = new Client();
  await c.call(register.POST, "POST", "/r", { name: "Gestor", email: "gestor@x.test", password: "senha-forte-1" });
  holderId = (await c.call(holders.POST, "POST", "/api/holders", { name: "Carlos Lima" })).data.item.id;
  const acc = (await c.call(accounts.POST, "POST", "/api/accounts", { holderId, programId: p.livelo.id })).data.item.id;
  await c.call(entries.POST, "POST", "/api/entries", { accountId: acc, type: "PURCHASE", points: 10000, costCents: 30000, occurredAt: "2026-10-20" });
});

// O token real só vai no e-mail; aqui o teste grava um link conhecido para simular o clique
async function plantLink(raw: string, email = "carlos@x.test") {
  await prisma.holderAccess.create({ data: { holderId, email, tokenHash: sha(raw), expiresAt: new Date(Date.now() + 3600_000) } });
}
const openLink = (raw: string) => link.GET(new Request(`http://localhost:3100/api/holder-access/${raw}`), { params: Promise.resolve({ token: raw }) });

describe("página do titular", () => {
  it("exige e-mail autorizado e só o dono do titular envia", async () => {
    expect((await c.call(access.POST, "POST", "/x", undefined, { id: holderId })).status).toBe(400);
    await c.call(holderRoute.PATCH, "PATCH", "/x", { name: "Carlos Lima", accessEmail: "carlos@x.test" }, { id: holderId });
    expect((await c.call(access.POST, "POST", "/x", undefined, { id: holderId })).status).toBe(200);
    expect(await prisma.holderAccess.count({ where: { holderId } })).toBe(1);
    const other = new Client();
    await other.call(register.POST, "POST", "/r", { name: "Outro", email: "outro@x.test", password: "senha-forte-2" });
    expect((await other.call(access.POST, "POST", "/x", undefined, { id: holderId })).status).toBe(404);
    expect((await other.call(access.DELETE, "DELETE", "/x", undefined, { id: holderId })).status).toBe(404);
  });

  it("link de uso único vira sessão de leitura sem custos", async () => {
    await c.call(holderRoute.PATCH, "PATCH", "/x", { name: "Carlos Lima", accessEmail: "carlos@x.test" }, { id: holderId });
    await plantLink("tok-1");
    const res = await openLink("tok-1");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/h");
    const session = /mm_holder=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")![1]!;
    const view = await holderView(session);
    expect(view).toMatchObject({ holder: "Carlos Lima", accounts: [{ program: "Livelo", balance: 10000 }] });
    expect(JSON.stringify(view)).not.toMatch(/cost/i);
    // segundo uso do mesmo link falha
    expect((await openLink("tok-1")).headers.get("location")).toBe("/h?link=invalido");
    expect(await consumeHolderLink("tok-1")).toBeNull();
  });

  it("trocar o e-mail autorizado ou revogar encerra o acesso", async () => {
    await c.call(holderRoute.PATCH, "PATCH", "/x", { name: "Carlos Lima", accessEmail: "carlos@x.test" }, { id: holderId });
    await plantLink("tok-2");
    const s = (await consumeHolderLink("tok-2"))!.session;
    expect(await holderView(s)).not.toBeNull();
    await c.call(holderRoute.PATCH, "PATCH", "/x", { name: "Carlos Lima", accessEmail: "novo@x.test" }, { id: holderId });
    expect(await holderView(s)).toBeNull();

    await plantLink("tok-3", "novo@x.test");
    const s2 = (await consumeHolderLink("tok-3"))!.session;
    expect(await holderView(s2)).not.toBeNull();
    await c.call(access.DELETE, "DELETE", "/x", undefined, { id: holderId });
    expect(await holderView(s2)).toBeNull();
  });

  it("link expirado não abre", async () => {
    await c.call(holderRoute.PATCH, "PATCH", "/x", { name: "Carlos Lima", accessEmail: "carlos@x.test" }, { id: holderId });
    await prisma.holderAccess.create({ data: { holderId, email: "carlos@x.test", tokenHash: sha("velho"), expiresAt: new Date(Date.now() - 1000) } });
    expect(await consumeHolderLink("velho")).toBeNull();
  });
});
