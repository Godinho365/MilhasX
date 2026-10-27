// Configurações: preferências, perfil, assinatura (ativação manual), indicações e perfil público
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client, seedPrograms } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as prefs from "@/app/api/preferences/route";
import * as me from "@/app/api/me/route";
import * as deletion from "@/app/api/me/deletion/route";
import * as billing from "@/app/api/billing/route";
import * as referrals from "@/app/api/referrals/route";
import * as salesProfile from "@/app/api/sales-profile/route";
import * as adminPlan from "@/app/api/admin/users/[id]/plan/route";
import { publicSalesProfile } from "@/server/services/settings";
import { prisma } from "@/server/db";

let c: Client;
let userId: string;
beforeEach(async () => {
  await resetDb();
  c = new Client();
  const r = await c.call(register.POST, "POST", "/r", { name: "Ana Souza", email: "ana@x.test", password: "senha-forte-1" });
  userId = r.data.user.id;
});

describe("preferências", () => {
  it("salva canais de notificação mesclando e mantém mostrar valores em sincronia com o modo", async () => {
    const r = await c.call(prefs.PATCH, "PATCH", "/api/preferences", { soundEffects: false, valuesMode: "HIDDEN", notifications: { offers: { push: true } } });
    expect(r.status).toBe(200);
    expect(r.data.item.soundEffects).toBe(false);
    expect(r.data.item.valuesMode).toBe("HIDDEN");
    expect(r.data.item.showValues).toBe(false);
    expect(r.data.item.notifications.offers).toEqual({ email: true, push: true });
    expect(r.data.item.notifications.marketing.email).toBe(false);
    const r2 = await c.call(prefs.PATCH, "PATCH", "/api/preferences", { notifications: { offers: { email: false } } });
    expect(r2.data.item.notifications.offers).toEqual({ email: false, push: true });
    const r3 = await c.call(prefs.PATCH, "PATCH", "/api/preferences", { showValues: true });
    expect(r3.data.item.valuesMode).toBe("VISIBLE");
    expect((await c.call(prefs.PATCH, "PATCH", "/api/preferences", { valuesMode: "X" })).status).toBe(400);
  });
});

describe("perfil", () => {
  it("altera só o nome e registra/cancela o pedido de exclusão", async () => {
    expect((await c.call(me.PATCH, "PATCH", "/api/me", { name: "Ana S." })).status).toBe(200);
    // campos extras (e-mail, papel) são ignorados
    await c.call(me.PATCH, "PATCH", "/api/me", { name: "Ana S.", role: "ADMIN", email: "x@x.test" });
    let u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect([u.name, u.role, u.email]).toEqual(["Ana S.", "USER", "ana@x.test"]);
    await c.call(deletion.POST, "POST", "/api/me/deletion");
    u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.deletionRequestedAt).not.toBeNull();
    await c.call(deletion.DELETE, "DELETE", "/api/me/deletion");
    u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.deletionRequestedAt).toBeNull();
  });
});

describe("assinatura", () => {
  it("novo cadastro testa o Gestor por 15 dias", async () => {
    const r = await c.call(billing.GET, "GET", "/api/billing");
    expect(r.data.item.plan).toBe("PESSOAL");
    expect(r.data.item.effective).toBe("GESTOR");
    expect(r.data.item.trialDaysLeft).toBe(15);
  });

  it("o usuário só pede o plano; quem ativa é o administrador", async () => {
    const admin = new Client();
    await admin.call(register.POST, "POST", "/r", { name: "Root", email: "root@x.test", password: "senha-forte-9" });
    await prisma.user.update({ where: { email: "root@x.test" }, data: { role: "ADMIN" } });

    const req = await c.call(billing.POST, "POST", "/api/billing", { plan: "GESTOR", interval: "ANUAL" });
    expect(req.status).toBe(201);
    expect(req.data.item.plan).toBe("PESSOAL");
    expect(req.data.item.request).toMatchObject({ plan: "GESTOR", interval: "ANUAL" });
    expect(await prisma.notification.count({ where: { user: { email: "root@x.test" } } })).toBe(1);

    // usuário comum não acessa a rota de ativação, nem para si
    expect((await c.call(adminPlan.PUT, "PUT", "/x", { plan: "GESTOR", interval: "ANUAL" }, { id: userId })).status).toBe(403);
    expect((await admin.call(adminPlan.PUT, "PUT", "/x", { plan: "GESTOR", interval: "ANUAL" }, { id: userId })).status).toBe(200);
    const after = await c.call(billing.GET, "GET", "/api/billing");
    expect(after.data.item).toMatchObject({ plan: "GESTOR", interval: "ANUAL", request: null, monthlyCents: 3352 });
    expect((await c.call(billing.POST, "POST", "/api/billing", { plan: "GESTOR", interval: "ANUAL" })).status).toBe(400);
  });
});

describe("indicações", () => {
  it("gera código, dá 30 dias de teste ao indicado e conta o crédito", async () => {
    const st = await c.call(referrals.GET, "GET", "/api/referrals");
    expect(st.data.item.code).toMatch(/^[A-Z2-9]{8}$/);
    expect((await c.call(referrals.GET, "GET", "/api/referrals")).data.item.code).toBe(st.data.item.code);
    const b = new Client();
    await b.call(register.POST, "POST", "/r", { name: "Bia Lima", email: "bia@x.test", password: "senha-forte-2", ref: st.data.item.code.toLowerCase() });
    expect((await b.call(billing.GET, "GET", "/api/billing")).data.item.trialDaysLeft).toBe(30);
    const st2 = await c.call(referrals.GET, "GET", "/api/referrals");
    expect(st2.data.item.creditMonths).toBe(1);
    // só o primeiro nome, sem e-mail
    expect(st2.data.item.referred[0]).toEqual({ name: "Bia", createdAt: expect.any(String) });
    // código inválido segue com o teste padrão
    const d = new Client();
    await d.call(register.POST, "POST", "/r", { name: "Duda", email: "duda@x.test", password: "senha-forte-3", ref: "NAOEXISTE" });
    expect((await d.call(billing.GET, "GET", "/api/billing")).data.item.trialDaysLeft).toBe(15);
  });
});

describe("perfil público", () => {
  it("só aparece publicado, com endereço único e programas válidos", async () => {
    const { livelo } = await seedPrograms();
    const body = { slug: "ana-milhas", displayName: "Ana Milhas", bio: "Emissões", whatsapp: "(11) 98888-7777", instagram: "@ana.milhas", email: "", programIds: [livelo.id, "inexistente"], published: false };
    const r = await c.call(salesProfile.PUT, "PUT", "/api/sales-profile", body);
    expect(r.status).toBe(200);
    expect(r.data.item).toMatchObject({ whatsapp: "11988887777", instagram: "ana.milhas", email: null, programIds: [livelo.id] });
    expect(await publicSalesProfile("ana-milhas")).toBeNull();
    await c.call(salesProfile.PUT, "PUT", "/api/sales-profile", { ...body, published: true });
    expect(await publicSalesProfile("ANA-MILHAS")).toMatchObject({ displayName: "Ana Milhas", programs: [{ name: "Livelo" }] });

    const b = new Client();
    await b.call(register.POST, "POST", "/r", { name: "Bia", email: "bia@x.test", password: "senha-forte-2" });
    expect((await b.call(salesProfile.PUT, "PUT", "/api/sales-profile", { ...body })).status).toBe(409);
    expect((await b.call(salesProfile.PUT, "PUT", "/api/sales-profile", { ...body, slug: "Com Espaço" })).status).toBe(400);
  });
});
