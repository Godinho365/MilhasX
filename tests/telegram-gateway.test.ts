// Chat Balcões em tempo real (etapas 2 e 3): o gateway é o único que conecta no Telegram, grava o que chega (sem
// duplicar, edição fora de ordem ignorada, exclusão marcada), recupera o que perdeu numa queda e atende os pedidos do
// site pela rede interna. Telegram simulado: nada sai para o Telegram de verdade.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { prisma, DomainError } from "@/server/db";
import { encrypt } from "@/server/services/accounts";
import { chatMessages, sendToGroup, telegramChatMedia, sendTelegramChatFile, editGroupMessage, deleteGroupMessage, type TgPeer } from "@/server/services/telegram";
import { MemoryBus } from "@/gateway/bus";
import { FakeTelegram, lm, iso, waitFor, rpcErr } from "./fake-telegram";
import { Gateway } from "@/gateway/manager";
import { gatewayServer } from "@/gateway/server";
import { Router, catchUpChat, ingestDelete, ingestMessage, prune, type ChatTarget } from "@/gateway/store";
import { resetDb } from "./helpers";

process.env.TELEGRAM_API_ID ||= "1";
process.env.TELEGRAM_API_HASH ||= "teste";
process.env.CREDENTIALS_KEY ||= randomBytes(32).toString("base64");

const GROUP: TgPeer = { kind: "channel", id: "1234", hash: "h" };
const DM: TgPeer = { kind: "user", id: "77", hash: "h77" };
const FAST = { leaderEveryMs: 50, refreshEveryMs: 50, pingEveryMs: 60, pingTimeoutMs: 200, catchupEveryMs: 60_000, statusEveryMs: 1000, startTimeoutMs: 1000, backoffMs: [30, 60] };

let userId: string, linkId: string, groupId: string, dmId: string;
let tgFake: FakeTelegram, bus: MemoryBus, gw: Gateway | null;

beforeEach(async () => {
  await resetDb();
  const u = await prisma.user.create({ data: { name: "Ana", email: "ana@x.test", passwordHash: "x" } });
  userId = u.id;
  linkId = (await prisma.telegramLink.create({ data: { userId, sessionEnc: encrypt("ok:1"), status: "ACTIVE", phone: "+5511999998888" } })).id;
  groupId = (await prisma.telegramGroup.create({ data: { userId, linkId, groupId: "-1001234", title: "Balcão", peer: GROUP } })).id;
  dmId = (await prisma.telegramDm.create({ data: { userId, linkId, peerId: "77", peerHash: "h77", name: "Bia" } })).id;
  tgFake = new FakeTelegram();
  bus = new MemoryBus();
  gw = null;
});
afterEach(async () => {
  await gw?.stop();
  delete process.env.TG_GATEWAY_URL;
});

const target = (kind: "GROUP" | "DM", syncedUpTo: number | null = null): ChatTarget =>
  kind === "GROUP" ? { kind, id: groupId, userId, linkId, peer: GROUP, syncedUpTo } : { kind, id: dmId, userId, linkId, peer: DM, syncedUpTo };
const rows = (where: object = {}) => prisma.telegramMessage.findMany({ where, orderBy: { msgId: "asc" } });
const types = () => bus.published.map((p) => `${p.payload.type}:${p.payload.msgId}`);

describe("gravação: sem duplicar, edição fora de ordem e exclusão", () => {
  it("mensagem nova grava e avisa uma vez; repetida não avisa; edição nova atualiza; edição velha é ignorada", async () => {
    const chat = target("GROUP");
    expect(await ingestMessage(bus, chat, lm(10, "Compro 100k LATAM 25"), "new")).toBe("created");
    expect(await ingestMessage(bus, chat, lm(10, "Compro 100k LATAM 25"), "new")).toBe("same"); // listener + recuperação
    expect(await ingestMessage(bus, chat, lm(10, "Compro 100k LATAM 24", { editDate: iso(30) }), "edit")).toBe("updated");
    expect(await ingestMessage(bus, chat, lm(10, "Compro 100k LATAM 26", { editDate: iso(20) }), "edit")).toBe("same"); // chegou atrasada
    expect((await rows()).map((r) => [r.msgId, r.text])).toEqual([[10, "Compro 100k LATAM 24"]]);
    expect(types()).toEqual(["message.new:10", "message.edit:10"]);
    expect(bus.published[0]!.channel).toBe(`tg:user:${userId}`);
    // os eventos ficam no banco na mesma ordem (quem reconecta pede desde o id X)
    expect((await prisma.telegramEvent.findMany({ orderBy: { id: "asc" } })).map((e) => e.type)).toEqual(["message.new", "message.edit"]);
  });

  it("gravado antes de avisar: com o Redis fora a mensagem fica no banco e o evento também", async () => {
    bus.down = true;
    expect(await ingestMessage(bus, target("GROUP"), lm(11, "oi"), "new")).toBe("created");
    expect(await prisma.telegramEvent.count()).toBe(1);
    expect(bus.published).toEqual([]);
  });

  it("exclusão: no supergrupo só daquele chat; sem chat (privado) só do privado da conta", async () => {
    const router = new Router();
    await ingestMessage(bus, target("GROUP"), lm(5, "pedido"), "new");
    await ingestMessage(bus, target("DM"), lm(5, "oi no privado"), "new");
    await ingestMessage(bus, target("DM"), lm(6, "outra"), "new");
    expect(await ingestDelete(bus, router, linkId, null, [5])).toBe(1); // privado: o 5 do supergrupo fica
    expect((await rows({ deletedAt: null })).map((r) => [r.groupId ? "G" : "D", r.msgId])).toEqual([["G", 5], ["D", 6]]);
    expect(await ingestDelete(bus, router, linkId, "-1001234", [5, 6])).toBe(1); // supergrupo: só o 5 dele
    expect(await ingestDelete(bus, router, linkId, "-1009999", [6])).toBe(0); // grupo que o app não acompanha
    expect(types().filter((t) => t.startsWith("message.delete"))).toEqual(["message.delete:5", "message.delete:5"]);
  });

  it("limpeza: eventos velhos e mensagens além do prazo de guarda", async () => {
    await ingestMessage(bus, target("GROUP"), lm(1, "velha", { date: new Date(Date.now() - 100 * 86_400_000).toISOString() }), "new");
    await ingestMessage(bus, target("GROUP"), lm(2, "nova", { date: new Date().toISOString() }), "new");
    await prisma.telegramEvent.updateMany({ where: { msgId: 1 }, data: { createdAt: new Date(Date.now() - 72 * 3600_000) } });
    expect(await prune(Date.now(), { messageDays: 90, eventHours: 48 })).toEqual({ events: 1, messages: 1 });
    expect((await rows()).map((r) => r.msgId)).toEqual([2]);
  });
});

describe("recuperação depois de uma queda", () => {
  it("primeira vez pega as 100 mais novas; depois enche o buraco em páginas, acerta editadas e marca apagadas", async () => {
    const live = tgFake.factory("ok:1");
    for (let i = 1; i <= 150; i++) tgFake.add(GROUP, lm(i, `msg ${i}`), false);
    const chat = target("GROUP");
    expect(await catchUpChat(bus, live, chat)).toEqual({ created: 100, updated: 0, deleted: 0 });
    expect(chat.syncedUpTo).toBe(150);
    expect((await prisma.telegramGroup.findUniqueOrThrow({ where: { id: groupId } })).syncedUpTo).toBe(150);

    // fora do ar: chegaram 330 (mais que as 100 de uma leitura), uma foi editada e uma apagada
    for (let i = 151; i <= 480; i++) tgFake.add(GROUP, lm(i, `msg ${i}`), false);
    tgFake.edit(GROUP, 150, "msg 150 editada", iso(59), false);
    tgFake.remove(GROUP, [149], false);
    const r = await catchUpChat(bus, live, chat);
    expect(r.created).toBe(330); // nenhuma perdida, nenhuma repetida
    expect(chat.syncedUpTo).toBe(480);
    expect(await prisma.telegramMessage.count({ where: { groupId, msgId: { gte: 151 } } })).toBe(330);
    // 149 e 150 estão fora das 100 mais novas: a recuperação só enxerga edição/exclusão dentro desse trecho
    tgFake.edit(GROUP, 470, "msg 470 editada", iso(59), false);
    tgFake.remove(GROUP, [471], false);
    expect(await catchUpChat(bus, live, chat)).toEqual({ created: 0, updated: 1, deleted: 1 });
    expect((await rows({ groupId, msgId: { in: [470, 471] } })).map((m) => [m.msgId, m.text, !!m.deletedAt])).toEqual([[470, "msg 470 editada", false], [471, "msg 471", true]]);
  });
});

describe("gateway: conexão permanente, eventos, reconexão e liderança", () => {
  it("conecta a conta, grava os eventos em ordem e só dos chats do app", async () => {
    gw = new Gateway({ factory: tgFake.factory, bus, timings: FAST });
    await gw.start();
    await waitFor(() => gw!.runner(linkId)?.status.state === "connected");
    tgFake.add(GROUP, lm(20, "Compro 50k LATAM 24"));
    tgFake.edit(GROUP, 20, "Compro 50k LATAM 23", iso(40));
    tgFake.add(DM, lm(21, "Fechado!"));
    tgFake.add({ kind: "channel", id: "9999", hash: "x" }, lm(22, "grupo que o app não acompanha"));
    await waitFor(async () => (await prisma.telegramMessage.count()) === 2 && (await rows({ msgId: 20 }))[0]?.text === "Compro 50k LATAM 23");
    expect(types().filter((t) => t.startsWith("message"))).toEqual(["message.new:20", "message.edit:20", "message.new:21"]);
    expect(bus.status.get(linkId)).toMatchObject({ state: "connected" });
    expect(bus.published.some((p) => p.payload.type === "status" && p.payload.state === "connected")).toBe(true);
  });

  it("queda de conexão: reconecta sozinho e recupera o que chegou enquanto estava fora, sem duplicar", async () => {
    gw = new Gateway({ factory: tgFake.factory, bus, timings: FAST });
    await gw.start();
    await waitFor(() => gw!.runner(linkId)?.status.state === "connected");
    tgFake.add(GROUP, lm(30, "antes da queda"));
    await waitFor(async () => (await prisma.telegramMessage.count({ where: { msgId: 30 } })) === 1);
    tgFake.failPing = true; // a rede cai
    await waitFor(() => gw!.runner(linkId)?.status.state === "backoff");
    tgFake.add(GROUP, lm(31, "durante a queda"), false); // ninguém conectado para receber
    tgFake.add(DM, lm(32, "no privado durante a queda"), false);
    tgFake.failPing = false;
    await waitFor(() => gw!.runner(linkId)?.status.state === "connected" && gw!.runner(linkId)!.status.reconnects >= 1);
    await waitFor(async () => (await prisma.telegramMessage.count()) === 3);
    expect((await rows()).map((r) => r.msgId)).toEqual([30, 31, 32]);
    expect(await prisma.telegramEvent.count({ where: { type: "message.new" } })).toBe(3);
    expect(tgFake.starts).toBeGreaterThanOrEqual(2);
  });

  it("reinício do gateway: o novo recupera do ponto em que o banco parou", async () => {
    gw = new Gateway({ factory: tgFake.factory, bus, timings: FAST });
    await gw.start();
    await waitFor(async () => (await prisma.telegramGroup.findUniqueOrThrow({ where: { id: groupId } })).syncedAt != null);
    await gw.stop();
    tgFake.add(GROUP, lm(40, "com o gateway parado"), false);
    gw = new Gateway({ factory: tgFake.factory, bus, timings: FAST });
    await gw.start();
    await waitFor(async () => (await prisma.telegramMessage.count({ where: { msgId: 40 } })) === 1);
  });

  it("sessão encerrada no Telegram: para de tentar (não fica reconectando)", async () => {
    tgFake.failStart = "AUTH_KEY_UNREGISTERED";
    gw = new Gateway({ factory: tgFake.factory, bus, timings: FAST });
    await gw.start();
    await waitFor(() => gw!.runner(linkId)?.status.state === "revoked");
    const n = tgFake.starts;
    await new Promise((r) => setTimeout(r, 200));
    expect(tgFake.starts).toBe(n);
  });

  it("só o líder conecta: com outro gateway segurando a trava, nada conecta e os pedidos esperam", async () => {
    bus.holder = "outro-gateway";
    gw = new Gateway({ factory: tgFake.factory, bus, timings: FAST });
    await gw.start();
    await new Promise((r) => setTimeout(r, 150));
    expect([gw.leader, tgFake.starts]).toEqual([false, 0]);
    await expect(gw.rpc(linkId, "messages", [GROUP, { limit: 10 }])).rejects.toMatchObject({ status: 503 });
    // o outro sai: este assume e conecta
    bus.holder = null;
    await waitFor(() => gw!.leader && gw!.runner(linkId)?.status.state === "connected");
  });

  it("conta desconectada no app: a conexão dela fecha", async () => {
    gw = new Gateway({ factory: tgFake.factory, bus, timings: FAST });
    await gw.start();
    await waitFor(() => gw!.runner(linkId)?.status.state === "connected");
    await prisma.telegramLink.delete({ where: { id: linkId } });
    await waitFor(() => !gw!.runner(linkId));
    expect(tgFake.listeners.size).toBe(0);
  });
});

describe("site pelo gateway (rede interna)", () => {
  async function serve() {
    gw = new Gateway({ factory: tgFake.factory, bus, timings: FAST });
    await gw.start();
    await waitFor(() => gw!.runner(linkId)?.status.state === "connected");
    const server = gatewayServer(gw).listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.TG_GATEWAY_URL = url;
    const stop = gw.stop.bind(gw);
    gw.stop = async () => { await stop(); server.close(); };
    return url;
  }

  it("lê, manda, edita e apaga pelo gateway; o que o app manda vira evento na hora", async () => {
    await serve();
    tgFake.add(GROUP, lm(50, "Compro 80k LATAM 25"));
    expect((await chatMessages(userId, groupId)).map((m) => [m.id, m.text, !!m.ad])).toEqual([[50, "Compro 80k LATAM 25", true]]);
    const sent = await sendToGroup(userId, groupId, "Faço 24", 50);
    expect(tgFake.calls).toContain("send -1001234 Faço 24");
    // gravado e avisado sem esperar o Telegram mandar o evento de volta
    expect((await rows({ msgId: sent.id })).map((r) => [r.out, r.text, r.replyTo])).toEqual([[true, "Faço 24", 50]]);
    expect(types()).toContain(`message.new:${sent.id}`);
    await editGroupMessage(userId, groupId, sent.id, "Faço 23,50");
    expect((await rows({ msgId: sent.id }))[0]!.text).toBe("Faço 23,50");
    await deleteGroupMessage(userId, groupId, sent.id);
    expect((await rows({ msgId: sent.id }))[0]!.deletedAt).not.toBeNull();
    expect(types().filter((t) => t.endsWith(`:${sent.id}`))).toEqual([`message.new:${sent.id}`, `message.edit:${sent.id}`, `message.delete:${sent.id}`]);
  });

  it("arquivos vão e voltam inteiros (base64 na rede interna)", async () => {
    await serve();
    const bytes = Buffer.from([0, 1, 2, 250, 255, 37, 80, 68, 70]);
    await sendTelegramChatFile(userId, groupId, { name: "bilhete.pdf", mime: "application/pdf", bytes });
    expect(tgFake.files).toEqual([{ name: "bilhete.pdf", size: bytes.length }]);
    const media = await telegramChatMedia(userId, groupId, 77);
    expect(media && [media.name, media.mime, Buffer.compare(media.bytes, Buffer.from("PDF-77-\u0000ÿ")) === 0]).toEqual(["bilhete-77.pdf", "application/pdf", true]);
  });

  it("erros do Telegram chegam ao site como antes: espera pedida vira 429; sessão encerrada tira a conta", async () => {
    await serve();
    tgFake.failMessages = rpcErr("FLOOD_WAIT_30", 30);
    await expect(chatMessages(userId, groupId)).rejects.toMatchObject({ status: 429, message: expect.stringMatching(/esperar 30 segundos/) });
    tgFake.failMessages = rpcErr("AUTH_KEY_UNREGISTERED");
    await expect(chatMessages(userId, groupId)).rejects.toMatchObject({ status: 409 });
    expect(await prisma.telegramLink.count()).toBe(0); // igual a antes do gateway: conecte de novo
  });

  it("sem o token certo o gateway recusa; gateway fora do ar vira 503 para o site", async () => {
    const url = await serve();
    const res = await fetch(`${url}/rpc`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ linkId, method: "messages", args: [GROUP, { limit: 1 }] }) });
    expect(res.status).toBe(401);
    expect(((await (await fetch(`${url}/health`)).json()) as { leader: boolean }).leader).toBe(true);
    process.env.TG_GATEWAY_URL = "http://127.0.0.1:1";
    const e = await chatMessages(userId, groupId).catch((x) => x);
    expect(e).toBeInstanceOf(DomainError);
    expect(e.status).toBe(503);
  });
});

describe("Redis de verdade (trava de líder e publicação)", () => {
  // keyspace 5: separado do que o gateway de produção usa; sem Redis local, o teste é pulado
  const url = process.env.TEST_REDIS_URL || "redis://127.0.0.1:6380/5";
  it("um líder por vez, renovação e publicação chegando a quem assina", async () => {
    const { RedisBus, userChannel } = await import("@/gateway/bus");
    const Redis = (await import("ioredis")).default;
    const probe = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 0, connectTimeout: 1500, retryStrategy: () => null });
    probe.on("error", () => {});
    const up = await probe.connect().then(() => true, () => false);
    probe.disconnect();
    if (!up) return; // sem Redis aqui: nada a testar
    const a = await RedisBus.connect(url);
    const b = await RedisBus.connect(url);
    const sub = new Redis(url);
    try {
      await a.release("gw-a"); await b.release("gw-b");
      expect(await a.leader("gw-a", 2000)).toBe(true);
      expect(await b.leader("gw-b", 2000)).toBe(false); // o outro espera
      expect(await a.leader("gw-a", 2000)).toBe(true); // renova
      await a.release("gw-a");
      expect(await b.leader("gw-b", 2000)).toBe(true); // assume quando o primeiro sai
      await b.release("gw-b");
      const got: string[] = [];
      await sub.subscribe(userChannel("u-teste"));
      sub.on("message", (_c, m) => got.push(m));
      await a.publish(userChannel("u-teste"), { type: "message.new", msgId: 1 });
      await waitFor(() => got.length === 1, 2000);
      expect(JSON.parse(got[0]!)).toEqual({ type: "message.new", msgId: 1 });
    } finally {
      sub.disconnect();
      await a.close();
      await b.close();
    }
  });
});
