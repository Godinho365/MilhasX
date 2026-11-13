// Admin no estilo do Balcão: cupons, convites, recuperação, conversão, ficha do usuário, pendências e relatórios.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetDb, Client } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as login from "@/app/api/auth/login/route";
import * as checkout from "@/app/api/billing/checkout/route";
import * as couponPreview from "@/app/api/billing/coupon/route";
import * as coupons from "@/app/api/admin/coupons/route";
import * as couponOne from "@/app/api/admin/coupons/[id]/route";
import * as invites from "@/app/api/admin/invites/route";
import * as inviteOne from "@/app/api/admin/invites/[id]/route";
import * as redeem from "@/app/api/invites/redeem/route";
import * as trial from "@/app/api/admin/users/[id]/trial/route";
import * as contact from "@/app/api/admin/users/[id]/contact/route";
import * as plan from "@/app/api/admin/users/[id]/plan/route";
import * as privacyStatus from "@/app/api/admin/privacy/[id]/route";
import * as exportRoute from "@/app/api/admin/export/route";
import { createAdmin } from "../scripts/create-admin-lib";
import { prisma } from "@/server/db";
import { adminPending } from "@/server/services/admin-pending";
import { recoveryData, conversionData, adminDashboard } from "@/server/services/admin-dashboard";
import { userDetail, listPrivacyRequests } from "@/server/services/admin";
import { subscriptionsOverview } from "@/server/services/admin-billing";
import { REPORTS } from "@/server/services/admin-reports";
import { checkCoupon, normalizeCode, validateCouponInput, inviteState, inviteEffect, validateInviteInput, couponLabel, inviteLabel, type CouponRule, type InviteRule } from "@/domain/promo";
import { waPhone, waLink, contactText, mailLink } from "@/domain/admin-contact";
import { recoveryList, cohorts, revenue, periodWindow, type AdminUser, type AdminSub } from "@/domain/admin-metrics";

const NOW = new Date("2026-11-13T15:00:00Z");
const DAY = 86_400_000;
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);
const ahead = (d: number) => new Date(NOW.getTime() + d * DAY);
const user = (id: string, o: Partial<AdminUser> = {}): AdminUser => ({
  id, plan: "PESSOAL", planInterval: null, trialEndsAt: null, createdAt: ago(100), planRequest: null, planRequestedAt: null, deletionRequestedAt: null, status: "ACTIVE", ...o,
});
const sub = (id: string, userId: string, o: Partial<AdminSub> = {}): AdminSub => ({
  id, userId, plan: "PRO", interval: "MENSAL", amountCents: 1990, status: "AUTHORIZED", createdAt: ago(40), updatedAt: ago(40), ...o,
});
const coupon = (o: Partial<CouponRule> = {}): CouponRule => ({ code: "X", kind: "PERCENT", value: 10, plans: [], intervals: [], maxUses: null, expiresAt: null, active: true, ...o });
const invite = (o: Partial<InviteRule> = {}): InviteRule => ({ kind: "TRIAL", plan: null, interval: null, days: 30, maxUses: null, expiresAt: null, active: true, ...o });

// ---------------------------------------------------------------- regras puras

describe("cupom: regras", () => {
  it("normaliza o código", () => {
    expect(normalizeCode("  bem vindo10 ")).toBe("BEMVINDO10");
  });

  it("calcula desconto em % e em R$, sem deixar a cobrança abaixo de R$ 1,00", () => {
    expect(checkCoupon(coupon({ value: 10 }), "PRO", "MENSAL", 1990, 0, NOW)).toEqual({ ok: true, discountCents: 199, finalCents: 1791, label: "10% de desconto" });
    expect(checkCoupon(coupon({ kind: "FIXED", value: 500 }), "GESTOR", "MENSAL", 3990, 0, NOW)).toMatchObject({ ok: true, discountCents: 500, finalCents: 3490 });
    expect(checkCoupon(coupon({ value: 100 }), "PRO", "MENSAL", 1990, 0, NOW)).toMatchObject({ ok: true, finalCents: 100 });
    expect(checkCoupon(coupon({ kind: "FIXED", value: 99999 }), "PRO", "MENSAL", 1990, 0, NOW)).toMatchObject({ ok: true, finalCents: 100 });
  });

  it("recusa cupom pausado, vencido, esgotado, de outro plano ou outra cobrança", () => {
    expect(checkCoupon(null, "PRO", "MENSAL", 1990, 0, NOW)).toEqual({ ok: false, error: "Cupom inválido" });
    expect(checkCoupon(coupon({ active: false }), "PRO", "MENSAL", 1990, 0, NOW).ok).toBe(false);
    expect(checkCoupon(coupon({ expiresAt: ago(1) }), "PRO", "MENSAL", 1990, 0, NOW)).toMatchObject({ error: "Este cupom expirou" });
    expect(checkCoupon(coupon({ expiresAt: ahead(1) }), "PRO", "MENSAL", 1990, 0, NOW).ok).toBe(true);
    expect(checkCoupon(coupon({ maxUses: 2 }), "PRO", "MENSAL", 1990, 2, NOW)).toMatchObject({ error: /limite/ });
    expect(checkCoupon(coupon({ maxUses: 2 }), "PRO", "MENSAL", 1990, 1, NOW).ok).toBe(true);
    expect(checkCoupon(coupon({ plans: ["GESTOR"] }), "PRO", "MENSAL", 1990, 0, NOW)).toMatchObject({ error: /não vale para o plano PRO/ });
    expect(checkCoupon(coupon({ intervals: ["ANUAL"] }), "PRO", "MENSAL", 1990, 0, NOW)).toMatchObject({ error: /só para a cobrança anual/ });
  });

  it("valida o cadastro do cupom", () => {
    const ok = { code: "BEM-10", kind: "PERCENT" as const, value: 10, plans: [], intervals: [], maxUses: null, expiresAt: null, note: null };
    expect(validateCouponInput(ok)).toBeNull();
    expect(validateCouponInput({ ...ok, code: "a!" })).toMatch(/Código/);
    expect(validateCouponInput({ ...ok, value: 101 })).toMatch(/Percentual/);
    expect(validateCouponInput({ ...ok, kind: "FIXED", value: 0 })).toMatch(/valor/);
    expect(validateCouponInput({ ...ok, maxUses: 0 })).toMatch(/Limite/);
    expect(couponLabel({ kind: "FIXED", value: 1050 })).toMatch(/R\$\s?10,50 de desconto/);
  });
});

describe("convite: regras", () => {
  it("situação: ativo, pausado, expirado e esgotado", () => {
    expect(inviteState(invite(), 0, NOW)).toBe("active");
    expect(inviteState(invite({ active: false }), 0, NOW)).toBe("paused");
    expect(inviteState(invite({ expiresAt: ago(1) }), 0, NOW)).toBe("expired");
    expect(inviteState(invite({ maxUses: 1 }), 1, NOW)).toBe("full");
  });

  it("teste soma ao teste em curso; plano só se for maior que o atual", () => {
    const t = inviteEffect(invite({ days: 10 }), { plan: "PESSOAL", trialEndsAt: ahead(5) }, NOW);
    expect(t).toEqual({ ok: true, data: { trialEndsAt: ahead(15) } });
    expect(inviteEffect(invite({ days: 10 }), { plan: "PESSOAL", trialEndsAt: ago(5) }, NOW)).toEqual({ ok: true, data: { trialEndsAt: ahead(10) } });
    expect(inviteEffect(invite(), { plan: "PRO", trialEndsAt: null }, NOW)).toMatchObject({ ok: false });
    expect(inviteEffect(invite({ kind: "PLAN", plan: "GESTOR", interval: "ANUAL" }), { plan: "PRO", trialEndsAt: null }, NOW)).toEqual({ ok: true, data: { plan: "GESTOR", planInterval: "ANUAL" } });
    expect(inviteEffect(invite({ kind: "PLAN", plan: "PRO" }), { plan: "GESTOR", trialEndsAt: null }, NOW)).toMatchObject({ ok: false, error: /já tem o plano Gestor/ });
    expect(inviteLabel(invite({ kind: "PLAN", plan: "PRO", interval: "MENSAL" }))).toBe("Plano PRO de cortesia");
    expect(inviteLabel(invite({ days: 45 }))).toBe("45 dias de teste do Gestor");
  });

  it("valida o cadastro do convite", () => {
    const ok = { code: "PARCEIRO", kind: "TRIAL" as const, plan: null, interval: null, days: 30, maxUses: 5, expiresAt: null, note: null };
    expect(validateInviteInput(ok)).toBeNull();
    expect(validateInviteInput({ ...ok, days: 0 })).toMatch(/Dias/);
    expect(validateInviteInput({ ...ok, kind: "PLAN" })).toMatch(/plano/);
    expect(validateInviteInput({ ...ok, kind: "PLAN", plan: "PRO" })).toBeNull();
  });
});

describe("contato pelo WhatsApp", () => {
  it("monta o número com 55 e recusa telefone inválido", () => {
    expect(waPhone("(11) 98765-4321")).toBe("5511987654321");
    expect(waPhone("1132654321")).toBe("551132654321");
    expect(waPhone("+55 11 98765-4321")).toBe("5511987654321");
    expect(waPhone("123")).toBeNull();
    expect(waPhone(null)).toBeNull();
    expect(waLink(null, "oi")).toBeNull();
  });

  it("texto pronto por motivo, com o primeiro nome", () => {
    const t = contactText("trial", "Ana Maria Souza", { days: 2 });
    expect(t).toMatch(/^Oi, Ana!/);
    expect(t).toMatch(/acaba em 2 dias/);
    expect(contactText("trial", "Ana", { days: 1 })).toMatch(/acaba amanhã/);
    expect(contactText("request", "Bia", { plan: "Gestor" })).toMatch(/pediu o plano Gestor\./);
    const link = waLink("11987654321", "Oi, Ana! Tudo bem?")!;
    expect(link).toBe("https://wa.me/5511987654321?text=Oi%2C%20Ana!%20Tudo%20bem%3F");
    expect(mailLink("a@x.test", "Assunto", "Olá")).toBe("mailto:a@x.test?subject=Assunto&body=Ol%C3%A1");
  });
});

describe("recuperação e conversão (puras)", () => {
  it("lista cada pessoa uma vez, no motivo mais forte, e ignora quem pediu exclusão", () => {
    const users = [
      user("req", { planRequest: "GESTOR", planRequestedAt: ago(3), trialEndsAt: ahead(2) }),
      user("reqNovo", { planRequest: "PRO", planRequestedAt: new Date(NOW.getTime() - 3600_000) }),
      user("chk", { trialEndsAt: ago(20) }),
      user("trial", { trialEndsAt: ahead(3) }),
      user("trialAcabou", { trialEndsAt: ago(2) }),
      user("trialLonge", { trialEndsAt: ahead(12) }),
      user("pagoParado", { plan: "PRO" }),
      user("excluir", { trialEndsAt: ahead(1), deletionRequestedAt: ago(1) }),
    ];
    const subs = [sub("s1", "chk", { status: "PENDING", createdAt: ago(4), plan: "GESTOR" }), sub("s2", "pagoParado", { createdAt: ago(60) })];
    const last = new Map([["pagoParado", ago(30)], ["trialLonge", ago(1)]]);
    const r = recoveryList(users, subs, last, NOW);
    expect(r.map((x) => [x.userId, x.kind])).toEqual([
      ["req", "request"], ["chk", "checkout"], ["trialAcabou", "trial"], ["trial", "trial"], ["pagoParado", "risk"],
    ]);
    expect(r.find((x) => x.userId === "trial")!.detail).toBe("Teste acaba em 3 dias");
    expect(r.find((x) => x.userId === "trialAcabou")!.detail).toBe("Teste acabou há 2 dias");
  });

  it("checkout pendente de quem já paga não entra", () => {
    const users = [user("u", { plan: "PRO" })];
    const subs = [sub("ok", "u"), sub("p", "u", { status: "PENDING", createdAt: ago(3) })];
    expect(recoveryList(users, subs, new Map([["u", ago(1)]]), NOW)).toEqual([]);
  });

  it("coortes por semana e por origem", () => {
    const w = periodWindow("30d", NOW);
    const users = [
      { ...user("a", { createdAt: ago(2) }), group: "Google" },
      { ...user("b", { createdAt: ago(2), plan: "PRO" }), group: "Google" },
      { ...user("c", { createdAt: ago(20), planRequestedAt: ago(19) }), group: "E-mail e senha" },
      { ...user("velho", { createdAt: ago(80) }), group: "Google" },
    ];
    const first = new Map([["a", new Date(ago(2).getTime() + 3600_000)], ["c", ago(5)]]);
    const weeks = cohorts(users, [], new Set(), first, w);
    expect(weeks[0]!.key >= weeks.at(-1)!.key).toBe(true); // mais recente primeiro
    expect(weeks.reduce((t, r) => t + r.signups, 0)).toBe(3);
    const recent = weeks.find((r) => r.signups === 2)!;
    expect(recent).toMatchObject({ activated: 1, asked: 1, paid: 1, rate: 50 });
    const src = cohorts(users, [], new Set(), first, w, "group");
    expect(src.map((r) => [r.key, r.signups, r.paid])).toEqual([["Google", 2, 1], ["E-mail e senha", 1, 0]]);
    expect(src[1]).toMatchObject({ asked: 1, activated: 0 });
  });

  it("cortesia de convite fica fora do MRR", () => {
    const users = [user("pago", { plan: "PRO" }), user("cortesia", { plan: "GESTOR" }), user("manual", { plan: "PRO" })];
    const r = revenue(users, [sub("s", "pago")], new Set(["cortesia"]));
    expect(r).toMatchObject({ mrrCents: 1990 * 2, paidCents: 1990, manualCents: 1990, payers: 2, courtesy: 1 });
  });
});

// ---------------------------------------------------------------- com banco

describe("admin no banco", () => {
  let admin: Client, ana: Client, anaId: string;
  const env = { ...process.env };

  beforeEach(async () => {
    await resetDb();
    await createAdmin({ email: "admin@x.test", name: "Admin Chefe", password: "senha-admin-123" });
    admin = new Client();
    expect((await admin.call(login.POST, "POST", "/l", { email: "admin@x.test", password: "senha-admin-123" })).status).toBe(200);
    ana = new Client();
    anaId = (await ana.call(register.POST, "POST", "/r", { name: "Ana Lima", email: "ana@x.test", password: "senha-forte-1", phone: "11987654321" })).data.user.id;
  });
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  it("só o admin cria cupons, convites, estende teste e registra contato", async () => {
    const body = { code: "bem10", kind: "PERCENT", value: 10 };
    expect((await ana.call(coupons.POST, "POST", "/c", body)).status).toBe(403);
    expect((await new Client().call(coupons.POST, "POST", "/c", body)).status).toBe(401);
    expect((await ana.call(invites.POST, "POST", "/i", { code: "AMIGO", kind: "TRIAL", days: 10 })).status).toBe(403);
    expect((await ana.call(trial.POST, "POST", "/t", { days: 7 }, { id: anaId })).status).toBe(403);
    expect((await ana.call(contact.POST, "POST", "/c", { channel: "whatsapp" }, { id: anaId })).status).toBe(403);
    expect((await ana.call(exportRoute.GET, "GET", "/api/admin/export?kind=recovery")).status).toBe(403);
  });

  it("cupom: cria, recusa código repetido, aplica no checkout e conta o uso só quando pago", async () => {
    const r = await admin.call(coupons.POST, "POST", "/c", { code: "bem 10", kind: "PERCENT", value: 10, plans: ["GESTOR"] });
    expect(r.status).toBe(201);
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: r.data.id } })).code).toBe("BEM10");
    expect((await admin.call(coupons.POST, "POST", "/c", { code: "BEM10", kind: "FIXED", value: 100 })).status).toBe(409);

    // prévia na tela de assinatura
    expect((await ana.call(couponPreview.POST, "POST", "/p", { code: "bem10", plan: "PRO", interval: "MENSAL" })).data.erro).toMatch(/não vale para o plano PRO/);
    const prev = await ana.call(couponPreview.POST, "POST", "/p", { code: "bem10", plan: "GESTOR", interval: "MENSAL" });
    expect(prev.data).toMatchObject({ ok: true, discountCents: 399, finalCents: 3591, baseCents: 3990 });

    // checkout com o Mercado Pago falso: o valor enviado já tem o desconto
    process.env.MP_ACCESS_TOKEN = "TEST-token";
    process.env.APP_URL = "http://localhost:3100";
    const sent: any[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const b = JSON.parse(String(init.body));
      sent.push(b);
      return new Response(JSON.stringify({ id: "pre1", status: "pending", external_reference: b.external_reference, init_point: "https://mp.test/pre1", auto_recurring: b.auto_recurring }), { status: 201 });
    });
    expect((await ana.call(checkout.POST, "POST", "/x", { plan: "PRO", interval: "MENSAL", payerEmail: "ana@x.test", coupon: "BEM10" })).status).toBe(400);
    const ck = await ana.call(checkout.POST, "POST", "/x", { plan: "GESTOR", interval: "MENSAL", payerEmail: "ana@x.test", coupon: "bem10" });
    expect(ck.status).toBe(201);
    expect(sent.at(-1).auto_recurring.transaction_amount).toBe(35.91);
    const s = await prisma.subscription.findFirstOrThrow({ where: { userId: anaId } });
    expect(s).toMatchObject({ amountCents: 3591, discountCents: 399, couponId: r.data.id });

    // limite de 1 uso: pendente não conta; depois de pago, esgota
    await admin.call(couponOne.PUT, "PUT", "/c", { code: "BEM10", kind: "PERCENT", value: 10, plans: ["GESTOR"], maxUses: 1 }, { id: r.data.id });
    expect((await ana.call(couponPreview.POST, "POST", "/p", { code: "BEM10", plan: "GESTOR", interval: "MENSAL" })).status).toBe(200);
    await prisma.subscription.update({ where: { id: s.id }, data: { status: "AUTHORIZED" } });
    expect((await ana.call(couponPreview.POST, "POST", "/p", { code: "BEM10", plan: "GESTOR", interval: "MENSAL" })).data.erro).toMatch(/limite/);

    // pausar
    expect((await admin.call(couponOne.PATCH, "PATCH", "/c", { active: false }, { id: r.data.id })).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: { startsWith: "admin.coupon_" } } })).toBe(3);
    const ov = await subscriptionsOverview("30d", null);
    expect(ov.list[0]!.coupon?.code).toBe("BEM10");
  });

  it("convite de teste: soma dias, uma vez por pessoa, respeita o limite", async () => {
    const r = await admin.call(invites.POST, "POST", "/i", { code: "amigo30", kind: "TRIAL", days: 30, maxUses: 1 });
    expect(r.status).toBe(201);
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: anaId } })).trialEndsAt!;
    const u1 = await ana.call(redeem.POST, "POST", "/r", { code: "AMIGO30" });
    expect(u1.status).toBe(200);
    expect(u1.data.label).toBe("30 dias de teste do Gestor");
    const after = (await prisma.user.findUniqueOrThrow({ where: { id: anaId } })).trialEndsAt!;
    expect(Math.round((after.getTime() - before.getTime()) / DAY)).toBe(30);
    expect((await ana.call(redeem.POST, "POST", "/r", { code: "AMIGO30" })).status).toBe(409);
    const bia = new Client();
    await bia.call(register.POST, "POST", "/r", { name: "Bia", email: "bia@x.test", password: "senha-forte-1" });
    const full = await bia.call(redeem.POST, "POST", "/r", { code: "AMIGO30" });
    expect(full.status).toBe(410);
    expect(full.data.erro).toMatch(/máximo/);
    expect((await bia.call(redeem.POST, "POST", "/r", { code: "NAOEXISTE" })).status).toBe(404);
    expect((await new Client().call(redeem.POST, "POST", "/r", { code: "AMIGO30" })).status).toBe(401);
  });

  it("convite de plano: dá a cortesia, tira o pedido de plano e não entra no MRR", async () => {
    const r = await admin.call(invites.POST, "POST", "/i", { code: "PARCEIRO", kind: "PLAN", plan: "GESTOR", interval: "MENSAL" });
    await prisma.user.update({ where: { id: anaId }, data: { planRequest: "PRO", planRequestedAt: new Date() } });
    expect((await ana.call(redeem.POST, "POST", "/r", { code: "parceiro" })).status).toBe(200);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: anaId } });
    expect(u).toMatchObject({ plan: "GESTOR", planInterval: "MENSAL", planRequest: null });
    const d = await adminDashboard("30d", new Date(Date.now() + 1000));
    expect(d.revenue).toMatchObject({ mrrCents: 0, payers: 0, courtesy: 1 });
    const ov = await subscriptionsOverview("30d", null);
    expect(ov.manual[0]!.planInviteRedemptions[0]!.invite.code).toBe("PARCEIRO");
    // pausado não pode mais ser usado
    await admin.call(inviteOne.PATCH, "PATCH", "/i", { active: false }, { id: r.data.id });
    const bia = new Client();
    await bia.call(register.POST, "POST", "/r", { name: "Bia", email: "bia@x.test", password: "senha-forte-1" });
    expect((await bia.call(redeem.POST, "POST", "/r", { code: "PARCEIRO" })).data.erro).toMatch(/não está ativo/);
  });

  it("ficha do usuário, extensão de teste, contato, recusa de pedido e pendências", async () => {
    expect((await admin.call(trial.POST, "POST", "/t", { days: 0 }, { id: anaId })).status).toBe(400);
    const t = await admin.call(trial.POST, "POST", "/t", { days: 7 }, { id: anaId });
    expect(t.status).toBe(200);
    await prisma.user.update({ where: { id: anaId }, data: { planRequest: "GESTOR", planRequestInterval: "ANUAL", planRequestedAt: new Date(Date.now() - 3 * DAY) } });
    expect((await admin.call(contact.POST, "POST", "/c", { channel: "whatsapp", reason: "request" }, { id: anaId })).status).toBe(200);

    const rec = await recoveryData();
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({ userId: anaId, kind: "request", contact: { channel: "whatsapp" } });

    let p = await adminPending();
    expect(p.items.find((i) => i.key === "planRequests")!.n).toBe(1);
    expect(p.nav["/admin/subscriptions"]).toBe(1);

    expect((await admin.call(plan.DELETE, "DELETE", "/p", undefined, { id: anaId })).status).toBe(200);
    expect((await admin.call(plan.DELETE, "DELETE", "/p", undefined, { id: anaId })).status).toBe(409);
    p = await adminPending();
    expect(p.items.find((i) => i.key === "planRequests")!.n).toBe(0);

    const d = (await userDetail(anaId))!;
    expect(d.phone).toBe("11987654321");
    expect(d.history.map((h) => h.action)).toEqual(expect.arrayContaining(["admin.trial_extend", "admin.contact", "admin.plan_request_reject", "user.register"]));
    expect(d.lastLogin).not.toBeNull();
    expect(await userDetail("nao-existe")).toBeNull();
  });

  it("checkout abandonado aparece nas pendências e na recuperação", async () => {
    await prisma.subscription.create({ data: { userId: anaId, plan: "PRO", interval: "MENSAL", amountCents: 1990, createdAt: new Date(Date.now() - 2 * DAY) } });
    await prisma.user.update({ where: { id: anaId }, data: { trialEndsAt: new Date(Date.now() - 20 * DAY) } });
    expect((await adminPending()).items.find((i) => i.key === "recovery")!.n).toBe(1);
    expect((await recoveryData())[0]).toMatchObject({ kind: "checkout", plan: "PRO" });
  });

  it("solicitações LGPD: lista com a conta ligada e muda a situação", async () => {
    const r = await prisma.privacyRequest.create({ data: { name: "Ana", email: "ana@x.test", kind: "ACCESS" } });
    await prisma.privacyRequest.create({ data: { name: "Fulano", email: "f@x.test", kind: "DELETION", createdAt: new Date(Date.now() - 20 * DAY) } });
    const l = await listPrivacyRequests(null);
    expect(l.counts.NEW).toBe(2);
    expect(l.items.find((i) => i.email === "ana@x.test")!.userId).toBe(anaId);
    expect(l.items.find((i) => i.email === "f@x.test")!.userId).toBeNull();
    expect((await adminPending()).nav["/admin/privacy"]).toBe(2);
    expect((await ana.call(privacyStatus.PATCH, "PATCH", "/p", { status: "DONE" }, { id: r.id })).status).toBe(403);
    expect((await admin.call(privacyStatus.PATCH, "PATCH", "/p", { status: "DONE" }, { id: r.id })).status).toBe(200);
    expect((await listPrivacyRequests("DONE")).items).toHaveLength(1);
  });

  it("conversão e todos os relatórios CSV", async () => {
    const c = await conversionData("30d", new Date(Date.now() + 1000));
    expect(c.funnel[0]!.count).toBe(1);
    expect(c.sources).toEqual([expect.objectContaining({ key: "E-mail e senha", signups: 1 })]);
    await admin.call(coupons.POST, "POST", "/c", { code: "CSV10", kind: "PERCENT", value: 10 });
    await admin.call(invites.POST, "POST", "/i", { code: "CSVINV", kind: "TRIAL", days: 5 });
    for (const r of REPORTS) {
      const res = await admin.call(exportRoute.GET, "GET", `/api/admin/export?kind=${r.kind}&p=7d`);
      expect(res.status, r.kind).toBe(200);
      expect(String(res.data).split("\n")[0], r.kind).toMatch(/;/);
    }
    expect((await admin.call(exportRoute.GET, "GET", "/api/admin/export?kind=senhas")).status).toBe(400);
    const signups = await admin.call(exportRoute.GET, "GET", "/api/admin/export?kind=signups&p=7d");
    expect(String(signups.data)).toContain("ana@x.test");
    expect(String((await admin.call(exportRoute.GET, "GET", "/api/admin/export?kind=coupons")).data)).toContain("CSV10");
  });
});
