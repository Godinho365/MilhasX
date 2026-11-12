// Chat Balcões em tempo real (etapas 4 e 5), de ponta a ponta com um Telegram simulado:
// Telegram → gateway → Postgres → Redis (simulado) → hub do site → WebSocket de verdade → "navegador".
// Cobre: mensagem nova/editada/apagada chegando sem recarregar, várias abas, quem pode abrir o WebSocket, reconexão
// recuperando o que perdeu ("desde o id X"), sem duplicadas, várias contas e grupos, leituras pelo banco e latência.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import { prisma } from "@/server/db";
import { encrypt } from "@/server/services/accounts";
import { chatMessages, chatPreviews, dmMessages, dmUnread, groupUnread, telegramEventsSince, type TgPeer } from "@/server/services/telegram";
import { RealtimeHub } from "@/server/realtime/hub";
import { authorizeUpgrade, wsUpgradeHandler } from "@/server/realtime/upgrade";
import { MemoryBus } from "@/gateway/bus";
import { Gateway } from "@/gateway/manager";
import { gatewayServer } from "@/gateway/server";
import * as register from "@/app/api/auth/register/route";
import * as eventsRoute from "@/app/api/telegram/events/route";
import { resetDb, Client } from "./helpers";
import { FakeTelegram, lm, iso, waitFor } from "./fake-telegram";

process.env.TELEGRAM_API_ID ||= "1";
process.env.TELEGRAM_API_HASH ||= "teste";
process.env.CREDENTIALS_KEY ||= randomBytes(32).toString("base64");

const ORIGIN = "http://app.teste";
const G1: TgPeer = { kind: "channel", id: "1234", hash: "h" };
const G2: TgPeer = { kind: "channel", id: "5678", hash: "h2" };
const DM: TgPeer = { kind: "user", id: "77", hash: "h77" };

/** Redis simulado: o que o gateway publica chega no assinante do site (como no Redis de verdade). */
class FakeSub extends EventEmitter {
  chans = new Set<string>();
  async subscribe(c: string) { this.chans.add(c); }
  async unsubscribe(c: string) { this.chans.delete(c); }
  deliver(c: string, m: string) { if (this.chans.has(c)) this.emit("message", c, m); }
}
class LoopBus extends MemoryBus {
  constructor(private sub: FakeSub) { super(); }
  override async publish(channel: string, payload: unknown) {
    await super.publish(channel, payload);
    this.sub.deliver(channel, JSON.stringify(payload));
  }
}

/** Uma aba do navegador: o WebSocket e os eventos que chegaram. */
class Tab {
  events: Record<string, unknown>[] = [];
  ws!: WebSocket;
  static async open(url: string, cookie: string, origin = ORIGIN) {
    const t = new Tab();
    t.ws = new WebSocket(`${url.replace("http", "ws")}/ws`, { headers: { cookie, origin } });
    t.ws.on("message", (d) => t.events.push(JSON.parse(String(d))));
    await new Promise<void>((resolve, reject) => { t.ws.once("open", () => resolve()); t.ws.once("unexpected-response", (_q, res) => reject(new Error(`HTTP ${res.statusCode}`))); t.ws.once("error", reject); });
    await waitFor(() => t.events.some((e) => e.type === "hello"));
    return t;
  }
  of(type: string) { return this.events.filter((e) => e.type === type); }
  close() { this.ws.close(); }
}

let c: Client, userId: string, cookie: string, linkA: string, linkB: string, g1: string, g2: string, dm: string;
let tg: FakeTelegram, sub: FakeSub, bus: LoopBus, gw: Gateway, hub: RealtimeHub, servers: Server[], webUrl: string;

beforeEach(async () => {
  await resetDb();
  process.env.APP_URL = ORIGIN;
  process.env.REALTIME_ENABLED = "true";
  c = new Client();
  userId = (await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" })).data.user.id;
  cookie = c.cookie;
  // duas contas do Telegram, cada uma com um grupo; uma conversa no privado
  linkA = (await prisma.telegramLink.create({ data: { userId, sessionEnc: encrypt("ok:a"), status: "ACTIVE", phone: "+5511999998888" } })).id;
  linkB = (await prisma.telegramLink.create({ data: { userId, sessionEnc: encrypt("ok:b"), status: "ACTIVE", phone: "+5521977776666" } })).id;
  g1 = (await prisma.telegramGroup.create({ data: { userId, linkId: linkA, groupId: "-1001234", title: "ASM", peer: G1 } })).id;
  g2 = (await prisma.telegramGroup.create({ data: { userId, linkId: linkB, groupId: "-1005678", title: "VIP", peer: G2 } })).id;
  dm = (await prisma.telegramDm.create({ data: { userId, linkId: linkA, peerId: "77", peerHash: "h77", name: "Bia" } })).id;

  tg = new FakeTelegram();
  sub = new FakeSub();
  bus = new LoopBus(sub);
  gw = new Gateway({ factory: tg.factory, bus, timings: { leaderEveryMs: 50, refreshEveryMs: 50, pingEveryMs: 60_000, catchupEveryMs: 60_000, statusEveryMs: 1000, startTimeoutMs: 1000, backoffMs: [30] } });
  servers = [];
  const gws = gatewayServer(gw).listen(0, "127.0.0.1");
  await new Promise((r) => gws.once("listening", r));
  servers.push(gws);
  process.env.TG_GATEWAY_URL = `http://127.0.0.1:${(gws.address() as AddressInfo).port}`;
  await gw.start();
  await waitFor(() => gw.runner(linkA)?.status.state === "connected" && gw.runner(linkB)?.status.state === "connected");
  await waitFor(async () => (await prisma.telegramGroup.count({ where: { syncedAt: { not: null } } })) === 2);

  // o site: só o WebSocket (o resto do Next não entra no teste)
  hub = new RealtimeHub(sub, async (ids) => Object.fromEntries(ids.map((id) => [id, { state: gw.runner(id)?.status.state ?? "unknown" }])), 200);
  const wss = new WebSocketServer({ noServer: true });
  const web = createServer((_q, res) => { res.statusCode = 404; res.end(); });
  web.on("upgrade", wsUpgradeHandler(wss, () => hub));
  web.listen(0, "127.0.0.1");
  await new Promise((r) => web.once("listening", r));
  servers.push(web);
  webUrl = `http://127.0.0.1:${(web.address() as AddressInfo).port}`;
});
afterEach(async () => {
  hub?.close();
  await gw?.stop();
  for (const s of servers) s.close();
  delete process.env.TG_GATEWAY_URL;
  delete process.env.REALTIME_ENABLED;
});

describe("quem pode abrir o WebSocket", () => {
  it("só com a sessão e vindo do próprio site; com o tempo real desligado, nada", async () => {
    await expect(Tab.open(webUrl, "")).rejects.toThrow(/HTTP 401/);
    await expect(Tab.open(webUrl, cookie, "https://outro-site.example")).rejects.toThrow(/HTTP 403/);
    const t = await Tab.open(webUrl, cookie);
    expect(t.of("hello")[0]).toMatchObject({ lastEventId: expect.any(String), links: { [linkA]: "connected", [linkB]: "connected" } });
    t.close();
    process.env.REALTIME_ENABLED = "false";
    expect(await authorizeUpgrade({ headers: { origin: ORIGIN, cookie } } as never)).toEqual({ status: 404 });
  });
});

describe("mensagens chegando sem recarregar", () => {
  it("nova, editada e apagada chegam em todas as abas, uma vez cada, de vários grupos e contas", async () => {
    const [t1, t2] = [await Tab.open(webUrl, cookie), await Tab.open(webUrl, cookie)];
    const sent = Date.now();
    tg.add(G1, lm(900, "Compro 100k LATAM 25"));
    tg.add(G2, lm(901, "Compro 50k Smiles 18"));
    tg.add(DM, lm(902, "Fechado, mando os dados"));
    await waitFor(() => t1.of("message.new").length === 3 && t2.of("message.new").length === 3);
    const elapsed = Date.now() - sent;
    // a ordem é garantida dentro de cada conta (fila própria); entre contas, cada uma no seu ritmo
    expect(t1.of("message.new").map((e) => [e.chatKind, e.chatId, e.msgId]).sort((a, b) => Number(a[2]) - Number(b[2]))).toEqual([["GROUP", g1, 900], ["GROUP", g2, 901], ["DM", dm, 902]]);
    expect(t2.of("message.new").map((e) => e.id)).toEqual(t1.of("message.new").map((e) => e.id)); // as duas abas, o mesmo evento
    expect(elapsed).toBeLessThan(1000);
    // a aba busca a mensagem no banco (sem perguntar ao Telegram)
    expect((await chatMessages(userId, g1, { minId: 899 })).map((m) => [m.id, m.text, !!m.ad])).toEqual([[900, "Compro 100k LATAM 25", true]]);

    tg.edit(G1, 900, "Compro 100k LATAM 24", iso(59));
    await waitFor(() => t1.of("message.edit").length === 1 && t2.of("message.edit").length === 1);
    expect((await chatMessages(userId, g1, { ids: [900] }))[0]!.text).toBe("Compro 100k LATAM 24");
    tg.remove(G1, [900]);
    await waitFor(() => t1.of("message.delete").length === 1);
    expect(await chatMessages(userId, g1, { ids: [900] })).toEqual([]);
    // nenhuma duplicada: um evento por mudança
    const ids = t1.events.filter((e) => e.id).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    t1.close(); t2.close();
  });

  it("checks de leitura no privado e status das contas chegam como evento", async () => {
    const t = await Tab.open(webUrl, cookie);
    for (const l of tg.listeners) l({ kind: "read", peerId: "77", maxId: 902, receivedAt: Date.now() });
    await waitFor(() => t.of("dm.read").length === 1);
    expect(t.of("dm.read")[0]).toMatchObject({ chatKind: "DM", chatId: dm, maxId: 902 });
    tg.failPing = true;
    await gw.runner(linkA)!.fail(new Error("rede caiu"));
    await waitFor(() => t.of("status").some((e) => e.linkId === linkA && e.state === "backoff"));
    t.close();
  });

  it("reconexão: o que chegou com a aba fora vem pelo 'desde o id X', sem perder nem repetir", async () => {
    const t = await Tab.open(webUrl, cookie);
    tg.add(G1, lm(910, "antes"));
    await waitFor(() => t.of("message.new").length === 1);
    const last = String(t.of("message.new")[0]!.id);
    t.close(); // a internet caiu
    tg.add(G1, lm(911, "durante 1"));
    tg.add(G2, lm(912, "durante 2"));
    await waitFor(async () => (await prisma.telegramMessage.count({ where: { msgId: { in: [911, 912] } } })) === 2);
    const r = await c.call(eventsRoute.GET, "GET", `/x?after=${last}`);
    // 911 e 912 são de contas diferentes (cada uma na sua fila): o que importa é não perder nem repetir
    expect(r.data.items.map((e: { msgId: number }) => e.msgId).sort()).toEqual([911, 912]);
    expect(r.data.reset).toBe(false);
    // de novo do mesmo ponto: o mesmo resultado (a aba descarta o que já viu pelo id)
    expect((await c.call(eventsRoute.GET, "GET", `/x?after=${r.data.lastId}`)).data.items).toEqual([]);
    // aba fora por muito tempo: a limpeza já apagou os eventos mais velhos que ela precisava → recarrega tudo
    await prisma.telegramEvent.deleteMany({ where: { id: { lte: BigInt(last) + 1n } } });
    expect((await telegramEventsSince(userId, last)).reset).toBe(true);
  });
});

describe("leituras pelo banco (sem consultar o Telegram)", () => {
  it("mensagens, não vistas do grupo e do privado vêm do que o gateway gravou", async () => {
    tg.add(G1, lm(920, "Compro 30k LATAM 26"));
    tg.add(G1, lm(921, "Faço 25", { out: true, sender: "Você" }));
    tg.add(DM, lm(922, "oi"));
    await waitFor(async () => (await prisma.telegramMessage.count({ where: { msgId: { in: [920, 921, 922] } } })) === 3);
    tg.failMessages = new Error("não devia perguntar ao Telegram");
    await prisma.telegramDm.update({ where: { id: dm }, data: { syncedAt: new Date() } });
    expect((await chatMessages(userId, g1, { minId: 919 })).map((m) => [m.id, m.sender])).toEqual([[920, "Bia"], [921, "Você"]]);
    expect((await dmMessages(userId, dm, { minId: 921 })).items.map((m) => m.text)).toEqual(["oi"]);
    // grupo nunca visto começa do zero; depois conta só as dos outros
    expect((await groupUnread(userId)).find((x) => x.id === g1)).toEqual({ id: g1, unread: 0 });
    tg.add(G1, lm(923, "Compro 80k LATAM 24"));
    tg.add(G1, lm(924, "Faço 23", { out: true, sender: "Você" }));
    await waitFor(async () => (await prisma.telegramMessage.count({ where: { msgId: { in: [923, 924] } } })) === 2);
    expect((await groupUnread(userId)).find((x) => x.id === g1)).toEqual({ id: g1, unread: 1 });
    await prisma.telegramDm.update({ where: { id: dm }, data: { seenUpTo: 900 } });
    expect((await dmUnread(userId)).find((x) => x.id === dm)).toMatchObject({ unread: 1, last: expect.objectContaining({ id: 922, text: "oi" }) });
    // lista de conversas: a última mensagem de cada uma (pedido lido; a sua aparece como "Você")
    const p = await chatPreviews(userId);
    expect(p.groups[g1]).toMatchObject({ sender: "Você", out: true, text: "Faço 23" });
    expect(p.dms[dm]).toMatchObject({ sender: "Bia", text: "oi", ad: null });
    tg.add(G1, lm(925, "Compro 60k LATAM 2 CPF 25"));
    await waitFor(async () => (await chatPreviews(userId)).groups[g1]?.ad?.miles === 60_000);
  });
});

describe("latência", () => {
  it("amostras das abas viram P50/P95; do Telegram até a aba fica abaixo de 1 s aqui", async () => {
    const t = await Tab.open(webUrl, cookie);
    const lat: number[] = [];
    for (let i = 0; i < 20; i++) {
      const at = Date.now();
      tg.add(G1, lm(930 + i, `pedido ${i}`));
      await waitFor(() => t.of("message.new").length === i + 1);
      lat.push(Date.now() - at);
      const e = t.of("message.new")[i]!;
      t.ws.send(JSON.stringify({ type: "lat", net: Number(e.relayAt) - Number(e.receivedAt), visible: Date.now() - Number(e.receivedAt) }));
    }
    lat.sort((a, b) => a - b);
    expect(lat[Math.floor(lat.length * 0.95)]!).toBeLessThan(1000);
    await waitFor(() => hub.stats().n === 20);
    expect(hub.stats()).toMatchObject({ n: 20, visibleP95: expect.any(Number) });
    expect(hub.stats().visibleP95!).toBeLessThan(1000);
    // relógio: o hub responde o ping com a hora dele (a aba acerta a diferença)
    t.ws.send(JSON.stringify({ type: "ping", t: 123 }));
    await waitFor(() => t.of("pong").length === 1);
    expect(t.of("pong")[0]).toMatchObject({ t: 123, server: expect.any(Number) });
    t.close();
  });
});
