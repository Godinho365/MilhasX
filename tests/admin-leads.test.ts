// Admin › Leads: origem do cadastro (utm), situação do lead, funil e cadastros não concluídos.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetDb, Client } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as googleStart from "@/app/api/auth/google/route";
import * as exportRoute from "@/app/api/admin/export/route";
import * as login from "@/app/api/auth/login/route";
import { loginWithGoogle } from "@/server/auth";
import { parseState } from "@/server/google-oauth";
import { leadsData } from "@/server/services/admin-leads";
import { createAdmin } from "../scripts/create-admin-lib";
import { prisma } from "@/server/db";
import { leadOrigin, leadStatus, leadFunnel, type AdminUser } from "@/domain/admin-metrics";

const NOW = new Date("2026-11-13T15:00:00Z");
const DAY = 86_400_000;
const user = (id: string, o: Partial<AdminUser> = {}): AdminUser => ({
  id, plan: "PESSOAL", planInterval: null, trialEndsAt: null, createdAt: NOW, planRequest: null, planRequestedAt: null, deletionRequestedAt: null, status: "ACTIVE", ...o,
});

describe("leads: regras", () => {
  it("origem: utm_source, anúncio do Meta, indicação ou direto", () => {
    expect(leadOrigin({ signupUtm: { utm_source: " Instagram ", utm_campaign: "black" } })).toEqual({ origin: "instagram", campaign: "black" });
    expect(leadOrigin({ signupUtm: { fbclid: "abc" } }).origin).toBe("facebook (anúncio)");
    expect(leadOrigin({ signupUtm: null, referredById: "u1" }).origin).toBe("Indicação de cliente");
    expect(leadOrigin({}).origin).toBe("Direto / sem origem");
  });

  it("situação: pagante, pediu plano, em teste, teste acabou e Pessoal", () => {
    const none = new Set<string>();
    expect(leadStatus(user("a", { plan: "PRO" }), none, none, NOW)).toBe("paid");
    expect(leadStatus(user("b"), new Set(["b"]), none, NOW)).toBe("paid");
    expect(leadStatus(user("c", { planRequest: "GESTOR" }), none, none, NOW)).toBe("asked");
    expect(leadStatus(user("d"), none, new Set(["d"]), NOW)).toBe("asked");
    expect(leadStatus(user("e", { trialEndsAt: new Date(NOW.getTime() + DAY) }), none, none, NOW)).toBe("trial");
    expect(leadStatus(user("f", { trialEndsAt: new Date(NOW.getTime() - DAY) }), none, none, NOW)).toBe("trial_over");
    expect(leadStatus(user("g"), none, none, NOW)).toBe("free");
  });

  it("funil com as 5 etapas e as taxas entre elas", () => {
    const f = leadFunnel({ started: 10, accounts: 8, used: 4, asked: 2, paid: 1 });
    expect(f.map((s) => s.count)).toEqual([10, 8, 4, 2, 1]);
    expect(f[1]!.pctOfPrev).toBe(80);
    expect(f[4]!.pctOfFirst).toBe(10);
    // sem código de e-mail (cadastro direto), a entrada é o número de contas
    expect(leadFunnel({ started: 0, accounts: 3, used: 0, asked: 0, paid: 0 })[0]!.count).toBe(3);
  });
});

describe("leads no banco", () => {
  beforeEach(resetDb);
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("o cadastro guarda só os utm_* válidos; o Google leva o utm e o convite no state", async () => {
    const r = await new Client().call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1", utm: { utm_source: "instagram", utm_campaign: "black", outro: "x" } });
    expect(r.status).toBe(201);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: "ana@x.test" } })).signupUtm).toEqual({ utm_source: "instagram", utm_campaign: "black" });
    await new Client().call(register.POST, "POST", "/r", { name: "Bia", email: "bia@x.test", password: "senha-forte-1" });
    expect((await prisma.user.findUniqueOrThrow({ where: { email: "bia@x.test" } })).signupUtm).toBeNull();

    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "csecret");
    const start = await googleStart.GET(new Request("http://localhost:3100/api/auth/google?mode=signin&utm_source=google&utm_medium=cpc&convite=amigo30"));
    const raw = start.headers.get("set-cookie")!.split(";")[0]!.split("=")[1]!;
    expect(parseState(raw)).toMatchObject({ mode: "signin", invite: "AMIGO30", utm: { utm_source: "google", utm_medium: "cpc" } });
    const { user: g } = await loginWithGoogle({ sub: "g1", email: "gu@x.test", emailVerified: true, name: "Gu" }, { allowCreate: true, utm: { utm_source: "google" } });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: g.id } })).signupUtm).toEqual({ utm_source: "google" });
  });

  it("junta contas e cadastros não concluídos, com origem, funil e CSV", async () => {
    await createAdmin({ email: "admin@x.test", name: "Admin", password: "senha-admin-123" });
    const reg = (name: string, email: string, utm?: Record<string, string>) => new Client().call(register.POST, "POST", "/r", { name, email, password: "senha-forte-1", phone: "11987654321", utm });
    const ana = (await reg("Ana", "ana@x.test", { utm_source: "instagram" })).data.user.id;
    await reg("Bia", "bia@x.test", { utm_source: "instagram" });
    await reg("Caio", "caio@x.test");
    await prisma.user.update({ where: { id: ana }, data: { plan: "PRO" } });
    await prisma.userPreference.updateMany({ where: { user: { email: "bia@x.test" } }, data: { notifications: { marketing: { email: true, push: false } } } });
    // pediu o código e não concluiu; e quem pediu e concluiu não conta como não concluído
    const exp = new Date(Date.now() + 600_000);
    await prisma.emailCode.createMany({ data: [
      { email: "sumiu@x.test", codeHash: "h", ip: "1.1.1.1", expiresAt: exp },
      { email: "caio@x.test", codeHash: "h", ip: "1.1.1.1", expiresAt: exp, usedAt: new Date() },
      { email: "velho@x.test", codeHash: "h", ip: "1.1.1.1", expiresAt: exp, createdAt: new Date(Date.now() - 60 * DAY) },
    ] });

    const d = await leadsData("30d", null, new Date(Date.now() + 1000));
    expect(d.total).toBe(4);
    expect(d.counts).toMatchObject({ unfinished: 1, paid: 1, trial: 2 });
    expect(d.marketing).toBe(1);
    expect(d.funnel.map((s) => s.count)).toEqual([4, 3, 0, 1, 1]);
    expect(d.origins[0]).toMatchObject({ origin: "instagram", leads: 2, paid: 1 });
    expect(d.origins[1]).toMatchObject({ origin: "Direto / sem origem", leads: 1 });
    expect(d.list.find((l) => l.status === "unfinished")).toMatchObject({ email: "sumiu@x.test", userId: null });
    expect((await leadsData("30d", "unfinished", new Date(Date.now() + 1000))).list).toHaveLength(1);
    expect((await leadsData("30d", "paid", new Date(Date.now() + 1000))).list.map((l) => l.email)).toEqual(["ana@x.test"]);

    const admin = new Client();
    await admin.call(login.POST, "POST", "/l", { email: "admin@x.test", password: "senha-admin-123" });
    const csv = String((await admin.call(exportRoute.GET, "GET", "/api/admin/export?kind=leads&p=30d")).data);
    expect(csv.split("\n")[0]).toContain("origem");
    expect(csv).toContain("sumiu@x.test");
    expect(csv).toContain("instagram");
  });
});
