import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetDb, Client } from "./helpers";
import { prisma, flushPushes } from "@/server/db";
import { testPushes } from "@/server/push";
import * as register from "@/app/api/auth/register/route";
import * as push from "@/app/api/push/route";
import * as pushTest from "@/app/api/push/test/route";
import * as prefs from "@/app/api/preferences/route";
import { apiRequirement } from "@/domain/permissions";

const sub = (n = 1) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/aparelho-${n}`, keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } });

async function login(email = "ana@exemplo.test") {
  const c = new Client();
  const r = await c.call(register.POST, "POST", "/api/auth/register", { name: "Ana", email, password: "senha-forte-1", acceptTerms: true });
  return { c, userId: r.data.user?.id ?? (await prisma.user.findUniqueOrThrow({ where: { email } })).id };
}

beforeEach(async () => {
  await resetDb();
  testPushes.length = 0;
  vi.stubEnv("VAPID_PUBLIC_KEY", "chave-publica-de-teste");
});
afterEach(() => vi.unstubAllEnvs());

describe("aparelhos com push", () => {
  it("precisa estar logado e do servidor configurado", async () => {
    expect((await new Client().call(push.POST, "POST", "/api/push", sub())).status).toBe(401);
    const { c } = await login();
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    expect((await c.call(push.POST, "POST", "/api/push", sub())).status).toBe(503);
  });

  it("guarda, atualiza o mesmo aparelho e apaga", async () => {
    const { c, userId } = await login();
    expect((await c.call(push.POST, "POST", "/api/push", sub())).data).toMatchObject({ ok: true, devices: 1 });
    expect((await c.call(push.POST, "POST", "/api/push", sub())).data.devices).toBe(1);
    expect((await c.call(push.POST, "POST", "/api/push", sub(2))).data.devices).toBe(2);
    await c.call(push.DELETE, "DELETE", "/api/push", { endpoint: sub().endpoint });
    expect(await prisma.pushSubscription.count({ where: { userId } })).toBe(1);
  });

  it("recusa endereço que não é https", async () => {
    const { c } = await login();
    expect((await c.call(push.POST, "POST", "/api/push", { ...sub(), endpoint: "http://exemplo.test/x" })).status).toBe(400);
  });

  it("teste: sem aparelho avisa; com aparelho envia", async () => {
    const { c } = await login();
    expect((await c.call(pushTest.POST, "POST", "/api/push/test", {})).status).toBe(404);
    await c.call(push.POST, "POST", "/api/push", sub());
    const r = await c.call(pushTest.POST, "POST", "/api/push/test", {});
    expect(r.data).toMatchObject({ ok: true, sent: 1 });
    expect(testPushes[0]!.payload.title).toBe("Notificações ativadas");
  });

  it("membro da equipe também pode ativar no aparelho dele", () => {
    expect(apiRequirement("/api/push", "POST")).toBe("any");
    expect(apiRequirement("/api/push/test", "POST")).toBe("any");
  });
});

describe("avisos do sino viram push", () => {
  it("só nas categorias com Push no celular ligado", async () => {
    const { c, userId } = await login();
    await c.call(push.POST, "POST", "/api/push", sub());
    await prisma.notification.create({ data: { userId, category: "points", title: "Saldo abaixo do mínimo", body: "Smiles com 100 pontos" } });
    await flushPushes();
    expect(testPushes).toHaveLength(0);

    await c.call(prefs.PATCH, "PATCH", "/api/preferences", { notifications: { points: { push: true } } });
    await prisma.notification.create({ data: { userId, category: "points", title: "Saldo abaixo do mínimo", body: "Smiles com 100 pontos" } });
    await prisma.notification.create({ data: { userId, category: "marketing", title: "Novidade", body: "x" } });
    await flushPushes();
    expect(testPushes.map((p) => p.payload.title)).toEqual(["Saldo abaixo do mínimo"]);
  });

  it("aviso sem categoria conta como Sistema; createMany também envia", async () => {
    const { c, userId } = await login();
    await c.call(push.POST, "POST", "/api/push", sub());
    await c.call(prefs.PATCH, "PATCH", "/api/preferences", { notifications: { system: { push: true } } });
    await prisma.notification.createMany({ data: [{ userId, title: "Pedido de plano", body: "a" }, { userId, title: "Novo pedido", body: "b" }] });
    await flushPushes();
    expect(testPushes.map((p) => p.payload.title).sort()).toEqual(["Novo pedido", "Pedido de plano"]);
  });
});
