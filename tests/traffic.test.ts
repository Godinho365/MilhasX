// Tráfego: períodos, as linhas do Meta (gasto em texto, conversas e leads), totais, UTM do link do anúncio, ligar
// pedidos às linhas; a conexão (link de autorização, state, troca de código, token criptografado, contas), o
// relatório com cópia e atualização, token vencido e limite do Meta, desconectar e as permissões. O Meta é simulado.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { resetDb, Client } from "./helpers";
import { prisma } from "@/server/db";
import { brDay } from "@/domain/brasilia";
import { addDays } from "@/domain/calendar";
import { apiRequirement } from "@/domain/permissions";
import {
  trafficRange, parseInsight, trafficTotals, pickUtm, fromMeta, attributeOrders, META_URL_PARAMS, type TrafficRow,
} from "@/domain/traffic";
import { MetaError, metaAuthUrl, parseMetaState, metaStateCookie } from "@/server/meta";
import { decrypt } from "@/server/services/accounts";
import { trafficState } from "@/server/services/traffic";
import * as register from "@/app/api/auth/register/route";
import * as salesProfile from "@/app/api/sales-profile/route";
import * as publicOrders from "@/app/api/public/orders/[slug]/route";
import * as traffic from "@/app/api/traffic/route";
import * as accountsRoute from "@/app/api/traffic/accounts/route";
import * as metaRoute from "@/app/api/traffic/meta/route";
import * as connect from "@/app/api/traffic/meta/connect/route";
import * as callback from "@/app/api/traffic/meta/callback/route";

process.env.CREDENTIALS_KEY ||= randomBytes(32).toString("base64");

describe("domínio", () => {
  it("períodos: hoje, ontem, 7 e 30 dias contando hoje; personalizado até hoje e até um ano", () => {
    const T = "2026-11-12";
    expect(trafficRange("hoje", T)).toEqual({ since: T, until: T });
    expect(trafficRange("ontem", T)).toEqual({ since: "2026-11-11", until: "2026-11-11" });
    expect(trafficRange("7", T)).toEqual({ since: "2026-11-06", until: T });
    expect(trafficRange("30", T)).toEqual({ since: "2026-10-14", until: T });
    expect(trafficRange("custom", T, { since: "2026-10-01", until: "2026-10-31" })).toEqual({ since: "2026-10-01", until: "2026-10-31" });
    expect(trafficRange("custom", T, { since: "2026-11-10", until: "2026-11-13" })).toBeNull(); // futuro
    expect(trafficRange("custom", T, { since: "2025-01-01", until: "2026-11-12" })).toBeNull(); // mais de um ano
    expect(trafficRange("custom", T, { since: "2026-11-10", until: "2026-11-01" })).toBeNull();
  });

  it("linha do Meta: gasto em texto vira centavos; conversas; leads pelo 'lead' ou pela soma; totais e médias", () => {
    const a = parseInsight({ campaign_id: "1", campaign_name: "Black Friday", spend: "150.50", impressions: "10000", reach: "8000", clicks: "400", inline_link_clicks: "300",
      actions: [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "12" }, { action_type: "lead", value: "5" }, { action_type: "onsite_conversion.lead_grouped", value: "4" }] }, "campaign", "act_1");
    expect(a).toMatchObject({ id: "1", name: "Black Friday", spendCents: 15050, impressions: 10000, reach: 8000, linkClicks: 300, conversations: 12, leads: 5, adsetId: null });
    const b = parseInsight({ campaign_id: "1", campaign_name: "BF", adset_id: "9", adset_name: "Mulheres 25-40", ad_id: "77", ad_name: "", spend: "10", impressions: "100",
      actions: [{ action_type: "onsite_conversion.lead_grouped", value: "2" }, { action_type: "offsite_conversion.fb_pixel_lead", value: "1" }] }, "ad", "act_1");
    expect(b).toMatchObject({ id: "77", name: "77", adsetId: "9", adsetName: "Mulheres 25-40", leads: 3, conversations: 0, linkClicks: 0 });
    const t = trafficTotals([{ ...a, orders: 2 }, { ...b, orders: 0 }]);
    expect(t).toMatchObject({ spendCents: 16050, impressions: 10100, linkClicks: 300, conversations: 12, leads: 8, orders: 2, ctr: 2.97, cpcCents: 54, costPerOrderCents: 8025, costPerConversationCents: 1338 });
    expect(trafficTotals([])).toMatchObject({ ctr: null, cpcCents: null, costPerLeadCents: null });
  });

  it("UTM: só as chaves conhecidas, de texto, URL ou objeto; do Meta pelo utm_source ou fbclid; liga pedidos às linhas", () => {
    expect(pickUtm("?utm_source=meta&utm_campaign=123&x=1&utm_content=%20777%20")).toEqual({ utm_source: "meta", utm_campaign: "123", utm_content: "777" });
    expect(pickUtm(new URLSearchParams("fbclid=abc"))).toEqual({ fbclid: "abc" });
    expect(pickUtm({ utm_term: "9", other: "x", utm_medium: 5 })).toEqual({ utm_term: "9" });
    expect(pickUtm("?a=1")).toBeNull();
    expect([fromMeta({ utm_source: "Instagram" }), fromMeta({ fbclid: "x" }), fromMeta({ utm_source: "google" }), fromMeta(null)]).toEqual([true, true, false, false]);
    expect(META_URL_PARAMS).toContain("utm_content={{ad.id}}");
    const row = (o: Partial<TrafficRow>): TrafficRow => ({ level: "campaign", id: "", name: "", accountId: "act_1", campaignId: "", campaignName: "", adsetId: null, adsetName: null, spendCents: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0, conversations: 0, leads: 0, orders: 0, ...o });
    const camp = attributeOrders([row({ id: "c1", name: "Black Friday" }), row({ id: "c2", name: "Remarketing" })], [
      { utm_source: "meta", utm_campaign: "c1" }, { utm_source: "facebook", utm_campaign: "remarketing" }, { fbclid: "z" }, { utm_source: "google", utm_campaign: "c1" }, null,
    ]);
    expect(camp.rows.map((r) => r.orders)).toEqual([1, 1]);
    expect([camp.meta, camp.matched]).toEqual([3, 2]);
    const ads = attributeOrders([row({ level: "ad", id: "777" }), row({ level: "ad", id: "778" })], [{ utm_source: "meta", utm_content: "777" }, { utm_source: "meta", utm_content: "777" }, { utm_source: "meta", utm_term: "9" }]);
    expect(ads.rows.map((r) => r.orders)).toEqual([2, 0]);
    const sets = attributeOrders([row({ level: "adset", id: "9" })], [{ utm_source: "meta", utm_term: "9" }]);
    expect(sets.rows[0]!.orders).toBe(1);
  });

  it("link de autorização, state amarrado à conta e erros do Meta", () => {
    vi.stubEnv("META_APP_ID", "123"); vi.stubEnv("META_APP_SECRET", "s3cr3t");
    const u = new URL(metaAuthUrl(new Request("http://localhost:3100/x"), "abc"));
    expect(u.origin + u.pathname).toBe("https://www.facebook.com/v26.0/dialog/oauth");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ client_id: "123", state: "abc", scope: "ads_read", response_type: "code" });
    expect(u.searchParams.get("redirect_uri")).toMatch(/\/api\/traffic\/meta\/callback$/);
    const cookie = metaStateCookie({ state: "abc", userId: "u1" });
    expect(cookie).toContain("Path=/api/traffic/meta; HttpOnly; SameSite=Lax; Max-Age=600");
    expect(parseMetaState(cookie.split(";")[0]!.split("=")[1]!)).toEqual({ state: "abc", userId: "u1" });
    expect(parseMetaState("lixo")).toBeNull();
    expect([new MetaError("x", 190, 400).expired, new MetaError("x", 17, 400).limited, new MetaError("x", 80004, 400).limited, new MetaError("x", 100, 400).limited]).toEqual([true, true, true, false]);
    vi.unstubAllEnvs();
  });

  it("permissões: ver o painel é ver Marketing; conectar e desconectar é editar", () => {
    expect(apiRequirement("/api/traffic", "GET")).toEqual({ area: "marketing", level: "view" });
    expect(apiRequirement("/api/traffic/meta/connect", "GET")).toEqual({ area: "marketing", level: "edit" });
    expect(apiRequirement("/api/traffic/meta/callback", "GET")).toEqual({ area: "marketing", level: "edit" });
    expect(apiRequirement("/api/traffic/accounts", "PATCH")).toEqual({ area: "marketing", level: "edit" });
  });
});

/* ---------------- Meta simulado ---------------- */

const fake = vi.hoisted(() => ({ calls: [] as string[], error: null as null | { code: number; message: string }, accounts: [] as object[] }));
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
function metaFetch(input: string | URL | Request, init?: RequestInit) {
  const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  fake.calls.push(`${init?.method ?? "GET"} ${u.pathname}${u.searchParams.get("after") ? "#2" : ""}`);
  if (u.pathname.endsWith("/oauth/access_token")) return json(u.searchParams.get("grant_type") === "fb_exchange_token" ? { access_token: "LONG-TOKEN", expires_in: 5_184_000 } : { access_token: "SHORT-TOKEN" });
  if (u.pathname.endsWith("/me")) return json({ id: "fb1", name: "Ana no Facebook" });
  if (u.pathname.endsWith("/me/adaccounts")) return json({ data: fake.accounts });
  if (u.pathname.endsWith("/me/permissions")) return json({ success: true });
  if (u.pathname.endsWith("/insights")) {
    if (fake.error) return json({ error: fake.error }, 400);
    if (!u.searchParams.get("appsecret_proof") || u.searchParams.get("access_token") !== "LONG-TOKEN") return json({ error: { code: 190, message: "token" } }, 400);
    if (u.searchParams.get("after")) return json({ data: [{ campaign_id: "c2", campaign_name: "Remarketing", spend: "49.50", impressions: "5000", reach: "3000", clicks: "100", inline_link_clicks: "80", actions: [{ action_type: "onsite_conversion.lead_grouped", value: "2" }, { action_type: "offsite_conversion.fb_pixel_lead", value: "1" }] }] });
    return json({
      data: [{ campaign_id: "c1", campaign_name: "Black Friday", spend: "150.50", impressions: "10000", reach: "8000", clicks: "400", inline_link_clicks: "300", actions: [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "12" }, { action_type: "lead", value: "5" }] }],
      paging: { next: `${u.origin}${u.pathname}?${new URLSearchParams({ access_token: "LONG-TOKEN", appsecret_proof: "p", after: "X" })}` },
    });
  }
  return json({ error: { code: 100, message: "desconhecido" } }, 400);
}

let c: Client, userId: string;
beforeEach(async () => {
  await resetDb();
  fake.calls.length = 0; fake.error = null;
  fake.accounts = [
    { id: "act_1", name: "Agência Ana", currency: "BRL", account_status: 1 }, { id: "act_2", name: "Antiga", currency: "BRL", account_status: 2 },
    { id: "act_3", name: "Clientes", currency: "BRL", account_status: 1 }, { id: "act_4", name: "Testes", currency: "BRL", account_status: 1 }, { id: "act_5", name: "Extra", currency: "USD", account_status: 1 },
  ];
  vi.stubEnv("META_APP_ID", "123"); vi.stubEnv("META_APP_SECRET", "s3cr3t");
  vi.stubGlobal("fetch", vi.fn(metaFetch));
  c = new Client();
  userId = (await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" })).data.user.id;
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function connectMeta() {
  const start = await connect.GET(new Request("http://localhost:3100/api/traffic/meta/connect", { headers: { cookie: c.cookie } }));
  expect(start.status).toBe(303);
  expect(start.headers.get("location")).toMatch(/^https:\/\/www\.facebook\.com\/v26\.0\/dialog\/oauth\?/);
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  const stateCookie = start.headers.get("set-cookie")!.split(";")[0]!;
  return { state, stateCookie };
}
const back = (state: string, cookie: string, extra = "") =>
  callback.GET(new Request(`http://localhost:3100/api/traffic/meta/callback?code=CODE&state=${state}${extra}`, { headers: { cookie } }));

describe("conexão", () => {
  it("conecta: state conferido, token de longa duração criptografado, contas e as 3 primeiras ativas escolhidas", async () => {
    expect((await trafficState(userId)).connection).toBeNull();
    const { state, stateCookie } = await connectMeta();
    // state errado ou sem o cookie: não conecta
    expect((await back("outro", `${c.cookie}; ${stateCookie}`)).headers.get("location")).toContain("erro=");
    expect((await back(state, c.cookie)).headers.get("location")).toContain("erro=");
    expect((await back(state, `${c.cookie}; ${stateCookie}`, "&error=access_denied")).headers.get("location")).toContain(encodeURIComponent("Conexão com o Facebook cancelada"));
    const ok = await back(state, `${c.cookie}; ${stateCookie}`);
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toBe("/app/marketing/trafego?conectado=5");
    expect(ok.headers.get("set-cookie")).toContain("mm_meta=; Path=/api/traffic/meta");
    const row = await prisma.trafficConnection.findUniqueOrThrow({ where: { userId } });
    expect(row.tokenEnc).not.toContain("LONG-TOKEN");
    expect(decrypt(row.tokenEnc)).toBe("LONG-TOKEN");
    expect(row.selected).toEqual(["act_1", "act_3", "act_4"]);
    expect(row.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 59 * 86_400_000);
    const st = await trafficState(userId);
    expect(st).toMatchObject({ enabled: true, connection: { name: "Ana no Facebook", status: "OK", selected: ["act_1", "act_3", "act_4"] } });
    expect(JSON.stringify(st)).not.toContain("LONG-TOKEN");
    // outra conta não usa o state desta
    const o = new Client();
    await o.call(register.POST, "POST", "/r", { name: "Outro", email: "o@x.test", password: "senha-forte-2" });
    const again = await connectMeta();
    expect((await back(again.state, `${o.cookie}; ${again.stateCookie}`)).headers.get("location")).toContain("erro=");
    // contas: até 3 e só as que existem
    expect((await c.call(accountsRoute.PATCH, "PATCH", "/x", { selected: ["act_1", "act_3", "act_4", "act_5"] })).status).toBe(400);
    expect((await c.call(accountsRoute.PATCH, "PATCH", "/x", { selected: ["act_99"] })).status).toBe(404);
    expect((await c.call(accountsRoute.PATCH, "PATCH", "/x", { selected: ["act_5", "act_1"] })).data.selected).toEqual(["act_5", "act_1"]);
  });

  it("sem o app do Meta configurado: o painel avisa e conectar volta com erro", async () => {
    vi.stubEnv("META_APP_ID", "");
    expect((await trafficState(userId)).enabled).toBe(false);
    const r = await connect.GET(new Request("http://localhost:3100/api/traffic/meta/connect", { headers: { cookie: c.cookie } }));
    expect(r.headers.get("location")).toContain("/app/marketing/trafego?erro=");
  });
});

describe("relatório", () => {
  it("campanhas com paginação, pedidos pela página ligados pelo UTM, cópia, atualizar, limite e token vencido; desconectar", async () => {
    const { state, stateCookie } = await connectMeta();
    await back(state, `${c.cookie}; ${stateCookie}`);
    await c.call(accountsRoute.PATCH, "PATCH", "/x", { selected: ["act_1"] });
    // pedidos pela página (Central publicada) com e sem os parâmetros do anúncio
    await c.call(salesProfile.PATCH, "PATCH", "/api/sales-profile", { slug: "ana-milhas", published: true });
    const order = { customerName: "Cliente", customerPhone: "11988887777", tripType: "ONE_WAY", cabin: "ECONOMY", segments: [{ origin: "GRU", destination: "LIS", date: null }], adults: 1, children: 0, infants: 0 };
    const pub = (utm: object | null, ip: string) => publicOrders.POST(new Request("http://localhost:3100/x", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ ...order, utm }) }), { params: Promise.resolve({ slug: "ana-milhas" }) });
    expect((await pub({ utm_source: "meta", utm_campaign: "c1", utm_content: "777", other: "fica de fora" }, "1.1.1.1")).status).toBe(201);
    await pub({ utm_source: "facebook", utm_campaign: "Remarketing" }, "1.1.1.2");
    await pub({ fbclid: "xyz" }, "1.1.1.3");
    await pub(null, "1.1.1.4");
    const saved = await prisma.travelOrder.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { utm: true } });
    expect(saved.map((o) => o.utm)).toEqual([{ utm_source: "meta", utm_campaign: "c1", utm_content: "777" }, { utm_source: "facebook", utm_campaign: "Remarketing" }, { fbclid: "xyz" }, null]);

    const r = await c.call(traffic.GET, "GET", "/api/traffic?periodo=7&nivel=campaign");
    expect(r.status).toBe(200);
    expect(r.data.range).toEqual({ since: addDays(brDay(), -6), until: brDay() });
    expect(r.data.rows.map((x: TrafficRow) => [x.name, x.spendCents, x.orders])).toEqual([["Black Friday", 15050, 1], ["Remarketing", 4950, 1]]);
    expect(r.data.totals).toMatchObject({ spendCents: 20000, linkClicks: 380, conversations: 12, leads: 8, orders: 2, costPerOrderCents: 10000 });
    expect(r.data.orders).toEqual({ page: 4, meta: 3, matched: 2 });
    expect(r.data.currencies).toEqual(["BRL"]);
    expect(fake.calls.filter((x) => x.includes("/insights"))).toEqual(["GET /v26.0/act_1/insights", "GET /v26.0/act_1/insights#2"]);

    // a cópia vale: não chama de novo; "atualizar" chama
    await c.call(traffic.GET, "GET", "/api/traffic?periodo=7&nivel=campaign");
    expect(fake.calls.filter((x) => x.includes("/insights"))).toHaveLength(2);
    await c.call(traffic.GET, "GET", "/api/traffic?periodo=7&nivel=campaign&atualizar=1");
    expect(fake.calls.filter((x) => x.includes("/insights"))).toHaveLength(4);
    expect((await c.call(traffic.GET, "GET", "/api/traffic?periodo=custom&de=2020-01-01&ate=2026-01-01")).status).toBe(400);

    fake.error = { code: 17, message: "User request limit reached" };
    expect((await c.call(traffic.GET, "GET", "/api/traffic?periodo=30&nivel=ad")).status).toBe(429);
    fake.error = { code: 190, message: "Error validating access token" };
    const exp = await c.call(traffic.GET, "GET", "/api/traffic?periodo=30&nivel=adset");
    expect([exp.status, exp.data.erro]).toEqual([409, "A conexão com o Meta venceu. Conecte de novo."]);
    expect((await trafficState(userId)).connection!.status).toBe("EXPIRED");
    expect((await c.call(traffic.GET, "GET", "/api/traffic?periodo=7&nivel=campaign")).status).toBe(409);

    expect((await c.call(metaRoute.DELETE, "DELETE", "/x")).status).toBe(200);
    expect(fake.calls).toContain("DELETE /v26.0/me/permissions");
    expect(await prisma.trafficConnection.count()).toBe(0);
    expect(await prisma.trafficReport.count()).toBe(0);
    expect((await c.call(traffic.GET, "GET", "/api/traffic")).status).toBe(404);
  });
});
