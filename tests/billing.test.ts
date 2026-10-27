// Limites por plano e assinatura paga pelo Mercado Pago (API simulada: nada sai para a internet)
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { resetDb, Client, seedPrograms } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as holders from "@/app/api/holders/route";
import * as accounts from "@/app/api/accounts/route";
import * as suppliers from "@/app/api/suppliers/route";
import * as checkout from "@/app/api/billing/checkout/route";
import * as webhook from "@/app/api/billing/webhook/route";
import * as subscription from "@/app/api/billing/subscription/route";
import { verifyWebhookSignature } from "@/server/services/billing-mp";
import { prisma } from "@/server/db";

let c: Client;
let userId: string;
const env = { ...process.env };

beforeEach(async () => {
  await resetDb();
  c = new Client();
  userId = (await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" })).data.user.id;
});
afterEach(() => {
  process.env = { ...env };
  vi.unstubAllGlobals();
});
const endTrial = () => prisma.user.update({ where: { id: userId }, data: { trialEndsAt: new Date(Date.now() - 1000) } });

describe("limites por plano", () => {
  it("teste do Gestor não limita; no Pessoal barra o 2º titular, a 6ª conta e fornecedores", async () => {
    const p = await seedPrograms();
    const more = await Promise.all(["A", "B", "C", "D"].map((n, i) => prisma.program.create({ data: { name: `Prog ${n}`, code: `P${n}`, kind: "POINTS", marketValueCpmCents: 1000 + i } })));
    const h = (await c.call(holders.POST, "POST", "/api/holders", { name: "Ana" })).data.item.id;
    expect((await c.call(holders.POST, "POST", "/api/holders", { name: "Bia" })).status).toBe(201); // ainda no teste
    await endTrial();
    const third = await c.call(holders.POST, "POST", "/api/holders", { name: "Caio" });
    expect(third.status).toBe(402);
    expect(third.data.erro).toMatch(/Pessoal permite até 1 titular/);
    for (const prog of [p.livelo, p.latam, ...more.slice(0, 3)]) expect((await c.call(accounts.POST, "POST", "/api/accounts", { holderId: h, programId: prog.id })).status).toBe(201);
    expect((await c.call(accounts.POST, "POST", "/api/accounts", { holderId: h, programId: more[3]!.id })).status).toBe(402);
    expect((await c.call(suppliers.POST, "POST", "/api/suppliers", { name: "Forn" })).status).toBe(402);
    // PRO libera contas, mas fornecedor continua só no Gestor
    await prisma.user.update({ where: { id: userId }, data: { plan: "PRO" } });
    expect((await c.call(accounts.POST, "POST", "/api/accounts", { holderId: h, programId: more[3]!.id })).status).toBe(201);
    expect((await c.call(suppliers.POST, "POST", "/api/suppliers", { name: "Forn" })).status).toBe(402);
    await prisma.user.update({ where: { id: userId }, data: { plan: "GESTOR" } });
    expect((await c.call(suppliers.POST, "POST", "/api/suppliers", { name: "Forn" })).status).toBe(201);
  });
});

describe("assinatura Mercado Pago", () => {
  // Mercado Pago falso: guarda os preapprovals criados e deixa o teste mudar o status
  function fakeMp() {
    const store = new Map<string, { id: string; status: string; external_reference: string; auto_recurring: { transaction_amount: number; frequency: number } }>();
    const calls: { method: string; url: string; body: any; auth: string | null }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method: init.method ?? "GET", url, body, auth: new Headers(init.headers).get("authorization") });
      const id = url.split("/preapproval/")[1];
      if (init.method === "POST") {
        const pre = { id: `pre${store.size + 1}`, status: "pending", external_reference: body.external_reference, auto_recurring: body.auto_recurring, init_point: `https://mp.test/checkout/pre${store.size + 1}` };
        store.set(pre.id, pre);
        return new Response(JSON.stringify(pre), { status: 201 });
      }
      const pre = id && store.get(id);
      if (!pre) return new Response("{}", { status: 404 });
      if (init.method === "PUT") pre.status = body.status;
      return new Response(JSON.stringify(pre), { status: 200 });
    });
    return { store, calls };
  }
  const SECRET = "segredo-teste";
  function signed(dataId: string) {
    const ts = String(Date.now());
    const v1 = createHmac("sha256", SECRET).update(`id:${dataId};request-id:req-1;ts:${ts};`).digest("hex");
    return new Request(`http://localhost:3100/api/billing/webhook?type=subscription_preapproval&data.id=${dataId}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": "req-1" },
      body: JSON.stringify({ type: "subscription_preapproval", data: { id: dataId } }),
    });
  }
  const hook = (req: Request) => webhook.POST(req, { params: Promise.resolve({}) });

  beforeEach(() => {
    process.env.MP_ACCESS_TOKEN = "TEST-token";
    process.env.MP_WEBHOOK_SECRET = SECRET;
    process.env.APP_URL = "http://localhost:3100";
  });

  it("sem token, o checkout fica desligado", async () => {
    delete process.env.MP_ACCESS_TOKEN;
    expect((await c.call(checkout.POST, "POST", "/x", { plan: "PRO", interval: "MENSAL", payerEmail: "ana@x.test" })).status).toBe(503);
  });

  it("cria o checkout com o valor do servidor e só ativa depois de consultar o Mercado Pago", async () => {
    const mp = fakeMp();
    const r = await c.call(checkout.POST, "POST", "/x", { plan: "GESTOR", interval: "ANUAL", payerEmail: "ana@mp.test" });
    expect(r.status).toBe(201);
    expect(r.data.checkoutUrl).toBe("https://mp.test/checkout/pre1");
    expect(mp.calls[0]).toMatchObject({ method: "POST", auth: "Bearer TEST-token" });
    // anual: 12 meses com 16% de desconto (R$ 33,52 × 12)
    expect(mp.calls[0]!.body.auto_recurring).toMatchObject({ frequency: 12, frequency_type: "months", transaction_amount: 402.24, currency_id: "BRL" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).plan).toBe("PESSOAL");

    // webhook sem assinatura válida é recusado e não muda nada
    mp.store.get("pre1")!.status = "authorized";
    const forged = new Request("http://localhost:3100/api/billing/webhook?type=subscription_preapproval&data.id=pre1", { method: "POST", headers: { "x-signature": "ts=1,v1=abc", "x-request-id": "x" } });
    expect((await hook(forged)).status).toBe(401);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).plan).toBe("PESSOAL");

    expect((await hook(signed("pre1"))).status).toBe(200);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect([u.plan, u.planInterval]).toEqual(["GESTOR", "ANUAL"]);

    // cancelar: PUT no Mercado Pago e volta ao Pessoal
    expect((await c.call(subscription.DELETE, "DELETE", "/x")).status).toBe(200);
    expect(mp.store.get("pre1")!.status).toBe("cancelled");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).plan).toBe("PESSOAL");
  });

  it("recusa assinatura com valor alterado", async () => {
    const mp = fakeMp();
    await c.call(checkout.POST, "POST", "/x", { plan: "PRO", interval: "MENSAL", payerEmail: "ana@mp.test" });
    const pre = mp.store.get("pre1")!;
    pre.status = "authorized";
    pre.auto_recurring.transaction_amount = 0.01;
    expect((await hook(signed("pre1"))).status).toBe(500);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).plan).toBe("PESSOAL");
  });

  it("não aceita o plano Pessoal no checkout nem assinatura sem login", async () => {
    fakeMp();
    expect((await c.call(checkout.POST, "POST", "/x", { plan: "PESSOAL", interval: "MENSAL", payerEmail: "a@x.test" })).status).toBe(400);
    expect((await new Client().call(checkout.POST, "POST", "/x", { plan: "PRO", interval: "MENSAL", payerEmail: "a@x.test" })).status).toBe(401);
  });

  it("assinatura do webhook segue o manifesto do Mercado Pago", () => {
    const v1 = createHmac("sha256", "s").update("id:abc123;request-id:r;ts:99;").digest("hex");
    expect(verifyWebhookSignature(`ts=99,v1=${v1}`, "r", "ABC123", "s")).toBe(true);
    expect(verifyWebhookSignature(`ts=99,v1=${v1}`, "r", "abc124", "s")).toBe(false);
    expect(verifyWebhookSignature(null, "r", "abc123", "s")).toBe(false);
    expect(verifyWebhookSignature(`ts=99,v1=${v1}`, "r", "abc123", undefined)).toBe(false);
  });
});
