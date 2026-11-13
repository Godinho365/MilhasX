// Privacidade: escolha de cookies (cookie versionado, conta para valer em todos os aparelhos) e o canal de pedidos
// dos titulares de dados (LGPD).
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as consentRoute from "@/app/api/consent/route";
import * as consentSync from "@/app/api/consent/sync/route";
import * as privacyRequests from "@/app/api/public/privacy-requests/route";
import { prisma } from "@/server/db";
import {
  CONSENT_COOKIE, CONSENT_VERSION, allows, consentCookieHeader, decodeConsent, encodeConsent, newConsent, newestConsent, storedConsent,
} from "@/domain/consent";
import { accountConsent } from "@/server/services/privacy";
import { THIRD_PARTY_SCRIPTS, loadThirdParty } from "@/components/consent/registry";

const cookieOf = (c: Client, name: string) => c.cookie.split("; ").find((p) => p.startsWith(`${name}=`)) ?? "";
/** O Client dos testes guarda um cookie só; aqui junta a sessão com o da escolha. */
const withCookies = (...pairs: string[]) => pairs.filter(Boolean).join("; ");

describe("escolha de cookies (domínio)", () => {
  it("sem escolha só os necessários valem; analíticos e marketing exigem escolha afirmativa", () => {
    expect(allows(null, "necessary")).toBe(true);
    expect(allows(null, "analytics")).toBe(false);
    expect(allows(null, "marketing")).toBe(false);
    const c = newConsent({ analytics: true, marketing: false });
    expect(allows(c, "analytics")).toBe(true);
    expect(allows(c, "marketing")).toBe(false);
  });

  it("o cookie guarda escolha, data e versão; outra versão do aviso ou valor estranho não vale", () => {
    const c = newConsent({ analytics: false, marketing: true }, Date.parse("2026-11-13T10:00:00.500Z"));
    expect(c.decidedAt).toBe("2026-11-13T10:00:00.000Z");
    const raw = encodeConsent(c);
    expect(raw).toMatch(new RegExp(`^${CONSENT_VERSION}\\.01\\.\\d+$`));
    expect(decodeConsent(raw)).toEqual(c);
    expect(decodeConsent(raw.replace(CONSENT_VERSION, "2020-01-01"))).toBeNull();
    expect(decodeConsent("lixo")).toBeNull();
    expect(decodeConsent(undefined)).toBeNull();
    expect(decodeConsent(`${CONSENT_VERSION}.11.${Math.floor(Date.now() / 1000) + 10 * 86400}`)).toBeNull(); // data no futuro
    expect(storedConsent({ ...c, version: "velha" })).toBeNull();
    expect(storedConsent(JSON.parse(JSON.stringify(c)))).toEqual(c);
  });

  it("vale a escolha mais recente; o Set-Cookie é HttpOnly e some ao limpar", () => {
    const old = newConsent({ analytics: true, marketing: true }, Date.now() - 60_000);
    const fresh = newConsent({ analytics: false, marketing: false });
    expect(newestConsent(old, fresh)).toBe(fresh);
    expect(newestConsent(fresh, old)).toBe(fresh);
    expect(newestConsent(null, old)).toBe(old);
    const h = consentCookieHeader(fresh, true);
    expect(h).toContain(`${CONSENT_COOKIE}=${encodeConsent(fresh)}`);
    expect(h).toContain("HttpOnly");
    expect(h).toContain("Secure");
    expect(consentCookieHeader(null, false)).toContain("Max-Age=0");
  });

  it("scripts de terceiros passam pelo registro central e respeitam a categoria", async () => {
    // hoje nenhuma ferramenta de analytics/marketing de terceiros está cadastrada
    expect(THIRD_PARTY_SCRIPTS.filter((s) => s.category !== "necessary")).toEqual([]);
    await expect(loadThirdParty("nao-existe", null)).rejects.toThrow(/não cadastrado/);
  });
});

describe("escolha de cookies (API)", () => {
  beforeEach(resetDb);
  it("sem login: grava só no navegador, com a escolha, a data e a versão", async () => {
    const c = new Client();
    const r = await c.call(consentRoute.POST, "POST", "/api/consent", { analytics: false, marketing: true });
    expect(r.status).toBe(200);
    expect(r.data.consent).toMatchObject({ version: CONSENT_VERSION, analytics: false, marketing: true });
    expect(decodeConsent(cookieOf(c, CONSENT_COOKIE).split("=")[1])).toMatchObject({ analytics: false, marketing: true });
    expect(await prisma.userPreference.count()).toBe(0);
    expect((await c.call(consentRoute.POST, "POST", "/api/consent", { analytics: "sim" })).status).toBe(400);
  });

  describe("logado", () => {
    let c: Client;
    let session: string;
    let userId: string;
    beforeEach(async () => {
      await resetDb();
      c = new Client();
      const r = await c.call(register.POST, "POST", "/r", { name: "Ana Souza", email: "ana@x.test", password: "senha-forte-1" });
      userId = r.data.user.id;
      session = c.cookie;
    });

    it("a escolha vai para a conta e chega a outro aparelho pela sincronização", async () => {
      await c.call(consentRoute.POST, "POST", "/api/consent", { analytics: true, marketing: false });
      expect(await accountConsent(userId)).toMatchObject({ analytics: true, marketing: false });

      // outro aparelho: só a sessão, sem o cookie da escolha
      const other = new Client();
      other.cookie = session;
      const s = await other.call(consentSync.POST, "POST", "/api/consent/sync");
      expect(s.data.consent).toMatchObject({ analytics: true, marketing: false });
      expect(decodeConsent(cookieOf(other, CONSENT_COOKIE).split("=")[1])).toMatchObject({ analytics: true, marketing: false });
    });

    it("a escolha feita antes do login (mais nova) passa para a conta; a mais velha não sobrescreve", async () => {
      const before = newConsent({ analytics: false, marketing: true });
      c.cookie = withCookies(session, `${CONSENT_COOKIE}=${encodeConsent(before)}`);
      const s = await c.call(consentSync.POST, "POST", "/api/consent/sync");
      expect(s.data.consent).toMatchObject({ analytics: false, marketing: true });
      expect(await accountConsent(userId)).toEqual(before);

      // um aparelho com uma escolha mais antiga recebe a da conta
      const stale = newConsent({ analytics: true, marketing: true }, Date.now() - 3600_000);
      const old = new Client();
      old.cookie = withCookies(session, `${CONSENT_COOKIE}=${encodeConsent(stale)}`);
      const s2 = await old.call(consentSync.POST, "POST", "/api/consent/sync");
      expect(s2.data.consent).toEqual(before);
      expect(await accountConsent(userId)).toEqual(before);
    });

    it("sem escolha em lugar nenhum, continua sem escolha (o aviso aparece)", async () => {
      const s = await c.call(consentSync.POST, "POST", "/api/consent/sync");
      expect(s.data.consent).toBeNull();
      expect(await accountConsent(userId)).toBeNull();
    });
  });
});

describe("pedidos de titulares (LGPD)", () => {
  beforeEach(resetDb);
  const body = { name: "Bia Lima", email: "Bia@X.test", kind: "ACCESS", message: "Quero uma cópia dos meus dados" };

  it("registra o pedido sem login, devolve só o protocolo e não guarda o IP", async () => {
    const c = new Client();
    const r = await c.call(privacyRequests.POST, "POST", "/api/public/privacy-requests", body);
    expect(r.status).toBe(201);
    expect(r.data).toEqual({ ok: true, protocol: expect.stringMatching(/^[A-Z0-9]{8}$/) });
    const row = await prisma.privacyRequest.findFirstOrThrow();
    expect(row).toMatchObject({ name: "Bia Lima", email: "bia@x.test", kind: "ACCESS", status: "NEW" });
    expect(row.ipHash).toMatch(/^[0-9a-f]{32}$/);
  });

  it("valida os campos e finge sucesso para robôs (campo armadilha)", async () => {
    const c = new Client();
    expect((await c.call(privacyRequests.POST, "POST", "/x", { ...body, kind: "QUALQUER" })).status).toBe(400);
    expect((await c.call(privacyRequests.POST, "POST", "/x", { ...body, email: "nao-é-email" })).status).toBe(400);
    const bot = await c.call(privacyRequests.POST, "POST", "/x", { ...body, website: "http://spam" });
    expect(bot.status).toBe(201);
    expect(await prisma.privacyRequest.count()).toBe(0);
  });

  it("limita envios repetidos do mesmo IP", async () => {
    const c = new Client();
    for (let i = 0; i < 5; i++) expect((await c.call(privacyRequests.POST, "POST", "/x", body)).status).toBe(201);
    expect((await c.call(privacyRequests.POST, "POST", "/x", body)).status).toBe(429);
  });
});
